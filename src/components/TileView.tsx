"use client";

import {
  type TileCode,
  isFlower,
  isHonor,
  tileGlyph,
  tileLabel,
  tileName,
  tileSuitGlyph,
} from "@/game/tiles";

export type TileSize = "sm" | "md" | "lg";

/** Where a tile animates in from, expressed relative to the viewer. */
export type TossFrom = "bottom" | "top" | "left" | "right";

/** How a tile entered its current place, driving the entry animation. */
export type TileEntry = "toss" | "claim" | "draw" | null;

function entryClass(entry: TileEntry, from: TossFrom): string {
  switch (entry) {
    case "toss":
      return `tile--toss-${from}`;
    case "claim":
      return "tile--claimed";
    case "draw":
      return "tile--drew";
    default:
      return "";
  }
}

function colorClass(code: TileCode): string {
  if (isFlower(code)) return "tile--f";
  if (isHonor(code)) return code[0] === "w" ? "tile--w" : `tile--${code}`;
  return `tile--${code[0]}`;
}

interface FaceProps {
  code: TileCode;
  size?: TileSize;
  /** Highlight styles. */
  drawn?: boolean;
  justDiscarded?: boolean;
  dim?: boolean;
  /** Green dot marking a discard that would leave the hand ready. */
  ready?: boolean;
  /** Entry animation played once when the tile appears. */
  entry?: TileEntry;
  /** Direction a tossed tile flies in from. */
  tossFrom?: TossFrom;
  className?: string;
}

export function TileFace({
  code,
  size = "md",
  drawn,
  justDiscarded,
  dim,
  ready,
  entry = null,
  tossFrom = "bottom",
  className = "",
}: FaceProps) {
  const suit = tileSuitGlyph(code);
  return (
    <span
      className={[
        "tile",
        `tile--${size}`,
        colorClass(code),
        drawn ? "tile--drawn" : "",
        justDiscarded ? "tile--just-discarded" : "",
        dim ? "tile--dim" : "",
        entryClass(entry, tossFrom),
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      title={tileName(code)}
    >
      <span className="tile__label" aria-hidden>
        {tileLabel(code)}
      </span>
      <span className="tile__glyph">{tileGlyph(code)}</span>
      {suit ? <span className="tile__suit">{suit}</span> : null}
      {ready ? <span className="tile__ready" aria-hidden /> : null}
      <span className="sr-only">{tileName(code)}</span>
    </span>
  );
}

interface ButtonProps extends FaceProps {
  onClick: () => void;
  disabled?: boolean;
  ariaLabel?: string;
}

export function TileButton({ onClick, disabled, ariaLabel, ...face }: ButtonProps) {
  return (
    <button
      type="button"
      className={[
        "tile",
        "tile--button",
        `tile--${face.size ?? "md"}`,
        colorClass(face.code),
        face.drawn ? "tile--drawn" : "",
        entryClass(face.entry ?? null, face.tossFrom ?? "bottom"),
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel ?? `Discard ${tileName(face.code)}`}
      title={tileName(face.code)}
    >
      <span className="tile__label" aria-hidden>
        {tileLabel(face.code)}
      </span>
      <span className="tile__glyph">{tileGlyph(face.code)}</span>
      {tileSuitGlyph(face.code) ? (
        <span className="tile__suit">{tileSuitGlyph(face.code)}</span>
      ) : null}
      {face.ready ? <span className="tile__ready" aria-hidden /> : null}
    </button>
  );
}

export function TileBack({ size = "sm" }: { size?: TileSize }) {
  return <span className={`tile tile--${size} tile--back`} aria-hidden />;
}
