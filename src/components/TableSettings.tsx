"use client";

import { type RoomView, SPEED_LEVELS, type SpeedLevel, TURN_LIMITS } from "@/game/room";
import { SEAT_NAMES } from "@/game/tiles";
import type { RoomApi } from "@/hooks/useRoom";
import type { AppearanceApi } from "@/hooks/useAppearance";
import type { OnOff, TabletDisplay } from "@/hooks/useLocalSetting";
import { MIN_FAAN_CHOICES, flowersInPlay, roundsInGame } from "@/game/rules";
import { GAME_LENGTHS } from "./gameLength";
import { Choice, type ChoiceOption } from "./Choice";
import { AppearancePanel } from "./AppearancePanel";
import { FaanPanel, RulesPanel } from "./SidePanels";
import type { SoundToggle } from "./TableView";
import { positionOf } from "./tableLayout";

const SPEEDS: ChoiceOption<`${SpeedLevel}`>[] = SPEED_LEVELS.map((s) => ({
  value: `${s.level}` as `${SpeedLevel}`,
  label: s.label,
  hint: `About ${s.turnMs / 1000} seconds per computer turn, with the animations paced to match`,
}));

const LIMITS: ChoiceOption<string>[] = TURN_LIMITS.map((seconds) => ({
  value: String(seconds),
  label: seconds === 0 ? "Off" : seconds < 60 ? `${seconds}s` : `${seconds / 60} min`,
  hint:
    seconds === 0
      ? "Wait as long as a player takes"
      : `After ${seconds < 60 ? `${seconds} seconds` : `${seconds / 60} minute${seconds > 60 ? "s" : ""}`}, the tile just drawn is discarded for them`,
}));

const EDGES = ["bottom", "right", "top", "left"];

const TURN_GLOW: ChoiceOption<OnOff>[] = [
  { value: "on", label: "On", hint: "The discard area of whoever is to play is lit a little" },
  { value: "off", label: "Off", hint: "Only the rack shows whose turn it is" },
];

const WALL: ChoiceOption<OnOff>[] = [
  {
    value: "on",
    label: "Show",
    hint: "The tiles still to be drawn, faint under the table; draws leave from it",
  },
  { value: "off", label: "Hide", hint: "A plain felt" },
];

const FLOWERS: ChoiceOption<OnOff>[] = [
  { value: "on", label: "In play", hint: "144 tiles; Flowers and Seasons score as bonus tiles" },
  { value: "off", label: "Left out", hint: "136 tiles; nothing is scored for bonus tiles" },
];

const SOUND: ChoiceOption<"on" | "off">[] = [
  { value: "on", label: "On", hint: "Clacks on discards, claims and wins" },
  { value: "off", label: "Off", hint: "Silent" },
];

/** What the table is set to, as opposed to what it is doing. */
export function TableSettings({
  api,
  view,
  sound,
  appearance,
  display,
}: {
  api: RoomApi;
  view: RoomView;
  sound?: SoundToggle;
  appearance: AppearanceApi;
  /** This tablet's own display choices. */
  display?: TabletDisplay;
}) {
  const handLive = view.started && view.phase !== "handOver" && view.phase !== "gameOver";
  return (
    <>
      <section className="panel">
        <details open>
          <summary>Table</summary>
          <div className="appearance">
            <label className="field">
              <span className="field__label">Min faan</span>
              <select
                className="field__select"
                value={view.config.minFaan}
                disabled={api.busy}
                onChange={(e) => void api.control({ type: "minFaan", value: Number(e.target.value) })}
              >
                {MIN_FAAN_CHOICES.map((n) => (
                  <option key={n} value={n}>
                    {n === 0 ? "0 (chicken)" : n === 3 ? "3 (HK standard)" : n}
                  </option>
                ))}
              </select>
            </label>

            <Choice
              label="Game length"
              options={GAME_LENGTHS}
              value={String(roundsInGame(view.config)) as `${number}`}
              disabled={api.busy}
              onChange={(value) => void api.control({ type: "rounds", value: Number(value) })}
            />

            {/* The tile set is fixed by the deal, so it only changes between hands. */}
            <Choice
              label="Flowers"
              options={FLOWERS}
              value={flowersInPlay(view.config) ? "on" : "off"}
              disabled={api.busy || handLive}
              note={handLive ? "Can be changed once this hand is over" : undefined}
              onChange={(value) => void api.control({ type: "flowers", value: value === "on" })}
            />

            <Choice
              label="Computer speed"
              options={SPEEDS}
              value={`${view.settings.speed}` as `${SpeedLevel}`}
              onChange={(value) => void api.control({ type: "speed", value: Number(value) })}
            />

            <Choice
              label="Turn time limit"
              options={LIMITS}
              value={String(view.settings.turnLimit)}
              onChange={(value) => void api.control({ type: "turnLimit", value: Number(value) })}
            />

            {/* For a tablet laid down at a different angle to the chairs. */}
            <div className="choice">
              <span className="choice__label">Board</span>
              <div className="choice__options">
                <button
                  type="button"
                  className="choice__btn"
                  disabled={api.busy}
                  onClick={() => void api.control({ type: "rotate" })}
                >
                  Rotate clockwise ↻
                </button>
              </div>
              <span className="choice__hint">
                {SEAT_NAMES[0]} sits at the {EDGES[positionOf(0, view.settings.rotation)]} edge
              </span>
            </div>

            {sound ? (
              <Choice
                label="Sound"
                options={SOUND}
                value={sound.muted ? "off" : "on"}
                onChange={(value) => sound.setMuted(value === "off")}
              />
            ) : null}

            {display ? (
              <>
                <Choice
                  label="Turn light"
                  options={TURN_GLOW}
                  value={display.turnGlow}
                  onChange={display.setTurnGlow}
                />
                <Choice label="Wall" options={WALL} value={display.wall} onChange={display.setWall} />
              </>
            ) : null}
          </div>
        </details>
      </section>
      <AppearancePanel api={appearance} />
      <RulesPanel config={view.config} />
      <FaanPanel config={view.config} />
    </>
  );
}
