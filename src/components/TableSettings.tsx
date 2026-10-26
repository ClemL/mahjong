"use client";

import { type KeyboardEvent, type ReactNode, useId, useRef, useState } from "react";
import { type RoomView, SPEED_LEVELS, type SpeedLevel, TURN_LIMITS, robotVersion } from "@/game/room";
import { SEAT_NAMES, type Seat, seatWind, tileGlyph } from "@/game/tiles";
import type { RoomApi } from "@/hooks/useRoom";
import type { Difficulty } from "@/game/ai";
import type { AppearanceApi } from "@/hooks/useAppearance";
import type { OnOff, TabletDisplay } from "@/hooks/useLocalSetting";
import type { SoundToggle } from "@/hooks/useRoomSound";
import { THEMES, TILE_STYLES } from "@/game/appearance";
import {
  MIN_FAAN_CHOICES,
  type RuleConfig,
  describeRounds,
  flowersInPlay,
  halfShare,
  liabilityInPlay,
  multipleWinnersInPlay,
  othersPayHalfInPlay,
  roundsInGame,
} from "@/game/rules";
import { GAME_LENGTHS } from "./gameLength";
import { type SegmentOption, Segmented, SwitchRow } from "./SettingControls";
import { AppearancePanel } from "./AppearancePanel";
import { FaanPanel, RulesPanel } from "./SidePanels";
import { positionOf } from "./tableLayout";
import { GameHistory } from "./GameHistory";
import { useTableGames } from "@/hooks/useTableGames";

export const SPEEDS: SegmentOption<`${SpeedLevel}`>[] = SPEED_LEVELS.map((s) => ({
  value: `${s.level}` as `${SpeedLevel}`,
  label: s.label,
  hint: `About ${s.turnMs / 1000} seconds per computer turn, with the animations paced to match`,
}));

export const DIFFICULTY_OPTIONS: SegmentOption<Difficulty>[] = [
  {
    value: "easy",
    label: "Easy",
    hint: "A beginner: now and then it throws a tile it should have kept, and it claims sets without minding the faan",
  },
  { value: "normal", label: "Normal", hint: "Plays its own hand well, towards a hand worth declaring" },
  {
    value: "hard",
    label: "Hard",
    hint: "Plays for what a hand is worth as well as for speed: a flush or all pungs when they pay for the wait",
  },
];

const limitLabel = (seconds: number) =>
  seconds === 0 ? "Off" : seconds < 60 ? `${seconds}s` : `${seconds / 60} min`;

export const LIMITS: SegmentOption<string>[] = TURN_LIMITS.map((seconds) => ({
  value: String(seconds),
  label: limitLabel(seconds),
  hint:
    seconds === 0
      ? "Wait as long as a player takes"
      : `After ${seconds < 60 ? `${seconds} seconds` : `${seconds / 60} minute${seconds > 60 ? "s" : ""}`}, the tile just drawn is discarded for them`,
}));

const MIN_FAAN: SegmentOption<`${number}`>[] = MIN_FAAN_CHOICES.map((n) => ({
  value: `${n}` as `${number}`,
  label: String(n),
  sub: n === 0 ? "chicken" : n === 1 ? "easy" : n === 3 ? "HK standard" : "hard",
  hint:
    n === 0
      ? "No minimum: even a chicken hand (雞糊) wins, for one point"
      : `A win must be worth at least ${n} faan, bonus tiles included`,
}));

const FLOWERS: SegmentOption<OnOff>[] = [
  { value: "on", label: "In play", sub: "144 tiles", hint: "Flowers and Seasons score as bonus tiles" },
  { value: "off", label: "Left out", sub: "136 tiles", hint: "Nothing is scored for bonus tiles" },
];

const OTHERS_PAY_HALF: SegmentOption<OnOff>[] = [
  {
    value: "on",
    label: "Others pay half",
    sub: "House rule",
    hint: "The thrower pays the hand's value; the two players who didn't throw it pay half each, rounded up",
  },
  { value: "off", label: "Discarder only", sub: "出銃全包", hint: "The thrower alone pays a win off their discard" },
];

const MULTIPLE_WINNERS: SegmentOption<OnOff>[] = [
  {
    value: "off",
    label: "First only",
    sub: "截糊",
    hint: "When two can win on the same tile, only the first after the thrower wins",
  },
  {
    value: "on",
    label: "Everyone",
    sub: "雙響 三響",
    hint: "When two or three can win on the same tile, each one who declares is paid by the thrower",
  },
];

const EDGES = ["bottom", "right", "top", "left"];

/** A game length as the table chooses it: "East round", "All four winds". */
function lengthLabel(config: RuleConfig): string {
  const rounds = roundsInGame(config);
  return GAME_LENGTHS.find((g) => g.value === String(rounds))?.label ?? describeRounds(rounds);
}

/** The house rules in force, a few words each. */
export function rulesInForce(config: RuleConfig): string[] {
  return [
    `Min ${config.minFaan} faan`,
    lengthLabel(config),
    flowersInPlay(config) ? "Flowers in" : "No flowers",
    liabilityInPlay(config) ? "包 Liability" : "No liability",
    othersPayHalfInPlay(config) ? "Others pay half" : "Discarder pays alone",
    multipleWinnersInPlay(config) ? "雙響 Every winner paid" : "截糊 First winner only",
  ];
}

type Section = "rules" | "players" | "pace" | "history" | "tablet" | "look" | "reference";

const SEATS: Seat[] = [0, 1, 2, 3];

/**
 * Who sits in each chair, and a way to take a person out of one: their phone
 * has died, they have gone home, or they are holding up the table. The
 * computer plays the chair on under their name, and anybody can sit back in.
 */
function PlayersCard({ api, view }: { api: RoomApi; view: RoomView }) {
  return (
    <Card title="At the table">
      <ul className="tset__players">
        {SEATS.map((seat) => {
          const occupant = view.players[seat].occupant;
          const name = occupant.name ?? SEAT_NAMES[seat];
          return (
            <li key={seat} className="tset__player">
              <span className="tset__player-wind" aria-hidden="true">
                {tileGlyph(seatWind(seat))}
              </span>
              <span className="tset__player-text">
                <span className="tset__player-name">{occupant.kind === "open" ? "Open" : name}</span>
                <span className="tset__player-sub">
                  Seat {seat + 1} · {SEAT_NAMES[seat]} ·{" "}
                  {occupant.kind === "human"
                    ? occupant.away
                      ? "away"
                      : "on a phone"
                    : occupant.kind === "ai"
                      ? "the computer"
                      : "nobody yet"}
                </span>
              </span>
              {occupant.kind === "human" ? (
                <button
                  type="button"
                  className="btn btn--ghost tset__kick"
                  disabled={api.busy}
                  aria-label={`Replace ${name} with the computer`}
                  onClick={() => {
                    if (
                      confirm(
                        `Take ${name} out of seat ${seat + 1}? The computer plays on as ${robotVersion(name)}, and ${name}'s phone goes back to choosing a seat.`,
                      )
                    ) {
                      void api.control({ type: "replaceWithComputer", seat });
                    }
                  }}
                >
                  Replace with computer
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
      <span className="tset__foot">
        Anybody can sit back in a computer&apos;s chair by scanning its code, or from the seat picker.
      </span>
    </Card>
  );
}

/** The worked example under the paying rules: what a win off a discard costs at this table. */
function PayoutExample({ config }: { config: RuleConfig }) {
  // The smallest win most tables see, at the HK standard or this table's own minimum.
  const faan = Math.min(Math.max(config.minFaan, 3), config.limitFaan);
  const value = config.payoutTable[faan] ?? 0;
  const half = othersPayHalfInPlay(config) ? halfShare(value) : 0;
  return (
    <div className="payout">
      <span className="payout__title">
        A {faan}-faan win off a discard ({value} points)
      </span>
      <dl className="payout__rows">
        <dt>The thrower</dt>
        <dd className="payout__paid">−{value}</dd>
        <dt>Each of the other two</dt>
        <dd className={half > 0 ? "payout__paid" : undefined}>{half > 0 ? `−${half}` : "0"}</dd>
        <dt className="payout__win">The winner</dt>
        <dd className="payout__win payout__got">+{value + 2 * half}</dd>
      </dl>
    </div>
  );
}

function Card({ title, aside, children, tall = false }: { title: string; aside?: ReactNode; children: ReactNode; tall?: boolean }) {
  return (
    <section className={`tset-card${tall ? " tset-card--tall" : ""}`}>
      <div className="tset-card__head">
        <h3 className="tset-card__title">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

const ICONS: Record<Section, ReactNode> = {
  rules: (
    <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
  ),
  players: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.5a3.5 3.5 0 0 1 0 7M21.5 20a6.5 6.5 0 0 0-4-6" />
    </>
  ),
  pace: (
    <>
      <circle cx="12" cy="13" r="8" />
      <path d="M12 9v4l2 2M9 2h6" />
    </>
  ),
  history: (
    <>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5M12 7v5l3 2" />
    </>
  ),
  tablet: (
    <>
      <rect x="3" y="4" width="18" height="14" rx="2" />
      <path d="M8 21h8" />
    </>
  ),
  look: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3a9 9 0 0 0 0 18" />
    </>
  ),
  reference: (
    <>
      <path d="M9 9a3 3 0 1 1 3 3v2" />
      <circle cx="12" cy="12" r="10" />
      <path d="M12 17h.01" />
    </>
  ),
};

/**
 * What the table is set to, as opposed to what it is doing: the house rules,
 * the pace, this tablet's own display, the look, and the rules for reference,
 * one section at a time beside a rail that says what each is set to.
 */
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
  const [section, setSection] = useState<Section>("rules");
  // Read when the section is opened, and again whenever a game ends.
  const games = useTableGames(view.roomId, section === "history", view.phase === "gameOver");
  const ids = useId();
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const config = view.config;
  const handLive = view.started && view.phase !== "handOver" && view.phase !== "gameOver";
  const rounds = roundsInGame(config);
  const speedLabel = SPEED_LEVELS.find((s) => s.level === view.settings.speed)?.label ?? "Normal";
  const difficultyLabel =
    DIFFICULTY_OPTIONS.find((d) => d.value === view.settings.difficulty)?.label ?? "Normal";
  const themeLabel = THEMES.find((t) => t.value === appearance.appearance.theme)?.label ?? "";
  const facesLabel = TILE_STYLES.find((t) => t.value === appearance.appearance.tiles)?.label ?? "";

  const sections: { key: Section; name: string; summary: string }[] = [
    { key: "rules", name: "House rules", summary: `${config.minFaan} faan · ${lengthLabel(config)}` },
    {
      key: "players",
      name: "Players",
      summary: (() => {
        const people = view.players.filter((p) => p.occupant.kind === "human").length;
        const computer = view.players.filter((p) => p.occupant.kind === "ai").length;
        return [`${people} on phones`, computer > 0 ? `${computer} computer` : null].filter(Boolean).join(" · ");
      })(),
    },
    {
      key: "pace",
      name: "Pace & turns",
      summary: `${difficultyLabel}, ${speedLabel.toLowerCase()} computers · ${view.settings.turnLimit === 0 ? "no turn limit" : `${limitLabel(view.settings.turnLimit)} turns`}`,
    },
    {
      key: "history",
      name: "History",
      summary: games === null ? "Past games and who won them" : `${games.length} ${games.length === 1 ? "game" : "games"} kept`,
    },
    {
      key: "tablet",
      name: "This tablet",
      summary: [
        sound ? (sound.muted ? "Sound off" : "Sound on") : null,
        display ? (display.wall === "on" ? "wall shown" : "wall hidden") : null,
      ]
        .filter(Boolean)
        .join(" · "),
    },
    { key: "look", name: "Look", summary: `${themeLabel} · ${facesLabel} faces` },
    { key: "reference", name: "Rules & faan", summary: "Full rules · faan table" },
  ];

  // Up and down move between sections, as in any list of tabs.
  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const step = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = (index + step + sections.length) % sections.length;
    setSection(sections[next].key);
    tabs.current[next]?.focus();
  };

  const inForce = rulesInForce(config);

  return (
    <div className="tset">
      <nav className="tset__rail" aria-label="Settings sections">
        <div role="tablist" aria-orientation="vertical" className="tset__tabs">
          {sections.map((s, i) => {
            const on = s.key === section;
            return (
              <button
                key={s.key}
                ref={(el) => {
                  tabs.current[i] = el;
                }}
                type="button"
                role="tab"
                id={`${ids}-tab-${s.key}`}
                aria-selected={on}
                aria-controls={`${ids}-panel`}
                tabIndex={on ? 0 : -1}
                className={`tset__tab${on ? " tset__tab--on" : ""}`}
                onClick={() => setSection(s.key)}
                onKeyDown={(e) => onTabKey(e, i)}
              >
                <svg
                  className="tset__icon"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  {ICONS[s.key]}
                </svg>
                <span className="tset__tab-text">
                  <span className="tset__tab-name">{s.name}</span>
                  <span className="tset__tab-sum">{s.summary}</span>
                </span>
              </button>
            );
          })}
        </div>

        {/* For a tablet laid down at a different angle to the chairs. */}
        <div className="tset__board">
          <span className="tset__board-label">Board</span>
          <span className="tset__board-text">
            {SEAT_NAMES[0]} sits at the {EDGES[positionOf(0, view.settings.rotation)]} edge of this tablet
          </span>
          <button
            type="button"
            className="btn tset__rotate"
            disabled={api.busy}
            onClick={() => void api.control({ type: "rotate" })}
          >
            <span aria-hidden="true">↻</span> Rotate a quarter turn
          </button>
        </div>
      </nav>

      <div className="tset__content" role="tabpanel" id={`${ids}-panel`} aria-labelledby={`${ids}-tab-${section}`}>
        {section === "rules" ? (
          <>
            <div className="tset__force">
              <span className="tset__force-label">In force</span>
              {inForce.map((rule) => (
                <span key={rule} className="tset__chip">
                  {rule}
                </span>
              ))}
            </div>
            <div className="tset__grid">
              <Card title="Winning">
                <Segmented
                  label="Minimum faan"
                  options={MIN_FAAN}
                  value={`${config.minFaan}` as `${number}`}
                  disabled={api.busy}
                  onChange={(value) => void api.control({ type: "minFaan", value: Number(value) })}
                />
                <Segmented
                  label="Game length"
                  options={GAME_LENGTHS}
                  value={String(rounds) as `${number}`}
                  disabled={api.busy}
                  onChange={(value) => void api.control({ type: "rounds", value: Number(value) })}
                />
              </Card>

              <Card title="Paying" tall>
                <SwitchRow
                  label="包 Liability"
                  hint="Whoever feeds a third dragon set or a fourth set pays that player's whole self-drawn win"
                  checked={liabilityInPlay(config)}
                  disabled={api.busy}
                  onChange={(value) => void api.control({ type: "liability", value })}
                />
                <Segmented
                  label="On a win off a discard"
                  options={OTHERS_PAY_HALF}
                  value={othersPayHalfInPlay(config) ? "on" : "off"}
                  disabled={api.busy}
                  onChange={(value) => void api.control({ type: "othersPayHalf", value: value === "on" })}
                />
                <Segmented
                  label="Two can win on one discard"
                  options={MULTIPLE_WINNERS}
                  value={multipleWinnersInPlay(config) ? "on" : "off"}
                  disabled={api.busy}
                  onChange={(value) => void api.control({ type: "multipleWinners", value: value === "on" })}
                />
                <PayoutExample config={config} />
                <span className="tset__foot">Paying rules can change mid-hand; they count from the next hand settled.</span>
              </Card>

              {/* The tile set is fixed by the deal, so it only changes between hands. */}
              <Card
                title="Tiles"
                aside={
                  handLive ? (
                    <span className="tset__lock">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                        <rect x="4" y="11" width="16" height="10" rx="2" />
                        <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                      </svg>
                      Locked until this hand ends
                    </span>
                  ) : null
                }
              >
                <Segmented
                  label="Flowers and Seasons"
                  options={FLOWERS}
                  value={flowersInPlay(config) ? "on" : "off"}
                  disabled={api.busy || handLive}
                  note={handLive ? "The tile set is fixed when a hand is dealt" : undefined}
                  onChange={(value) => void api.control({ type: "flowers", value: value === "on" })}
                />
              </Card>
            </div>
          </>
        ) : null}

        {section === "players" ? (
          <div className="tset__grid tset__grid--one">
            <PlayersCard api={api} view={view} />
          </div>
        ) : null}

        {section === "pace" ? (
          <div className="tset__grid tset__grid--one">
            <Card title="Computer players">
              <Segmented
                label="Difficulty"
                options={DIFFICULTY_OPTIONS}
                value={view.settings.difficulty ?? "normal"}
                onChange={(value) => void api.control({ type: "difficulty", value })}
              />
              <Segmented
                label="Speed"
                options={SPEEDS}
                value={`${view.settings.speed}` as `${SpeedLevel}`}
                onChange={(value) => void api.control({ type: "speed", value: Number(value) })}
              />
            </Card>
            <Card title="People">
              <Segmented
                label="Turn time limit"
                options={LIMITS}
                value={String(view.settings.turnLimit)}
                onChange={(value) => void api.control({ type: "turnLimit", value: Number(value) })}
              />
              <SwitchRow
                label="Take back a discard"
                hint="For two seconds after a throw, until someone claims it; the table waits that long before the next draw"
                checked={view.settings.takeBack !== false}
                disabled={api.busy}
                onChange={(value) => void api.control({ type: "takeBack", value })}
              />
            </Card>
          </div>
        ) : null}

        {section === "tablet" ? (
          <div className="tset__grid tset__grid--one">
            <Card title="On this tablet">
              {sound ? (
                <SwitchRow
                  label="Sound"
                  hint="Clacks on discards, claims and wins"
                  checked={!sound.muted}
                  onChange={(on) => sound.setMuted(!on)}
                />
              ) : null}
              {display ? (
                <>
                  <SwitchRow
                    label="Turn light"
                    hint="The discard area of whoever is to play is lit a little"
                    checked={display.turnGlow === "on"}
                    onChange={(on) => display.setTurnGlow(on ? "on" : "off")}
                  />
                  <SwitchRow
                    label="Spoken calls"
                    hint="The tablet says 碰, 上, 槓 and 食糊 aloud, in Cantonese where it has the voice; not while the sound is off"
                    checked={display.callouts === "on"}
                    onChange={(on) => display.setCallouts(on ? "on" : "off")}
                  />
                  <SwitchRow
                    label="Wall"
                    hint="The tiles still to be drawn, faint under the table; draws leave from it"
                    checked={display.wall === "on"}
                    onChange={(on) => display.setWall(on ? "on" : "off")}
                  />
                </>
              ) : null}
            </Card>
          </div>
        ) : null}

        {section === "history" ? <GameHistory games={games} /> : null}

        {section === "look" ? <AppearancePanel api={appearance} /> : null}

        {section === "reference" ? (
          <>
            <RulesPanel config={config} />
            <FaanPanel config={config} />
          </>
        ) : null}
      </div>
    </div>
  );
}
