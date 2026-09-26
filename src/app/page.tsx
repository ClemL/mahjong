"use client";

import { useState } from "react";
import { useMahjong } from "@/hooks/useMahjong";
import { SEAT_NAMES, type Seat, nextSeat, tileGlyph } from "@/game/tiles";
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

export default function Page() {
  const api = useMahjong(0);
  const appearance = useAppearance();
  const { state } = api;
  const [film, setFilm] = useState(false);

  if (!state) {
    return (
      <main className="app">
        <div className="panel">Shuffling the wall…</div>
        <BuildFooter />
      </main>
    );
  }

  // Seated from the player's point of view: you at the bottom, play passing to
  // your right, as at a real table.
  const me = api.humanSeat;
  const right = nextSeat(me, 1);
  const top = nextSeat(me, 2);
  const left = nextSeat(me, 3);
  // Discards listed in turn order starting from you.
  const pondOrder: Seat[] = [me, right, top, left];

  return (
    <main className="app">
      <header className="topbar">
        <h1 className="topbar__title">
          <span>麻雀</span>Hong Kong Mahjong
        </h1>
        <div className="stat">
          <span className="stat__label">Round</span>
          <span className="stat__value">
            {tileGlyph(state.roundWind)} East · hand {state.handNumber}
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
          <a className="btn btn--sm" href="/room/TABLE">
            Play together
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
            <PlayerHand api={api} />
          </div>
        </div>

        <aside className="side">
          <ScorePanel state={state} />
          <HistoryPanel state={state} />
          <LogPanel state={state} humanSeat={me} />
        </aside>
      </div>

      <ResultModal state={state} onNextHand={api.nextHand} onNewGame={api.newGame} />

      {film ? <FilmDialog onClose={() => setFilm(false)} /> : null}

      <BuildFooter />
    </main>
  );
}
