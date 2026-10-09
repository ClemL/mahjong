"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DRAGONS, FLOWERS, SEAT_NAMES, WINDS, flowerOwner, tileLabel, type TileCode } from "@/game/tiles";
import { TILE_STYLES } from "@/game/appearance";
import type { AppearanceApi } from "@/hooks/useAppearance";
import { Modal } from "./Modal";
import { TileFace } from "./TileView";
import { Choice } from "./Choice";

const RANKS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

interface Group {
  title: string;
  codes: TileCode[];
  /** Only bonus tiles need one: every other face already carries its name in the corner. */
  caption?: (code: TileCode) => string;
}

/** Which bonus tile it is and, beneath, the seat it scores for. */
const bonusCaption = (code: TileCode) => `${tileLabel(code)}\n${SEAT_NAMES[flowerOwner(code)!]}`;

const GROUPS: Group[] = [
  { title: "Characters 萬", codes: RANKS.map((r) => `m${r}`) },
  { title: "Dots 筒", codes: RANKS.map((r) => `p${r}`) },
  { title: "Bamboo 索", codes: RANKS.map((r) => `s${r}`) },
  { title: "Winds", codes: WINDS },
  { title: "Dragons", codes: DRAGONS },
  { title: "Flowers", codes: FLOWERS.slice(0, 4), caption: bonusCaption },
  { title: "Seasons", codes: FLOWERS.slice(4), caption: bonusCaption },
];

/**
 * One of every tile in the face currently chosen, so a player new to a face
 * can learn it before it turns up in a hand.
 */
export function TileReference({ api }: { api: AppearanceApi }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="btn btn--sm btn--ghost"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        Show every tile
      </button>
      {/* Portalled so the sheet escapes the settings drawer, which would clip
          it. A phone held upright turns the whole controller on its side, so
          there the sheet stays inside the controller and turns with it. */}
      {open
        ? createPortal(
            <Modal open title="Every tile" onClose={() => setOpen(false)} className="modal--wide tile-ref">
              <p className="modal__subtitle">
                Four of each suited tile, wind and dragon are in the wall, and one of each flower and season:
                144 in all. A bonus tile scores for the seat its number names.
              </p>
              <Choice
                label="Tile faces"
                options={TILE_STYLES}
                value={api.appearance.tiles}
                onChange={(value) => api.set("tiles", value)}
              />
              {GROUPS.map((group) => (
                <section key={group.title} className="tile-ref__group" aria-label={group.title}>
                  <h3 className="modal__section">{group.title}</h3>
                  <ul className={group.caption ? "tile-ref__row tile-ref__row--named" : "tile-ref__row"}>
                    {group.codes.map((code) => (
                      <li key={code} className="tile-ref__cell">
                        <TileFace code={code} size="lg" />
                        {group.caption ? (
                          <span className="tile-ref__caption" aria-hidden>
                            {group.caption(code)}
                          </span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </Modal>,
            trigger.current?.closest(".app--handset") ?? document.body,
          )
        : null}
    </>
  );
}
