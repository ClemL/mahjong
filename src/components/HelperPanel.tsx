"use client";

import { useMemo } from "react";
import type { Meld } from "@/game/melds";
import type { RuleConfig } from "@/game/rules";
import { partialSets } from "@/game/helper";
import { type OpenSeat, type Wait, standingWaits } from "@/game/waits";
import { type Tile, type TileCode, tileName } from "@/game/tiles";
import { TileFace } from "./TileView";

/** The tiles that would finish something, each with how many are still out there to be drawn or thrown. */
export function WaitList({ waits }: { waits: Wait[] }) {
  return (
    <span className="waits">
      {waits.map((w) => (
        <span
          key={w.code}
          className={w.left === 0 ? "waits__tile waits__tile--dead" : "waits__tile"}
          title={`${tileName(w.code)}: ${w.left} left`}
        >
          <TileFace code={w.code} size="sm" />
          <span className="waits__left" aria-hidden>
            ×{w.left}
          </span>
          <span className="sr-only">
            {tileName(w.code)}, {w.left} left
          </span>
        </span>
      ))}
    </span>
  );
}

/** The ♿ toggle that opens the helper. */
export function HelperButton({
  open,
  onToggle,
  className = "btn btn--sm btn--ghost",
}: {
  open: boolean;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={`${className} helper__toggle`}
      aria-pressed={open}
      aria-expanded={open}
      aria-label="Helper: what finishes the sets you have started"
      title="What finishes the sets you have started"
      onClick={onToggle}
    >
      <span aria-hidden>♿</span>
    </button>
  );
}

/**
 * Every set the hand has started, and the tiles that would finish it — plus,
 * once the hand is ready, what it wins on. Read from the player's own tiles
 * and the open table only.
 */
export function HelperPanel({
  hand,
  melds,
  seats,
  seatWind,
  roundWind,
  config,
}: {
  hand: Tile[];
  melds: Meld[];
  seats: OpenSeat[];
  seatWind: TileCode;
  roundWind: TileCode;
  config: Pick<RuleConfig, "faan">;
}) {
  const parts = useMemo(
    () => partialSets(hand, seatWind, roundWind, config, seats),
    [hand, seatWind, roundWind, config, seats],
  );
  const wins = useMemo(() => standingWaits(hand, melds, seats), [hand, melds, seats]);
  return (
    <section className="helper" aria-label="Helper" aria-live="polite">
      {wins.length > 0 ? (
        <p className="helper__row">
          <span className="helper__label">Ready — wins on</span>
          <WaitList waits={wins} />
        </p>
      ) : null}
      {parts.length === 0 && wins.length === 0 ? (
        <p className="helper__row helper__label">No sets started: no pairs or tiles a step apart.</p>
      ) : null}
      {parts.map((part) => (
        <p key={part.tileIds.join()} className="helper__row">
          <span className="helper__held">
            {part.codes.map((code, i) => (
              <TileFace key={i} code={code} size="sm" />
            ))}
            <span className="sr-only">
              {part.codes.map(tileName).join(" and ")}
            </span>
          </span>
          <span className="helper__label">{part.kind === "pair" ? "pung with" : "run with"}</span>
          <WaitList waits={part.needs} />
        </p>
      ))}
    </section>
  );
}
