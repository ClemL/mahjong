"use client";

import { type CSSProperties, type ReactNode, useEffect, useId, useState } from "react";
import type { RoomView, SpeedLevel } from "@/game/room";
import { type RuleConfig, othersPayHalfInPlay, roundsInGame } from "@/game/rules";
import { SEAT_NAMES, type Seat, WINDS, roundName, seatWind, tileGlyph } from "@/game/tiles";
import { tableName } from "@/game/tables";
import type { RoomApi } from "@/hooks/useRoom";
import type { AppearanceApi } from "@/hooks/useAppearance";
import type { FullscreenApi } from "@/hooks/useFullscreen";
import { SIDE_PANES, type SidePane, type TabletDisplay, useHiddenPanes } from "@/hooks/useLocalSetting";
import type { SoundToggle } from "@/hooks/useRoomSound";
import type { WakeLockState } from "@/hooks/useWakeLock";
import { QrCode } from "./QrCode";
import { Segmented, SwitchRow } from "./SettingControls";
import { TableActions, TableMenu, WakeNote, occupantName } from "./TableControls";
import { DIFFICULTY_OPTIONS, LIMITS, SPEEDS, rulesInForce } from "./TableSettings";
import { chipsOf } from "./TableEffects";
import { joinNames, winnersOf } from "./TableResult";
import { positionOf } from "./tableLayout";

const SEATS: Seat[] = [0, 1, 2, 3];

/** Screen edges by position; which seat is at which follows the table's rotation. */
const EDGES = ["bottom", "right", "top", "left"];

const ORDINALS = ["1st", "2nd", "3rd", "4th"];

/** A change in chips, signed, with a true minus. */
function signed(n: number): string {
  return n > 0 ? `+${n}` : n < 0 ? `−${-n}` : "0";
}

/**
 * Who is ahead: each seat's place, shared on a tie, so two players level on
 * chips are both second rather than one of them arbitrarily third.
 */
export function standings(scores: readonly number[]): number[] {
  return scores.map((score) => scores.filter((other) => other > score).length);
}

/**
 * Where the game is: which dealership of how many. Four dealerships to each
 * wind round; a dealer who keeps the deal plays another hand in the same one.
 */
export function gameProgress(view: Pick<RoomView, "roundWind" | "dealership" | "config">): {
  deal: number;
  total: number;
} {
  const total = roundsInGame(view.config) * 4;
  const deal = Math.max(0, WINDS.indexOf(view.roundWind)) * 4 + view.dealership + 1;
  return { deal: Math.min(deal, total), total };
}

const PANE_TITLES: Record<SidePane, string> = {
  round: "Round",
  scores: "Scores",
  scoring: "Scoring",
  join: "Join in",
  settings: "Settings",
};

/** A pane, with a way to close it for anyone who would rather see less. */
function Card({
  pane,
  onHide,
  children,
}: {
  pane: SidePane;
  onHide: (pane: SidePane) => void;
  children: ReactNode;
}) {
  const id = useId();
  const title = PANE_TITLES[pane];
  return (
    <section className={`side__card side__${pane}`} aria-labelledby={id}>
      <div className="side__cardhead">
        <h3 className="side__title" id={id}>
          {title}
        </h3>
        <button type="button" className="side__hide" aria-label={`Hide ${title}`} onClick={() => onHide(pane)}>
          <span aria-hidden="true">×</span>
        </button>
      </div>
      {children}
    </section>
  );
}

/** The round, the dealership, the wall, and who the table is waiting on. */
function RoundCard({ view, onHide }: { view: RoomView; onHide: (pane: SidePane) => void }) {
  const name = (seat: Seat) => occupantName(view.players[seat]);
  const { deal, total } = gameProgress(view);
  const doing =
    view.phase === "gameOver"
      ? "The game is over"
      : view.phase === "handOver"
        ? view.result?.type === "win" && view.result.winner !== null
          ? `${joinNames(winnersOf(view.result).map((w) => name(w.winner)))} won the hand`
          : "The hand washed out"
        : view.awaitingClaimSeats.length > 0
          ? `Waiting on ${view.awaitingClaimSeats.map(name).join(" and ")}`
          : `${name(view.turn)} to play`;

  return (
    <Card pane="round" onHide={onHide}>
      <div className="side__roundline">
        <span className="side__roundwind" aria-hidden>
          {tileGlyph(view.roundWind)}
        </span>
        <span className="side__roundtext">
          <strong>
            {roundName(view.roundWind)} round · hand {view.handNumber}
          </strong>
          <span className="seat__meta">
            Dealer {name(view.dealer)} · dealership {deal} of {total}
          </span>
          <span className="side__now">
            {view.wallCount} tiles left · <strong>{doing}</strong>
          </span>
        </span>
      </div>
      {/* One pip per dealership, four to a wind: done, this one, still to come.
          Told apart by shape as well as fill, and said in words above. */}
      <ol className="side__deals" aria-hidden>
        {Array.from({ length: total }, (_, i) => (
          <li
            key={i}
            className={i + 1 < deal ? "side__deal side__deal--done" : i + 1 === deal ? "side__deal side__deal--now" : "side__deal"}
            style={{ "--wind": Math.floor(i / 4) } as CSSProperties}
          />
        ))}
      </ol>
    </Card>
  );
}

/** Everyone's chips, their place, and what the last hand did to them. */
function ScoreCard({ view, onHide }: { view: RoomView; onHide: (pane: SidePane) => void }) {
  const name = (seat: Seat) => occupantName(view.players[seat]);
  const place = standings(view.scores);
  const last = view.history.at(-1) ?? null;
  const lastLine = last
    ? last.type === "win" && last.winner !== null
      ? `Hand ${last.handNumber}: ${name(last.winner)} won ${last.faan ?? 0} faan${last.pattern ? `, ${last.pattern.name}` : ""}${
          last.from !== null && last.from !== last.winner ? `, off ${name(last.from)}` : ", self-drawn"
        }`
      : `Hand ${last.handNumber}: washed out`
    : null;

  return (
    <Card pane="scores" onHide={onHide}>
      <table className="side__board">
        <thead>
          <tr>
            <th scope="col">Seat</th>
            <th scope="col" className="side__num">
              Chips
            </th>
            {/* Before anything is scored everyone is level: nothing to rank. */}
            {last ? (
              <>
                <th scope="col" className="side__num">
                  Last hand
                </th>
                <th scope="col" className="side__num">
                  Place
                </th>
              </>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {SEATS.map((seat) => {
            const occupant = view.players[seat].occupant;
            const change = last ? (last.payments[seat] ?? 0) : null;
            return (
              <tr key={seat} className={place[seat] === 0 ? "side__row side__row--lead" : "side__row"}>
                <th scope="row">
                  <span className="side__who">
                    <span className="side__wind" aria-hidden>
                      {tileGlyph(seatWind(seat))}
                    </span>
                    <span className="side__name">{name(seat)}</span>
                    {view.dealer === seat ? <span className="seat__badge">Dealer</span> : null}
                    {occupant.away ? <span className="seat__badge">Away</span> : null}
                  </span>
                </th>
                <td className="side__num side__chips">{chipsOf(view.scores[seat])}</td>
                {change !== null ? (
                  <>
                    <td className={change > 0 ? "side__num side__change side__change--up" : "side__num side__change"}>
                      {signed(change)}
                    </td>
                    <td className="side__num side__place">{ORDINALS[place[seat]]}</td>
                  </>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
      {lastLine ? <p className="side__note">{lastLine}</p> : null}
    </Card>
  );
}

/** The rules a win is paid under: what is in force, and points for each faan. */
function RulesCard({ config, onHide }: { config: RuleConfig; onHide: (pane: SidePane) => void }) {
  const from = Math.max(0, config.minFaan);
  const faans = Array.from({ length: Math.max(0, config.limitFaan - from + 1) }, (_, i) => from + i);
  return (
    <Card pane="scoring" onHide={onHide}>
      <div className="side__chips-row">
        {rulesInForce(config).map((rule) => (
          <span key={rule} className="tset__chip">
            {rule}
          </span>
        ))}
      </div>
      <table className="side__payout">
        <caption className="sr-only">Points owed by each payer, by faan</caption>
        <tbody>
          <tr>
            <th scope="row">Faan</th>
            {faans.map((f) => (
              <td key={f}>{f === config.limitFaan ? `${f}+` : f}</td>
            ))}
          </tr>
          <tr>
            <th scope="row">Points</th>
            {faans.map((f) => (
              <td key={f}>{config.payoutTable[f] ?? 0}</td>
            ))}
          </tr>
        </tbody>
      </table>
      <p className="side__note">
        Self-drawn, each of the other three pays that. Off a discard the thrower pays it
        {othersPayHalfInPlay(config) ? ", and the other two half each" : " alone"}.
      </p>
    </Card>
  );
}

/**
 * One code at a time, for a chair the computer is playing. Scanning it opens
 * that chair on the phone with a box for the newcomer's name; sitting down
 * takes the seat over, hand and all, and the next computer chair round the
 * table comes up. One code is what the person scanning needs: four would
 * leave them to work out which is theirs.
 */
function JoinCard({
  view,
  seats,
  onHide,
}: {
  view: RoomView;
  seats: Seat[];
  onHide: (pane: SidePane) => void;
}) {
  // Built in the browser: the page has no idea what host it is served from.
  const [origin, setOrigin] = useState<string | null>(null);
  useEffect(() => setOrigin(window.location.origin), []);

  // The chair last asked for. Once somebody sits in it, the next computer
  // chair after it takes its place.
  const [wanted, setWanted] = useState<Seat>(seats[0]);
  const after = (from: Seat) => seats.find((s) => s > from) ?? seats[0];
  const seat = seats.includes(wanted) ? wanted : after(wanted);
  const name = occupantName(view.players[seat]);
  const more = seats.length - 1;

  return (
    <Card pane="join" onHide={onHide}>
      <div className="side__code">
        {origin ? (
          <QrCode
            value={`${origin}/room/${view.roomId}?pick=${seat}`}
            label={`Scan to take over seat ${seat + 1}, ${SEAT_NAMES[seat]}, from ${name}`}
            className="qr--side"
          />
        ) : (
          <span className="qr qr--side qr--pending" aria-hidden />
        )}
        <div className="side__code-text">
          <span className="side__code-name">
            <span className="side__wind" aria-hidden>
              {tileGlyph(seatWind(seat))}
            </span>{" "}
            {name}
          </span>
          <span className="seat__meta">
            Seat {seat + 1} · {SEAT_NAMES[seat]} · {EDGES[positionOf(seat, view.settings.rotation)]} edge
          </span>
          <p className="side__note">Scan to take this chair over from the computer. You type your name on your phone.</p>
          {more > 0 ? (
            <>
              <p className="side__note">
                {more} more computer {more === 1 ? "chair" : "chairs"}: the next comes up once somebody sits here.
              </p>
              <button
                type="button"
                className="btn btn--sm btn--ghost side__another"
                onClick={() => setWanted(after(seat))}
              >
                Another chair ›
              </button>
            </>
          ) : null}
        </div>
      </div>
    </Card>
  );
}

/** The settings touched mid-game; the rest stay behind the Settings button. */
function SettingsCard({
  api,
  view,
  sound,
  display,
  onHide,
}: {
  api: RoomApi;
  view: RoomView;
  sound?: SoundToggle;
  display: TabletDisplay;
  onHide: (pane: SidePane) => void;
}) {
  return (
    <Card pane="settings" onHide={onHide}>
      {sound ? (
        <SwitchRow
          label="Sound"
          hint="Clacks on discards, claims and wins"
          checked={!sound.muted}
          onChange={(on) => sound.setMuted(!on)}
        />
      ) : null}
      <SwitchRow
        label="Turn light"
        hint="The discard area of whoever is to play is lit a little"
        checked={display.turnGlow === "on"}
        onChange={(on) => display.setTurnGlow(on ? "on" : "off")}
      />
      <Segmented
        label="Computer difficulty"
        options={DIFFICULTY_OPTIONS}
        value={view.settings.difficulty ?? "normal"}
        onChange={(value) => void api.control({ type: "difficulty", value })}
      />
      <Segmented
        label="Computer speed"
        options={SPEEDS}
        value={`${view.settings.speed}` as `${SpeedLevel}`}
        onChange={(value) => void api.control({ type: "speed", value: Number(value) })}
      />
      <Segmented
        label="Turn time limit"
        options={LIMITS}
        value={String(view.settings.turnLimit)}
        onChange={(value) => void api.control({ type: "turnLimit", value: Number(value) })}
      />
    </Card>
  );
}

/**
 * Beside the squared felt on a widescreen tablet: the bar's controls, and
 * what there was no room for — where the game stands, the scores, the rules a
 * win is paid under, the settings reached for mid-game, and a code for each
 * chair the computer is playing so somebody arriving late can take it over.
 */
export function TableSide({
  api,
  view,
  sound,
  sheet,
  wakeLock,
  appearance,
  display,
  fullscreen,
}: {
  api: RoomApi;
  view: RoomView;
  sound?: SoundToggle;
  sheet: { aside: boolean; show: () => void };
  wakeLock: WakeLockState;
  appearance: AppearanceApi;
  display: TabletDisplay;
  fullscreen: FullscreenApi;
}) {
  const computer = SEATS.filter((seat) => view.players[seat].occupant.kind === "ai");
  const panes = useHiddenPanes();
  const shown = (pane: SidePane) => !panes.hidden.includes(pane);

  return (
    <aside className="side" aria-label={`${tableName(view.roomId)}: the game`}>
      <header className="side__head">
        <span className="tableview__code">{tableName(view.roomId)}</span>
        <span className="topbar__spacer" />
        <div className="actions">
          <TableActions api={api} view={view} sheet={sheet} />
          <TableMenu
            api={api}
            view={view}
            sound={sound}
            appearance={appearance}
            display={display}
            fullscreen={fullscreen}
          />
        </div>
        <WakeNote state={wakeLock} />
      </header>
      <div className="side__body">
        <div className="side__cols">
          <div className="side__col">
            {shown("round") ? <RoundCard view={view} onHide={panes.hide} /> : null}
            {shown("scores") ? <ScoreCard view={view} onHide={panes.hide} /> : null}
            {shown("scoring") ? <RulesCard config={view.config} onHide={panes.hide} /> : null}
          </div>
          <div className="side__col">
            {shown("join") && computer.length > 0 ? (
              <JoinCard view={view} seats={computer} onHide={panes.hide} />
            ) : null}
            {shown("settings") ? (
              <SettingsCard api={api} view={view} sound={sound} display={display} onHide={panes.hide} />
            ) : null}
          </div>
        </div>
        {panes.hidden.length > 0 ? (
          <button type="button" className="btn btn--sm btn--ghost side__restore" onClick={panes.showAll}>
            Show hidden panes ({SIDE_PANES.filter((p) => panes.hidden.includes(p)).map((p) => PANE_TITLES[p]).join(", ")})
          </button>
        ) : null}
      </div>
    </aside>
  );
}
