"use client";

import type { CSSProperties } from "react";
import { useCountdown } from "@/hooks/useCountdown";
import type { ClaimOption } from "@/game/engine";
import { CLAIM_WINDOW_MS } from "@/game/room";
import { type TileCode, tileName } from "@/game/tiles";
import { TileFace } from "./TileView";

export const CLAIM_LABEL: Record<ClaimOption["type"], string> = {
  chow: "Chow 上",
  pung: "Pung 碰",
  kong: "Kong 槓",
  win: "Win 糊",
};

/** Where the claimed tile lands: its place in a run, or the end of a set. */
export function claimedIndex(option: ClaimOption, discard: TileCode): number {
  return option.type === "chow" ? option.codes.indexOf(discard) : option.codes.length - 1;
}

function describe(option: ClaimOption, discard: TileCode): string {
  if (option.type === "win") return `Win on ${tileName(discard)}`;
  const taken = claimedIndex(option, discard);
  const yours = option.codes.filter((_, i) => i !== taken).map(tileName);
  return `${option.type[0].toUpperCase()}${option.type.slice(1)} ${option.codes
    .map(tileName)
    .join(", ")}, using your ${yours.join(" and ")}`;
}

/**
 * The answers to a discard. Each claim shows the meld it would make, with the
 * discard turned sideways as it is laid on a real table, so two or three ways
 * to chow the same tile can be told apart before choosing. Pressing or
 * hovering one reports it through `onPreview`, so the hand can lift the tiles
 * that claim would take.
 */
export function ClaimChoices({
  options,
  discard,
  deadlineIn,
  busy,
  onClaim,
  onPreview,
}: {
  options: ClaimOption[];
  discard: TileCode;
  deadlineIn: number;
  busy: boolean;
  onClaim: (optionId: string | null) => void;
  onPreview?: (option: ClaimOption | null) => void;
}) {
  const left = useCountdown(deadlineIn) ?? 0;
  const timer: CSSProperties & { "--left": number } = {
    "--left": Math.min(1, left / CLAIM_WINDOW_MS),
  };

  return (
    <div className="claims" role="group" aria-label={`Claim ${tileName(discard)}?`}>
      {options.map((option) => {
        const taken = claimedIndex(option, discard);
        return (
          <button
            key={option.id}
            type="button"
            className={`claim claim--${option.type}`}
            disabled={busy}
            aria-label={describe(option, discard)}
            onClick={() => onClaim(option.id)}
            onPointerEnter={() => onPreview?.(option)}
            onPointerLeave={() => onPreview?.(null)}
            onFocus={() => onPreview?.(option)}
            onBlur={() => onPreview?.(null)}
          >
            <span className="claim__label">{CLAIM_LABEL[option.type]}</span>
            <span className="claim__meld" aria-hidden>
              {option.type === "win" ? (
                <span className="claim__taken">
                  <TileFace code={discard} size="sm" />
                </span>
              ) : (
                option.codes.map((code, i) =>
                  i === taken ? (
                    <span key={i} className="claim__taken">
                      <TileFace code={code} size="sm" />
                    </span>
                  ) : (
                    <TileFace key={i} code={code} size="sm" />
                  ),
                )
              )}
            </span>
          </button>
        );
      })}
      <button
        type="button"
        className="btn btn--ghost claims__pass"
        disabled={busy}
        onClick={() => onClaim(null)}
      >
        Pass
        <span className="claims__timer" style={timer}>
          {Math.ceil(left / 1000)}s
        </span>
      </button>
    </div>
  );
}
