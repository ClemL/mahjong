"use client";

import { useEffect, useState } from "react";
import { usePreferences } from "@/hooks/usePreferences";
import { useAppearance } from "@/hooks/useAppearance";
import { useCompactLayout } from "@/hooks/useCompactLayout";
import { GamePanel } from "./GamePanel";
import { PlayPanel } from "./PlayPanel";
import { AppearancePanel } from "./AppearancePanel";
import { Choice, type ChoiceOption } from "./Choice";
import { FilmDialog } from "./FilmPlayer";
import { BuildFooter } from "./BuildFooter";

/** The one multiplayer table this deployment serves; see FIXED_ROOM_ID on the server. */
export const TABLE_ROOM = "TABLE";

const LAYOUT: ChoiceOption<"standard" | "compact">[] = [
  { value: "standard", label: "Standard", hint: "A line for the prompt, roomy buttons" },
  {
    value: "compact",
    label: "Compact",
    hint: "One header line and slimmer buttons, so the hand tiles get larger",
  },
];

interface Mode {
  href: string;
  glyph: string;
  name: string;
  detail: string;
}

const MODES: Mode[] = [
  {
    href: "/solo",
    glyph: "獨",
    name: "Play solo",
    detail: "You against three computer opponents, on this device",
  },
  {
    href: `/room/${TABLE_ROOM}`,
    glyph: "眾",
    name: "Multiplayer",
    detail: "Take a seat at the shared table from your phone",
  },
  {
    href: `/room/${TABLE_ROOM}?seat=table`,
    glyph: "枱",
    name: "Tablet mode",
    detail: "This device becomes the table in the middle that everyone watches",
  },
];

type ResetState = { kind: "idle" } | { kind: "busy" } | { kind: "done" } | { kind: "error"; message: string };

/**
 * Where every visit starts: the options that are set once, then the way in.
 *
 * Settings come first because they are what people otherwise have to dig
 * through a drawer for mid-game; everything here is remembered on this device,
 * so a returning player can go straight to the buttons.
 */
export function StartPage() {
  const prefs = usePreferences();
  const appearance = useAppearance();
  const layout = useCompactLayout();
  const [film, setFilm] = useState(false);
  const [reset, setReset] = useState<ResetState>({ kind: "idle" });

  // The phone layout is read from storage during the first render, which the
  // server cannot do; hold that one control back until hydration is over.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const resetTable = async () => {
    if (
      !confirm(
        "Reset the multiplayer table? Everyone at it — the players and the table screen — goes back to choosing a seat, and the scores and house rules go back to the defaults.",
      )
    ) {
      return;
    }
    setReset({ kind: "busy" });
    try {
      const response = await fetch(`/api/rooms/${TABLE_ROOM}/reset`, { method: "POST" });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        setReset({ kind: "error", message: body.error ?? "Could not reset the table" });
        return;
      }
      // The seat this device held is gone with everyone else's.
      try {
        window.localStorage.removeItem(`hk-mahjong.room.${TABLE_ROOM}`);
      } catch {
        // Nothing stored, or storage blocked — either way there is no stale seat.
      }
      setReset({ kind: "done" });
    } catch {
      setReset({ kind: "error", message: "Could not reach the table" });
    }
  };

  return (
    <main className="app start">
      <header className="start__head">
        <h1 className="start__title">
          <span>麻雀</span>Hong Kong Mahjong
        </h1>
        <p className="lobby__lead">
          Old-style Hong Kong rules with the full 144-tile set. Set the table up the way you like
          it, then choose how to play.
        </p>
      </header>

      <nav className="start__modes" aria-label="How to play">
        {MODES.map((mode) => (
          <a key={mode.name} className="start__mode" href={mode.href}>
            <span className="start__mode-glyph" aria-hidden="true">
              {mode.glyph}
            </span>
            <span className="start__mode-name">{mode.name}</span>
            <span className="start__mode-detail">{mode.detail}</span>
          </a>
        ))}
      </nav>

      <div className="start__aside">
        <button type="button" className="btn btn--sm btn--primary topbar__film" onClick={() => setFilm(true)}>
          How to play
        </button>
        <span className="start__spacer" />
        <button
          type="button"
          className="btn btn--sm btn--ghost btn--reset"
          disabled={reset.kind === "busy"}
          onClick={() => void resetTable()}
        >
          Reset multiplayer table
        </button>
      </div>
      {reset.kind === "done" ? (
        <p className="lobby__warn" role="status">
          The multiplayer table is empty. Everyone goes back to choosing a seat.
        </p>
      ) : null}
      {reset.kind === "error" ? <p className="lobby__error">{reset.message}</p> : null}

      <h2 className="start__section">Settings</h2>
      <div className="start__settings">
        <div className="start__column">
          <GamePanel
            api={prefs}
            note="Used for solo games, and set on the multiplayer table when this device opens it in tablet mode."
          />
          <PlayPanel api={prefs} />
          <section className="panel">
            <details open>
              <summary>This phone</summary>
              <div className="appearance">
                {mounted ? (
                  <Choice
                    label="Phone layout"
                    options={LAYOUT}
                    value={layout.compact ? "compact" : "standard"}
                    onChange={(value) => layout.setCompact(value === "compact")}
                  />
                ) : null}
              </div>
            </details>
          </section>
        </div>
        <div className="start__column">
          <AppearancePanel api={appearance} />
        </div>
      </div>

      {film ? <FilmDialog onClose={() => setFilm(false)} /> : null}
      <BuildFooter />
    </main>
  );
}
