"use client";

import type { CSSProperties, ReactNode } from "react";
import type { HandResult } from "@/game/engine";
import type { PublicPlayer, RoomView } from "@/game/room";
import type { ScoreResult } from "@/game/scoring";
import { patternTiles } from "@/game/patternTiles";
import { roundsInGame } from "@/game/rules";
import { arrangeWinningHand } from "@/game/winning";
import { type Seat, type TileCode, WINDS, isFlower, roundName, tileName } from "@/game/tiles";
import { tableName } from "@/game/tables";
import { TileFace } from "./TileView";
import { MeldRow, bonusClass } from "./MeldRow";
import { chipsOf } from "./TableEffects";
import { winningTileOf } from "./moments";

const SEATS: Seat[] = [0, 1, 2, 3];

const SET_NAME = { chow: "Chow", pung: "Pung", kong: "Kong" } as const;

export function signed(n: number): string {
  return n > 0 ? `+${n}` : n < 0 ? `−${-n}` : "0";
}

/** The tile a hand went out on: the discard or robbed kong tile it took, or the tile it drew. */
export function winningTile(view: RoomView): TileCode | null {
  const won = view.result;
  if (won?.type !== "win" || won.winner === null) return null;
  if (won.from !== null) return winningTileOf(view.log);
  return view.players[won.winner].hand.find((t) => t.id === view.drawnTileId)?.code ?? null;
}

/** Everyone a hand was won by: the first after the discarder, then any others on the same tile. */
export function winnersOf(result: HandResult | null): { winner: Seat; score: ScoreResult | null }[] {
  if (result?.type !== "win" || result.winner === null) return [];
  return [{ winner: result.winner, score: result.score }, ...(result.others ?? [])];
}

/** The winners with yours first, so a sentence can start "You and Lucy". */
export function youFirst<T extends { winner: Seat }>(winners: T[], seat: Seat): T[] {
  return [...winners].sort((a, b) => Number(b.winner === seat) - Number(a.winner === seat));
}

/** "Lucy", "Lucy and Zaid", "Lucy, Zaid and Kris". */
export function joinNames(names: string[]): string {
  return names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

/** Whether the next hand would be past the end of the game. */
export function isLastHand(view: RoomView): boolean {
  if (view.phase !== "handOver" || !view.result || view.result.dealerKeeps) return false;
  return view.dealership + 1 >= 4 && WINDS.indexOf(view.roundWind) + 1 >= roundsInGame(view.config);
}

/** One set of the winning hand, with what it is written under it. */
function Group({ label, order, children }: { label: ReactNode; order: number; children: ReactNode }) {
  return (
    <span className="result-hand__group" style={{ "--i": order } as CSSProperties}>
      {children}
      {label === null ? null : <span className="result-hand__label">{label}</span>}
    </span>
  );
}

/** `extra` is the tile a second or third winner won on, which went to the first. */
function laidOut(player: PublicPlayer, score: ScoreResult | null, extra?: TileCode | null) {
  const concealed = player.hand.map((t) => t.code).filter((code) => code !== "back" && !isFlower(code));
  if (extra) concealed.push(extra);
  const preferChows = score?.patterns.some((p) => p.key === "allChows") ?? false;
  return arrangeWinningHand(concealed, player.melds, preferChows);
}

/**
 * The winning hand laid out the way it is claimed: the sets already laid open,
 * then the concealed tiles split into their sets of three and the pair, then
 * any flowers. The tile it went out on is ringed, and said under its set.
 */
export function WinningHand({
  player,
  score,
  winning,
  labels = true,
  shared = false,
}: {
  player: PublicPlayer;
  score: ScoreResult | null;
  /** The tile it went out on, and how to say where it came from. */
  winning?: { code: TileCode; note: string } | null;
  /** Name each set under it; a phone has no room, and says the winning tile once instead. */
  labels?: boolean;
  /** The winning tile went to someone else who won on it first: add it to this hand to show it. */
  shared?: boolean;
}) {
  const layout = laidOut(player, score, shared ? winning?.code : null);
  // Ring one copy, in the first concealed group that holds it: the open melds
  // were whole before the winning tile arrived.
  const groups: TileCode[][] = [...layout.sets.map((s) => s.codes)];
  if (layout.pair) groups.push([layout.pair, layout.pair]);
  if (layout.loose.length > 0) groups.push(layout.loose);
  const ringGroup = winning ? groups.findIndex((codes) => codes.includes(winning.code)) : -1;
  const ringAt = ringGroup >= 0 ? groups[ringGroup].lastIndexOf(winning!.code) : -1;
  const tilesOf = (codes: TileCode[], group: number) =>
    codes.map((code, k) => (
      <TileFace
        key={k}
        code={code}
        size="sm"
        className={group === ringGroup && k === ringAt ? "tile--won-on" : ""}
      />
    ));
  const label = (name: string, group: number) =>
    !labels ? null : group === ringGroup && winning ? (
      <>
        {name} · <span className="result-hand__won">{winning.note}</span>
      </>
    ) : (
      name
    );

  // A limit hand is turned over set by set, the way it would be laid down to
  // a silent table.
  let order = 0;
  let group = 0;
  return (
    <div
      className={[
        "result-hand",
        score?.limitReached ? "result-hand--reveal" : "",
        labels ? "" : "result-hand--bare",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-label="Winning hand"
    >
      {player.melds.map((meld, i) => (
        <Group
          key={`m${i}`}
          order={order++}
          label={labels ? `${SET_NAME[meld.type]}${meld.concealed ? "" : " · claimed"}` : null}
        >
          <MeldRow meld={meld} />
        </Group>
      ))}
      {layout.sets.map((set, i) => {
        const g = group++;
        return (
          <Group key={`s${i}`} order={order++} label={label(SET_NAME[set.type], g)}>
            <span className="meld">{tilesOf(set.codes, g)}</span>
          </Group>
        );
      })}
      {layout.pair ? (
        <Group order={order++} label={label("Pair", group)}>
          <span className="meld">{tilesOf([layout.pair, layout.pair], group++)}</span>
        </Group>
      ) : null}
      {layout.loose.length > 0 ? (
        <Group order={order++} label={label(score?.patterns[0]?.name ?? "Hand", group)}>
          <span className="meld">{tilesOf(layout.loose, group++)}</span>
        </Group>
      ) : null}
      {player.flowers.length > 0 ? (
        <Group order={order++} label={labels ? "Flowers" : null}>
          <span className="meld">
            {player.flowers.map((t) => (
              <TileFace key={t.id} code={t.code} size="sm" className={bonusClass(t.code, player)} />
            ))}
          </span>
        </Group>
      ) : null}
    </div>
  );
}

/**
 * Each pattern the hand scored, with the few tiles that earned it where there
 * are few enough to show, then the total and what it is worth.
 */
export function FaanLedger({
  view,
  score,
  winner = view.result!.winner!,
}: {
  view: RoomView;
  score: ScoreResult;
  /** Whose win, when the tile was won on by more than one. */
  winner?: Seat;
}) {
  const player = view.players[winner];
  const shared = winner !== view.result!.winner;
  const layout = laidOut(player, score, shared ? winningTile(view) : null);
  const shown = patternTiles(score.patterns, {
    sets: [
      ...player.melds.map((m) => ({ type: m.type, codes: m.tiles.map((t) => t.code) })),
      ...layout.sets,
    ],
    flowers: player.flowers.map((t) => t.code),
    winningTile: winningTile(view),
    seat: winner,
    roundWind: view.roundWind,
  });
  const capped = score.limitReached && score.scoredFaan < score.faan;
  return (
    <div className="faan-ledger">
      <ul className="faan-ledger__rows" aria-label="Faan breakdown">
        {score.patterns.map((p, i) => (
          <li key={i} className="faan-ledger__row">
            <span className="faan-ledger__name">
              {p.name} <span className="faan-ledger__zh">{p.chinese}</span>
            </span>
            {shown[i] ? (
              <span
                className="faan-ledger__tiles"
                role="img"
                aria-label={shown[i]!.map(tileName).join(", ")}
              >
                {shown[i]!.map((code, k) => (
                  <TileFace key={k} code={code} size="sm" />
                ))}
              </span>
            ) : (
              <span aria-hidden />
            )}
            <span className="faan-ledger__faan">{p.faan}</span>
          </li>
        ))}
      </ul>
      <div className="faan-ledger__total">
        <span className="faan-ledger__total-text">
          <strong>{capped ? `Total ${score.faan}, paid at the ${score.scoredFaan} faan limit` : `Total ${score.scoredFaan} faan`}</strong>
          <span>Worth {score.value} points a share on this table</span>
        </span>
        <span className="faan-ledger__value">{score.value}</span>
      </div>
    </div>
  );
}

/** Why each seat paid what it did. */
function roleOf(result: HandResult, seat: Seat): string {
  if (result.type !== "win" || result.winner === null) return "";
  if (winnersOf(result).some((w) => w.winner === seat)) return "winner";
  const paid = -(result.payments[seat] ?? 0);
  if (result.liable != null) return seat === result.liable ? "pays it all 包" : "pays nothing";
  if (result.from === null) return "full share";
  if (seat === result.from) return "threw the tile";
  return paid > 0 ? (result.others ? "half of each" : "half share") : "pays nothing";
}

/** How the table settled up, said once above the bars. */
function payingRule(result: HandResult): string {
  if (result.liable != null) return "包 Liability: one seat pays for all";
  if (result.from === null) return "Self-drawn: everyone pays";
  const winners = winnersOf(result).map((w) => w.winner);
  const others = SEATS.some((s) => !winners.includes(s) && s !== result.from && (result.payments[s] ?? 0) < 0);
  const every = winners.length > 1 ? "Every winner paid 雙響 · " : "";
  return `${every}${others ? "Others pay half · house rule" : "The discarder pays alone"}`;
}

/**
 * What every seat paid or took, as bars either side of one line: paid to the
 * left, received to the right, all in one neutral tone, so the side and the
 * signed number say which — never the colour. Each seat's chips after it.
 */
export function WhoPays({ view, name }: { view: RoomView; name: (seat: Seat) => string }) {
  const result = view.result!;
  const won = result.type === "win" && result.winner !== null;
  const first = won ? (result.liable ?? result.from) : null;
  const winners = winnersOf(result).map((w) => w.winner);
  // Who paid most first, the winners last.
  const order = won
    ? [
        ...(first !== null && first !== undefined ? [first] : []),
        ...SEATS.filter((s) => s !== first && !winners.includes(s)),
        ...winners,
      ]
    : SEATS;
  const most = Math.max(1, ...result.payments.map((p) => Math.abs(p)));
  if (!won) {
    // Nobody paid anything: the chips are all there is to say.
    return (
      <div className="who-pays">
        <ul className="who-pays__rows" aria-label="Chips">
          {order.map((seat) => (
            <li key={seat} className="who-pays__row who-pays__row--plain">
              <span className="who-pays__name">{name(seat)}</span>
              <span className="who-pays__chips">{chipsOf(view.scores[seat])}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }
  return (
    <div className="who-pays">
      <div className="who-pays__head" aria-hidden>
        <span />
        <span className="who-pays__side who-pays__side--paid">Paid</span>
        <span className="who-pays__side">Received</span>
        <span className="who-pays__chips">Chips</span>
      </div>
      <ul className="who-pays__rows" aria-label="Chips">
        {order.map((seat) => {
          const paid = result.payments[seat] ?? 0;
          const bar = { "--share": Math.abs(paid) / most } as CSSProperties;
          return (
            <li key={seat} className={`who-pays__row${winners.includes(seat) ? " who-pays__row--winner" : ""}`}>
              <span className="who-pays__who">
                <span className="who-pays__name">{name(seat)}</span>
                <span className="who-pays__role">{roleOf(result, seat)}</span>
              </span>
              <span className="who-pays__lane who-pays__lane--paid">
                {paid < 0 ? (
                  <>
                    <span className="who-pays__delta">{signed(paid)}</span>
                    <span className="who-pays__bar" style={bar} />
                  </>
                ) : null}
              </span>
              <span className="who-pays__lane who-pays__lane--received">
                {paid > 0 ? (
                  <>
                    <span className="who-pays__bar" style={bar} />
                    <span className="who-pays__delta">{signed(paid)}</span>
                  </>
                ) : paid === 0 ? (
                  <span className="who-pays__delta who-pays__delta--none">—</span>
                ) : null}
              </span>
              <span className="who-pays__chips">{chipsOf(view.scores[seat])}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/**
 * The end of a hand, laid over the felt rather than squeezed into the middle
 * of it: who won and what it was worth, the winning hand in its sets, the faan
 * it scored with the tiles behind them, what every seat paid, and the way on
 * to the next hand. The felt shows through, so the hands turned up on the
 * racks are still there to look at, and it can be put aside to look at them.
 */
export function TableResult({
  view,
  name,
  tile,
  onHide,
  onNextHand,
  onReplay,
  busy,
}: {
  view: RoomView;
  name: (seat: Seat) => string;
  /** The size the tiles in it are drawn at. */
  tile: number;
  onHide: () => void;
  onNextHand: () => void;
  /** Play the hand back, move by move. */
  onReplay?: () => void;
  busy: boolean;
}) {
  const result = view.result;
  if (!result) return null;
  const won = result.type === "win" && result.winner !== null ? result : null;
  const score = won?.score ?? null;
  const style = { "--tile-sm": `${tile}px` } as CSSProperties;
  const code = won ? winningTile(view) : null;
  const winner = won ? won.winner! : null;
  const gain = winner !== null ? (won!.payments[winner] ?? 0) : 0;
  const winners = winnersOf(result);
  const others = winners.slice(1);
  const wonOn = (from: Seat | null) => (from === null ? "drawn" : `won on ${name(from)}'s tile`);
  const last = isLastHand(view);
  const nextDealer = ((view.dealer + 1) % 4) as Seat;

  return (
    <div className="result-sheet" style={style}>
      <section className="result-sheet__card" role="dialog" aria-modal="false" aria-label="Hand result">
        <header className="result-sheet__head">
          <div className="result-sheet__heading-block">
            <span className="result-sheet__kicker">
              Hand {view.handNumber} · {roundName(view.roundWind)} round · {tableName(view.roomId)}
            </span>
            <h2 className="result-sheet__title">
              {won ? `${joinNames(winners.map((w) => name(w.winner)))} ${others.length > 0 ? "win" : "wins"} ` : "Washed-out hand "}
              <span className="result-sheet__zh">{won ? "食糊" : "流局"}</span>
            </h2>
            <p className="result-sheet__subtitle">
              {won
                ? [
                    won.from === null ? "Self-drawn 自摸" : `Off ${name(won.from)}'s discard`,
                    others.length === 1 ? "two winners 雙響" : others.length === 2 ? "three winners 三響" : null,
                    won.liable != null ? `${name(won.liable)} pays it all 包` : null,
                    score && others.length === 0 ? `${score.scoredFaan} faan` : null,
                    score && others.length === 0 ? `${score.value} points a share` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")
                : "The wall ran out before anyone went out. Nobody pays."}
            </p>
          </div>
          {winner !== null ? (
            <div className="result-sheet__gain">
              <span className="result-sheet__gain-value">{signed(gain)}</span>
              <span className="result-sheet__gain-note">
                {name(winner)}&rsquo;s chips {chipsOf(view.scores[winner] - gain)} → {chipsOf(view.scores[winner])}
              </span>
              {others.map((o) => (
                <span key={o.winner} className="result-sheet__gain-note">
                  {name(o.winner)} {signed(won!.payments[o.winner] ?? 0)}
                </span>
              ))}
            </div>
          ) : null}
        </header>

        {won ? (
          <section className="result-sheet__panel">
            <WinningHand player={view.players[winner!]} score={score} winning={code ? { code, note: wonOn(won.from) } : null} />
          </section>
        ) : null}
        {others.map((o) => (
          <section key={o.winner} className="result-sheet__panel" aria-label={`${name(o.winner)}'s hand`}>
            <h3 className="result-sheet__heading">
              {name(o.winner)} won on it too{o.score ? ` · ${o.score.scoredFaan} faan` : ""}
            </h3>
            <WinningHand
              player={view.players[o.winner]}
              score={o.score}
              winning={code ? { code, note: wonOn(won!.from) } : null}
              shared
            />
          </section>
        ))}

        <div className={score ? "result-sheet__columns" : "result-sheet__columns result-sheet__columns--one"}>
          {score ? (
            <section className="result-sheet__panel" aria-labelledby="result-faan">
              <h3 id="result-faan" className="result-sheet__heading">
                Faan{others.length > 0 ? ` · ${name(winner!)}` : ""}
              </h3>
              <FaanLedger view={view} score={score} />
              {others.map((o) =>
                o.score ? (
                  <div key={o.winner} className="faan-ledger__also">
                    <h4 className="result-sheet__heading">Faan · {name(o.winner)}</h4>
                    <FaanLedger view={view} score={o.score} winner={o.winner} />
                  </div>
                ) : null,
              )}
            </section>
          ) : null}
          <section className="result-sheet__panel" aria-labelledby="result-pays">
            <div className="result-sheet__panel-head">
              <h3 id="result-pays" className="result-sheet__heading">
                {won ? "Who pays" : "Chips"}
              </h3>
              {won ? <span className="result-sheet__note">{payingRule(won)}</span> : null}
            </div>
            <WhoPays view={view} name={name} />
          </section>
        </div>

        <footer className="result-sheet__actions">
          <span className="result-sheet__next">
            {last || view.phase !== "handOver"
              ? "That was the last hand of the game."
              : result.dealerKeeps
                  ? `${name(view.dealer)} deals again`
                  : `The deal moves on · ${name(nextDealer)} deals hand ${view.handNumber + 1}`}
          </span>
          {onReplay ? (
            <button type="button" className="btn btn--ghost" onClick={onReplay}>
              Replay hand
            </button>
          ) : null}
          <button type="button" className="btn btn--ghost" onClick={onHide}>
            See the table
          </button>
          {view.phase === "handOver" ? (
            <button type="button" className="btn btn--primary" disabled={busy} onClick={onNextHand}>
              {last ? "Final scores" : "Next hand"}
            </button>
          ) : null}
        </footer>
      </section>
    </div>
  );
}
