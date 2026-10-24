"use client";

import { useState } from "react";
import type { RoomView } from "@/game/room";
import type { Seat } from "@/game/tiles";
import { cardFileName, scoreCard, shareScoreCard } from "./scoreCard";

const SAID: Record<"shared" | "saved" | "failed", string> = {
  shared: "Shared",
  saved: "Image saved",
  failed: "Could not draw it",
};

/**
 * One tap from the final scores to a picture of them: the share sheet on a
 * phone or tablet that has one, a saved image anywhere else.
 */
export function ShareScores({
  view,
  name,
  className,
}: {
  view: RoomView;
  name: (seat: Seat) => string;
  className: string;
}) {
  const [said, setSaid] = useState<keyof typeof SAID | null>(null);
  const share = () => {
    const font = getComputedStyle(document.body).fontFamily || "system-ui, sans-serif";
    const date = new Date().toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
    void shareScoreCard(scoreCard(view, name), { fileName: cardFileName(view), font, date }).then((outcome) =>
      setSaid(outcome === "cancelled" ? null : outcome),
    );
  };
  return (
    <button type="button" className={className} title="Send the final scores as a picture" onClick={share}>
      <span aria-live="polite">{said ? SAID[said] : "Share scores"}</span>
    </button>
  );
}
