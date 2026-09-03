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
import { TilePips, hasPips } from "./TilePips";

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

/**
 * The face itself. Dots and Bamboo carry both a pip drawing and a numeral
 * face; CSS shows one according to the chosen tile style, so switching is
 * instant and no component has to know the setting. Characters and honors
 * only ever have the glyph face.
 */
function TileArt({ code }: { code: TileCode }) {
  const pips = hasPips(code);
  const suit = tileSuitGlyph(code);
  return (
    <>
      {pips ? <TilePips code={code} /> : null}
      <span className={pips ? "tile__glyph tile__glyph--alt" : "tile__glyph"}>
        {tileGlyph(code)}
      </span>
      {suit ? (
        <span className={pips ? "tile__suit tile__suit--alt" : "tile__suit"}>{suit}</span>
      ) : null}
    </>
  );
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
      <TileArt code={code} />
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
      <TileArt code={face.code} />
      {face.ready ? <span className="tile__ready" aria-hidden /> : null}
    </button>
  );
}

export function TileBack({ size = "sm" }: { size?: TileSize }) {
  return <span className={`tile tile--${size} tile--back`} aria-hidden />;
}
