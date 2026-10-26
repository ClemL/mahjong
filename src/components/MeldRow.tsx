"use client";

import type { Seat, Tile } from "@/game/tiles";
import { bonusTileScores } from "@/game/scoring";
import type { Meld } from "@/game/melds";
import { TileBack, TileFace } from "./TileView";

const MELD_TAG: Record<Meld["type"], string> = {
  chow: "Chow 上",
  pung: "Pung 碰",
  kong: "Kong 槓",
};

/**
 * One laid-open set. `fresh` marks the set just made from the newest discard:
 * its tiles gather in from the hand, the claimed one lands last, and the set
 * keeps a named tag until the next tile is thrown so a glance shows who took
 * what.
 */
export function MeldRow({
  meld,
  fresh = false,
  arriving = false,
}: {
  meld: Meld;
  fresh?: boolean;
  /** Still on its way here — forming elsewhere on screen — so its place is kept, empty. */
  arriving?: boolean;
}) {
  // A concealed kong is shown face down on the ends, as it is on a real table.
  if (meld.type === "kong" && meld.concealed) {
    return (
      <span className={arriving ? "meld meld--arriving" : "meld"}>
        <TileBack size="sm" />
        <TileFace code={meld.tiles[1].code} size="sm" />
        <TileFace code={meld.tiles[2].code} size="sm" />
        <TileBack size="sm" />
      </span>
    );
  }
  return (
    <span className={["meld", fresh ? "meld--fresh" : "", arriving ? "meld--arriving" : ""].filter(Boolean).join(" ")}>
      {fresh ? (
        <span className="meld__tag" aria-hidden>
          {MELD_TAG[meld.type]}
        </span>
      ) : null}
      {meld.tiles.map((t) => {
        const taken = t.id === meld.claimedTileId;
        return (
          <TileFace
            key={t.id}
            code={t.code}
            size="sm"
            entry={taken ? "claim" : null}
            className={fresh ? (taken ? "meld__taken" : "meld__gathered") : ""}
          />
        );
      })}
    </span>
  );
}

/**
 * The class that ghosts a bonus tile which would add nothing to its owner's
 * win — someone else's flower that only came along with the draw.
 */
export function bonusClass(code: Tile["code"], owner: { seat: Seat; flowers: Tile[] }): string {
  const held = owner.flowers.map((t) => t.code);
  return bonusTileScores(code, owner.seat, held) ? "" : "tile--idle";
}

/** Whether a meld was just made from this discard. */
export function isFreshClaim(meld: Meld, lastPlayedId: string | undefined): boolean {
  return lastPlayedId !== undefined && meld.claimedTileId === lastPlayedId;
}
