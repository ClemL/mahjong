"use client";

import type { RoomView } from "@/game/room";
import type { Seat } from "@/game/tiles";
import { isLastHand, joinNames } from "./TableResult";

/**
 * Saying you are ready for the next hand. Once everybody at the table has, it
 * is dealt — nobody has to walk over and press Next hand on the tablet.
 */
export function ReadyUp({
  view,
  seat,
  nameOf,
  busy,
  onReady,
}: {
  view: RoomView;
  seat: Seat;
  nameOf: (s: Seat) => string;
  busy: boolean;
  onReady: () => void;
}) {
  const next = isLastHand(view) ? "the final scores" : "the next hand";
  if (view.ready.includes(seat)) {
    const waiting = view.readyWaiting.filter((s) => s !== seat);
    return (
      <span className="ready ready--done" role="status">
        ✓ Ready
        <span className="ready__note">
          {waiting.length > 0 ? ` · waiting for ${joinNames(waiting.map(nameOf))}` : ` · on to ${next}`}
        </span>
      </span>
    );
  }
  const others = view.ready.filter((s) => s !== seat);
  return (
    <span className="ready">
      <button type="button" className="btn btn--primary ready__btn" disabled={busy} onClick={onReady}>
        Ready for {next}
      </button>
      {others.length > 0 ? (
        <span className="ready__note">
          {joinNames(others.map(nameOf))} {others.length === 1 ? "is" : "are"} ready
        </span>
      ) : null}
    </span>
  );
}
