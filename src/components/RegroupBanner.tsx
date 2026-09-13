"use client";

import type { RoomView } from "@/game/room";
import type { RoomApi } from "@/hooks/useRoom";

/**
 * Shown over a warm-up game once a second person sits down. The solo hand was
 * only ever something to do while waiting, so the table offers to drop it and
 * deal everyone in rather than leaving the newcomer to watch the computer play.
 */
export function RegroupBanner({ api, view }: { api: RoomApi; view: RoomView }) {
  const arrivals = view.players
    .filter((p) => p.occupant.kind === "human" && p.seat !== view.you.seat)
    .map((p) => p.occupant.name)
    .filter((name): name is string => name !== null);

  return (
    <div className="regroup" role="status">
      <span className="regroup__text">
        <b>{arrivals.length === 1 ? arrivals[0] : `${arrivals.length} others`}</b>{" "}
        {arrivals.length === 1 ? "has" : "have"} sat down. This was a game against
        the computer — deal everyone in?
      </span>
      <button
        type="button"
        className="btn btn--primary"
        disabled={api.busy}
        onClick={() => void api.control({ type: "regroup" })}
      >
        Deal everyone in
      </button>
    </div>
  );
}
