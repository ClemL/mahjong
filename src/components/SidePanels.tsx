"use client";

import type { GameState } from "@/game/engine";
import { SEAT_NAMES, type Seat, tileGlyph, seatWind } from "@/game/tiles";
import { DEFAULT_RULES, RULE_NOTES } from "@/game/rules";

export function ScorePanel({ state }: { state: GameState }) {
  return (
    <section className="panel">
      <h2 className="panel__title">Scores</h2>
      <div className="scores">
        {state.players.map((p) => (
          <div className="scores__row" key={`score-${p.seat}`}>
            <span className="seat__wind" style={{ fontSize: 15 }}>
              {tileGlyph(seatWind(p.seat))}
            </span>
            <span className="scores__name">
              {SEAT_NAMES[p.seat]}
              {p.isHuman ? " (you)" : ""}
              {state.dealer === p.seat ? " ·莊" : ""}
            </span>
            <span className="scores__value">
              {state.scores[p.seat] > 0 ? `+${state.scores[p.seat]}` : state.scores[p.seat]}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

export function LogPanel({ state, humanSeat }: { state: GameState; humanSeat: Seat }) {
  return (
    <section className="panel">
      <h2 className="panel__title">Table log</h2>
      <div className="log">
        {[...state.log].reverse().map((entry) => (
          <div
            key={entry.id}
            className={`log__entry${entry.seat === humanSeat ? " log__entry--own" : ""}`}
          >
            {entry.text}
          </div>
        ))}
      </div>
    </section>
  );
}

export function RulesPanel() {
  return (
    <section className="panel rules">
      <details>
        <summary>House rules</summary>
        <dl style={{ marginTop: 10 }}>
          {RULE_NOTES.map((note) => (
            <div key={note.title}>
              <dt>{note.title}</dt>
              <dd>{note.body}</dd>
            </div>
          ))}
        </dl>
      </details>
    </section>
  );
}

const FAAN_ROWS: [string, string, number][] = [
  ["平糊", "All Sequences", DEFAULT_RULES.faan.allChows],
  ["自摸", "Self Draw", DEFAULT_RULES.faan.selfDraw],
  ["門前清", "Concealed Hand", DEFAULT_RULES.faan.concealedHand],
  ["三元/門風/圈風", "Dragon, Seat or Round Wind Triplet", DEFAULT_RULES.faan.honorTriplet],
  ["正花", "Own Flower or Season (each)", 1],
  ["無花", "No Bonus Tiles", DEFAULT_RULES.faan.noBonus],
  ["槓上開花", "Win on Kong Replacement", DEFAULT_RULES.faan.kongReplacement],
  ["搶槓", "Robbing the Kong", DEFAULT_RULES.faan.robbingKong],
  ["海底撈月", "Win on the Last Tile", DEFAULT_RULES.faan.lastTile],
  ["對對糊", "All Triplets", DEFAULT_RULES.faan.allPungs],
  ["混一色", "Half Flush", DEFAULT_RULES.faan.halfFlush],
  ["全求人", "All Melds Claimed", DEFAULT_RULES.faan.allExposed],
  ["一台花", "Complete Set of Flowers or Seasons", DEFAULT_RULES.faan.bonusSet],
  ["小三元", "Small Three Dragons", DEFAULT_RULES.faan.smallThreeDragons],
  ["混幺九", "All Terminals and Honors", DEFAULT_RULES.faan.terminalsAndHonors],
  ["清一色", "Full Flush", DEFAULT_RULES.faan.fullFlush],
  ["大三元", "Big Three Dragons", DEFAULT_RULES.faan.bigThreeDragons],
  ["字一色", "All Honors", DEFAULT_RULES.faan.allHonors],
  ["清幺九", "All Terminals", DEFAULT_RULES.faan.allTerminals],
  ["小四喜", "Small Four Winds", DEFAULT_RULES.faan.smallFourWinds],
  ["九蓮寶燈", "Nine Gates", DEFAULT_RULES.faan.nineGates],
  ["大四喜", "Big Four Winds", DEFAULT_RULES.faan.bigFourWinds],
  ["十三么", "Thirteen Orphans", DEFAULT_RULES.faan.thirteenOrphans],
  ["十八羅漢", "Four Kongs", DEFAULT_RULES.faan.fourKongs],
  ["八仙過海", "All Eight Bonus Tiles", DEFAULT_RULES.faan.allEightBonus],
];

export function FaanPanel() {
  return (
    <section className="panel">
      <details>
        <summary>Faan table</summary>
        <p className="seat__meta" style={{ margin: "10px 0" }}>
          Minimum {DEFAULT_RULES.minFaan} faan to win; capped at {DEFAULT_RULES.limitFaan} faan
          ({DEFAULT_RULES.payoutTable[DEFAULT_RULES.limitFaan]} points).
        </p>
        <table className="faan-table">
          <thead>
            <tr>
              <th>Pattern</th>
              <th>Faan</th>
            </tr>
          </thead>
          <tbody>
            {FAAN_ROWS.map(([chinese, name, faan]) => (
              <tr key={name}>
                <td>
                  {chinese} · {name}
                </td>
                <td>{faan}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="seat__meta" style={{ marginTop: 10 }}>
          Payout: {DEFAULT_RULES.payoutTable.map((v, i) => `${i}→${v}`).join(", ")}.
        </p>
      </details>
    </section>
  );
}
