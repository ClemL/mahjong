"use client";

import {
  type TileCode,
  isFlower,
  isHonor,
  rankOf,
  tileGlyph,
  tileLabel,
  tileName,
  tileSuitGlyph,
} from "@/game/tiles";
import { TilePips, hasPips } from "./TilePips";
import { TraditionalPips } from "./TraditionalPips";

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

/** Western sets index winds by letter; dragons and bonus tiles carry none. */
const WIND_INDEX: Record<string, string> = { we: "E", ws: "S", ww: "W", wn: "N" };

/**
 * The face itself. Every face a tile can wear is rendered and CSS shows the
 * ones the chosen tile style calls for, so switching is instant and no
 * component has to know the setting. Dots and Bamboo carry a plain and a
 * painted pip drawing and a numeral face; every suited tile also carries an
 * Arabic numeral for the Western style, and suited tiles and winds a corner
 * index.
 */
function TileArt({ code }: { code: TileCode }) {
  const pips = hasPips(code);
  const suit = tileSuitGlyph(code);
  const rank = rankOf(code);
  const index = rank ? String(rank) : WIND_INDEX[code];
  return (
    <>
      {index ? (
        <span className="tile__index" aria-hidden>
          {index}
        </span>
      ) : null}
      {pips ? <TilePips code={code} /> : null}
      {pips ? <TraditionalPips code={code} /> : null}
      {/* Parlour sets paint the White Dragon as an empty blue frame. */}
      {code === "dw" ? <span className="tile__frame" aria-hidden /> : null}
      <span
        className={[
          "tile__glyph",
          pips ? "tile__glyph--alt" : "",
          rank ? "tile__glyph--cn" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {tileGlyph(code)}
      </span>
      {rank ? <span className="tile__glyph tile__glyph--arabic">{rank}</span> : null}
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
  /**
   * Not actionable right now, but still there to be touched — a tile can be
   * dragged into place while it is not your turn. A disabled button would
   * swallow the pointer events that dragging needs.
   */
  inactive?: boolean;
  /** Identifies the tile to a container handling drags. */
  tileId?: string;
  ariaLabel?: string;
}

export function TileButton({ onClick, disabled, inactive, tileId, ariaLabel, ...face }: ButtonProps) {
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
        face.className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={onClick}
      disabled={disabled}
      aria-disabled={inactive || undefined}
      data-tile-id={tileId}
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
