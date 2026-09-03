"use client";

import { useMahjong, type Speed } from "@/hooks/useMahjong";
import { SEAT_NAMES, type Seat, nextSeat, tileGlyph } from "@/game/tiles";
import { SeatPanel } from "@/components/SeatPanel";
import { Pond } from "@/components/Pond";
import { PlayerHand } from "@/components/PlayerHand";
import { ResultModal } from "@/components/ResultModal";
import { BuildFooter } from "@/components/BuildFooter";
import { AppearancePanel } from "@/components/AppearancePanel";
import { PlayPanel } from "@/components/PlayPanel";
import { useAppearance } from "@/hooks/useAppearance";
import {
  FaanPanel,
  HistoryPanel,
  LogPanel,
  RulesPanel,
  ScorePanel,
} from "@/components/SidePanels";
import { MIN_FAAN_CHOICES } from "@/game/rules";

const SPEEDS: Speed[] = ["slow", "normal", "fast"];

export default function Page() {
  const api = useMahjong(0);
  const appearance = useAppearance();
  const { state } = api;

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
          <label className="field">
            <span className="field__label">Min faan</span>
            <select
              className="field__select"
              value={api.minFaan}
              onChange={(e) => api.setMinFaan(Number(e.target.value))}
            >
              {MIN_FAAN_CHOICES.map((n) => (
                <option key={n} value={n}>
                  {n === 0 ? "0 (chicken)" : n === 3 ? "3 (HK standard)" : n}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="btn btn--sm btn--ghost"
            onClick={() => api.setShowHints(!api.showHints)}
            aria-pressed={api.showHints}
          >
            Hints {api.showHints ? "on" : "off"}
          </button>
          <button
            type="button"
            className="btn btn--sm btn--ghost"
            onClick={() => api.setMuted(!api.muted)}
            aria-pressed={!api.muted}
            aria-label={api.muted ? "Unmute sound" : "Mute sound"}
          >
            {api.muted ? "Sound off" : "Sound on"}
          </button>
          <button
            type="button"
            className="btn btn--sm btn--ghost"
            onClick={() => api.setPaused(!api.paused)}
            aria-pressed={api.paused}
          >
            {api.paused ? "Resume" : "Pause"}
          </button>
          <button
            type="button"
            className="btn btn--sm btn--ghost"
            onClick={() => api.setSpeed(SPEEDS[(SPEEDS.indexOf(api.speed) + 1) % SPEEDS.length])}
          >
            Speed: {api.speed}
          </button>
          <button type="button" className="btn btn--sm" onClick={api.newGame}>
            New game
          </button>
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
          <PlayPanel api={api} />
          <AppearancePanel api={appearance} />
          <LogPanel state={state} humanSeat={me} />
          <RulesPanel config={state.config} />
          <FaanPanel config={state.config} />
        </aside>
      </div>

      <ResultModal state={state} onNextHand={api.nextHand} onNewGame={api.newGame} />

      <BuildFooter />
    </main>
  );
}
