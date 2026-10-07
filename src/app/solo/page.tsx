"use client";

import { useState } from "react";
import { type MahjongApi, useMahjong } from "@/hooks/useMahjong";
import type { GameState } from "@/game/engine";
import { type RoomView, dealShowMs } from "@/game/room";
import { SEAT_NAMES, type Seat, nextSeat, roundName, tileGlyph } from "@/game/tiles";
import { useSoloTable } from "@/hooks/useSoloTable";
import { type TabletDisplay, useTabletDisplay } from "@/hooks/useLocalSetting";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { Felt, useResultSheet } from "@/components/TableTop";
import { SeatPanel } from "@/components/SeatPanel";
import { Pond } from "@/components/Pond";
import { PlayerHand } from "@/components/PlayerHand";
import { ResultModal } from "@/components/ResultModal";
import { BuildFooter } from "@/components/BuildFooter";
import { AppearancePanel } from "@/components/AppearancePanel";
import { PlayPanel } from "@/components/PlayPanel";
import { GamePanel } from "@/components/GamePanel";
import { SettingsMenu } from "@/components/SettingsMenu";
import { FilmDialog } from "@/components/FilmPlayer";
import { useAppearance } from "@/hooks/useAppearance";
import {
  FaanPanel,
  HistoryPanel,
  LogPanel,
  RulesPanel,
  ScorePanel,
} from "@/components/SidePanels";

/**
 * Wide enough for the felt. Below this the racks along the sides leave the
 * ponds no room, so a phone held upright keeps the compact grid.
 */
const FELT_QUERY = "(min-width: 560px)";

/** The felt builds the wall and deals each hand; play waits for it, where it is shown. */
function feltDealMs(state: GameState): number {
  if (!window.matchMedia(FELT_QUERY).matches) return 0;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return 0;
  return dealShowMs(state);
}

export default function Page() {
  const api = useMahjong(0, { dealHoldMs: feltDealMs });
  const appearance = useAppearance();
  const display = useTabletDisplay();
  const view = useSoloTable(api);
  const onFelt = useMediaQuery(FELT_QUERY);
  const { state } = api;
  const [film, setFilm] = useState(false);

  if (!state || !view) {
    return (
      <main className="app">
        <div className="panel">Shuffling the wall…</div>
        <BuildFooter />
      </main>
    );
  }

  const me = api.humanSeat;

  return (
    <main className="app">
      <header className="topbar">
        <h1 className="topbar__title">
          {/* The way back to the start page, where the modes and settings are. */}
          <a href="/" className="topbar__home">
            <span>麻雀</span>Hong Kong Mahjong
          </a>
        </h1>
        <div className="stat">
          <span className="stat__label">Round</span>
          <span className="stat__value">
            {tileGlyph(state.roundWind)} {roundName(state.roundWind)} · hand {state.handNumber}
          </span>
        </div>
        <div className="stat">
          <span className="stat__label">Dealer</span>
          <span className="stat__value">{SEAT_NAMES[state.dealer]}</span>
        </div>
        <div className="stat">
          <span className="stat__label">Wall</span>
          <span className="stat__value">{state.wall.length}</span>
        </div>
        <div className="stat">
          <span className="stat__label">Your score</span>
          <span className="stat__value">
            {state.scores[me] > 0 ? `+${state.scores[me]}` : state.scores[me]}
          </span>
        </div>

        <span className="topbar__spacer" />

        <div className="actions">
          <button
            type="button"
            className="btn btn--sm btn--ghost"
            onClick={() => api.setPaused(!api.paused)}
            aria-pressed={api.paused}
          >
            {api.paused ? "Resume" : "Pause"}
          </button>
          <button type="button" className="btn btn--sm" onClick={api.newGame}>
            New game
          </button>
          <a className="btn btn--sm" href="/">
            Menu
          </a>
          {/* Nobody who has not played can tell what this table is for; four
              minutes of pictures does what a wall of rules cannot. */}
          <button
            type="button"
            className="btn btn--sm btn--primary topbar__film"
            onClick={() => setFilm(true)}
          >
            How to play
          </button>
          <SettingsMenu>
            <GamePanel api={api} />
            <PlayPanel api={api} />
            <AppearancePanel api={appearance} />
            <RulesPanel config={state.config} />
            <FaanPanel config={state.config} />
          </SettingsMenu>
        </div>
      </header>

      <div className="layout">
        {/* The same felt as the shared tablet, seen from your chair: you at
            the bottom, play passing to your right, your own tiles in your
            hand below the cloth. */}
        {onFelt ? <SoloFelt api={api} view={view} display={display} /> : <SoloGrid api={api} />}

        <aside className="side">
          <ScorePanel state={state} />
          <HistoryPanel state={state} />
          <LogPanel state={state} humanSeat={me} />
        </aside>
      </div>

      {/* On the felt each hand's result is laid over the cloth; the end of the
          round has its own summary either way. */}
      {state.phase === "gameOver" || !onFelt ? (
        <ResultModal state={state} onNextHand={api.nextHand} onNewGame={api.newGame} />
      ) : null}

      {film ? <FilmDialog onClose={() => setFilm(false)} /> : null}

      <BuildFooter />
    </main>
  );
}

function SoloFelt({ api, view, display }: { api: MahjongApi; view: RoomView; display: TabletDisplay }) {
  const sheet = useResultSheet(view);
  return (
    <div className="solo">
      <div className="solo__felt">
        {/* A new game is dealt from hand 1 again; a fresh felt sees it as a deal. */}
        <Felt
          key={api.game}
          view={view}
          display={display}
          sheet={sheet}
          onNextHand={api.nextHand}
          onSkipDeal={api.skipDeal}
        />
        {sheet.aside && api.state?.phase === "handOver" ? (
          <div className="solo__after">
            <button type="button" className="btn btn--sm" onClick={sheet.show}>
              Result
            </button>
            <button type="button" className="btn btn--sm btn--primary" onClick={api.nextHand}>
              Next hand
            </button>
          </div>
        ) : null}
      </div>
      <PlayerHand api={api} />
    </div>
  );
}

/**
 * The compact table for a phone held upright: the other three seats around a
 * shared pond, you at the bottom, play passing to your right.
 */
function SoloGrid({ api }: { api: MahjongApi }) {
  const state = api.state!;
  const me = api.humanSeat;
  const right = nextSeat(me, 1);
  const top = nextSeat(me, 2);
  const left = nextSeat(me, 3);
  // Discards listed in turn order starting from you.
  const pondOrder: Seat[] = [me, right, top, left];
  return (
    <div className="table">
      <div className="table__top">
        <SeatPanel state={state} seat={top} />
      </div>
      <div className="table__left">
        <SeatPanel state={state} seat={left} />
      </div>
      <div className="table__center">
        <Pond state={state} order={pondOrder} viewer={me} />
      </div>
      <div className="table__right">
        <SeatPanel state={state} seat={right} />
      </div>
      <div className="table__bottom">
        <PlayerHand api={api} showSets />
      </div>
    </div>
  );
}
