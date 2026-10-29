"use client";

import { type KeyboardEvent, useEffect, useId, useRef, useState } from "react";
import { type GameSettings, usePreferences } from "@/hooks/usePreferences";
import { type AppearanceApi, useAppearance } from "@/hooks/useAppearance";
import { useCompactLayout } from "@/hooks/useCompactLayout";
import { SUIT_PALETTES, THEMES, TILE_BACKS, TILE_BODIES, TILE_STYLES } from "@/game/appearance";
import type { TileCode } from "@/game/tiles";
import { TABLES, type TableInfo, findTable } from "@/game/tables";
import { GAME_LENGTHS } from "./gameLength";
import { MIN_FAAN } from "./TableSettings";
import { Segmented } from "./SettingControls";
import { Choice } from "./Choice";
import { TileReference } from "./TileReference";
import { TileBack, TileFace } from "./TileView";
import { FilmDialog } from "./FilmPlayer";
import { BuildFooter } from "./BuildFooter";

/** Which table this device last chose, so a returning player lands on it again. */
const TABLE_KEY = "hk-mahjong.table";
/** Which settings tab this device last had open. */
const TAB_KEY = "hk-mahjong.start-tab";

/** A phone-sized screen, held either way up: the page's short side is under a tablet's. */
const PHONE_SIZED = "(orientation: landscape) and (max-height: 560px), (orientation: portrait) and (max-width: 560px)";

type Tab = "rules" | "look" | "phone";

const TABS: { key: Tab; name: string }[] = [
  { key: "rules", name: "House rules" },
  { key: "look", name: "Table & tiles" },
  { key: "phone", name: "This phone" },
];

type ResetState =
  | { kind: "idle" }
  | { kind: "busy" }
  | { kind: "done"; table: string }
  | { kind: "error"; message: string };

/** Enough of a table's public view to say whether it is free. */
interface TableStatus {
  started: boolean;
  seatedCount: number;
  tablePresent: boolean;
}

function statusLine(status: TableStatus | undefined): string {
  if (!status) return " ";
  const players = `${status.seatedCount} ${status.seatedCount === 1 ? "player" : "players"}`;
  if (status.started) return `In play · ${players}`;
  if (status.seatedCount > 0) return `${players} waiting · ${status.tablePresent ? "screen up" : "no table screen"}`;
  return status.tablePresent ? "Screen up, no players" : "Empty";
}

/**
 * Where every visit starts: pick a table and a way in on the left, and the
 * settings that are set once on the right, each in its own tab, under a
 * preview of the table as it will look.
 *
 * A tablet opens on the look, which is what it is about to show everyone; a
 * phone opens on its own layout. Everything is remembered on this device.
 */
export function StartPage() {
  const prefs = usePreferences();
  const appearance = useAppearance();
  const [film, setFilm] = useState(false);
  const [reset, setReset] = useState<ResetState>({ kind: "idle" });
  const [table, setTable] = useState<TableInfo>(TABLES[0]);
  const [statuses, setStatuses] = useState<Record<string, TableStatus>>({});
  // Null until hydration is over: which tab opens depends on the screen and on
  // storage, and the phone layout is read from storage too, none of which the
  // server can see.
  const [tab, setTab] = useState<Tab | null>(null);
  const ids = useId();
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    try {
      const stored = findTable(window.localStorage.getItem(TABLE_KEY) ?? "");
      if (stored) setTable(stored);
    } catch {
      // No storage: Table 1, as before there were three.
    }
    let storedTab: string | null = null;
    try {
      storedTab = window.localStorage.getItem(TAB_KEY);
    } catch {
      // Falls back to the screen's own default.
    }
    const phone = window.matchMedia?.(PHONE_SIZED).matches ?? false;
    setTab(TABS.find((t) => t.key === storedTab)?.key ?? (phone ? "phone" : "look"));
  }, []);

  // One look at each table, so people can pick a free one. A table that cannot
  // be read just shows no status; the links still work.
  const [statusEpoch, setStatusEpoch] = useState(0);
  useEffect(() => {
    let live = true;
    for (const t of TABLES) {
      fetch(`/api/rooms/${t.id}`)
        .then((response) => (response.ok ? response.json() : null))
        .then((body: Partial<TableStatus> | null) => {
          if (!live || !body || typeof body.seatedCount !== "number") return;
          const status: TableStatus = {
            started: Boolean(body.started),
            seatedCount: body.seatedCount,
            tablePresent: Boolean(body.tablePresent),
          };
          setStatuses((current) => ({ ...current, [t.id]: status }));
        })
        .catch(() => {});
    }
    return () => {
      live = false;
    };
  }, [statusEpoch]);

  const choose = (next: TableInfo) => {
    setTable(next);
    setReset({ kind: "idle" });
    try {
      window.localStorage.setItem(TABLE_KEY, next.id);
    } catch {
      // The choice still holds for this visit.
    }
  };

  const openTab = (next: Tab) => {
    setTab(next);
    try {
      window.localStorage.setItem(TAB_KEY, next);
    } catch {
      // The tab still opens; it just is not remembered.
    }
  };

  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = TABS.length - 1;
    const next =
      e.key === "ArrowRight"
        ? (index + 1) % TABS.length
        : e.key === "ArrowLeft"
          ? (index + last) % TABS.length
          : e.key === "Home"
            ? 0
            : e.key === "End"
              ? last
              : null;
    if (next === null) return;
    e.preventDefault();
    openTab(TABS[next].key);
    tabs.current[next]?.focus();
  };

  const resetTable = async () => {
    const target = table;
    if (
      !confirm(
        `Reset ${target.name}? Everyone at it — the players and the table screen — goes back to choosing a seat, and the scores and house rules go back to the defaults. The other tables are not touched.`,
      )
    ) {
      return;
    }
    setReset({ kind: "busy" });
    try {
      const response = await fetch(`/api/rooms/${target.id}/reset`, { method: "POST" });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        setReset({ kind: "error", message: body.error ?? "Could not reset the table" });
        return;
      }
      // The seat this device held is gone with everyone else's.
      try {
        window.localStorage.removeItem(`hk-mahjong.room.${target.id}`);
      } catch {
        // Nothing stored, or storage blocked — either way there is no stale seat.
      }
      setReset({ kind: "done", table: target.name });
      setStatusEpoch((n) => n + 1);
    } catch {
      setReset({ kind: "error", message: "Could not reach the table" });
    }
  };

  return (
    <main className="app bench">
      <section className="bench__start" aria-label="Start a game">
        <h1 className="bench__title">
          <span>麻雀</span>Hong Kong Mahjong
        </h1>
        <p className="bench__lead">
          Old-style rules, the full 144 tiles. A tablet in the middle is the table; each player holds a phone
          sideways, and seats nobody takes are played by the computer.
        </p>

        <fieldset className="bench__tables">
          <legend className="bench__legend">Table</legend>
          {TABLES.map((t) => {
            const on = t.id === table.id;
            const status = statuses[t.id];
            return (
              <label key={t.id} className={`bench__table${on ? " bench__table--on" : ""}`}>
                <input
                  type="radio"
                  name="table"
                  className="bench__radio"
                  checked={on}
                  aria-labelledby={`${ids}-${t.id}`}
                  aria-describedby={`${ids}-${t.id}-status`}
                  onChange={() => choose(t)}
                />
                <span className="bench__table-text">
                  <span className="bench__table-name" id={`${ids}-${t.id}`}>
                    {t.name}
                  </span>
                  <span className="bench__table-status" id={`${ids}-${t.id}-status`}>
                    {statusLine(status)}
                  </span>
                </span>
                {status ? <SeatDots seated={status.seatedCount} /> : null}
              </label>
            );
          })}
        </fieldset>

        {/* The table screen leads on a tablet and the chair on a phone; only the
            emphasis moves, so the order is the same for the eye and the keyboard. */}
        <nav className="bench__ways" aria-label="Ways in">
          <a
            className="bench__way bench__way--table"
            href={`/room/${table.id}?seat=table`}
            aria-label={`Be ${table.name} on this screen`}
          >
            <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
              <rect x="2" y="4" width="20" height="16" rx="2" />
            </svg>
            <span className="bench__way-long">Be {table.name} on this screen</span>
            <span className="bench__way-short">Be {table.name}</span>
          </a>
          <a className="bench__way bench__way--seat" href={`/room/${table.id}`} aria-label={`Sit down at ${table.name}`}>
            <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9">
              <rect x="2" y="7" width="20" height="10" rx="2" />
            </svg>
            <span className="bench__way-long">Sit down at {table.name}</span>
            <span className="bench__way-short">Sit down</span>
          </a>
        </nav>

        <div className="bench__aside">
          <button type="button" className="bench__film" onClick={() => setFilm(true)}>
            <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24">
              <path d="M7 4l13 8-13 8z" fill="currentColor" />
            </svg>
            How to play
          </button>
          <span className="bench__spacer" />
          <button
            type="button"
            className="bench__reset"
            disabled={reset.kind === "busy"}
            onClick={() => void resetTable()}
          >
            Reset {table.name}…
          </button>
        </div>
        {reset.kind === "done" ? (
          <p className="lobby__warn" role="status">
            {reset.table} is empty. Everyone at it goes back to choosing a seat.
          </p>
        ) : null}
        {reset.kind === "error" ? <p className="lobby__error">{reset.message}</p> : null}

        <BuildFooter />
      </section>

      <section className="bench__panel" aria-label="Settings">
        <Preview api={appearance} />

        <div role="tablist" aria-label="Settings" className="bench__tabs">
          {TABS.map((t, i) => {
            const on = t.key === tab;
            return (
              <button
                key={t.key}
                ref={(el) => {
                  tabs.current[i] = el;
                }}
                type="button"
                role="tab"
                id={`${ids}-tab-${t.key}`}
                aria-selected={on}
                aria-controls={`${ids}-panel`}
                tabIndex={on || (tab === null && i === 0) ? 0 : -1}
                className="bench__tab"
                onClick={() => openTab(t.key)}
                onKeyDown={(e) => onTabKey(e, i)}
              >
                {t.name}
              </button>
            );
          })}
        </div>

        {tab ? (
          <div className="bench__body" role="tabpanel" id={`${ids}-panel`} aria-labelledby={`${ids}-tab-${tab}`}>
            {tab === "rules" ? <RulesTab api={prefs} /> : null}
            {tab === "look" ? <LookTab api={appearance} /> : null}
            {tab === "phone" ? <PhoneTab /> : null}
          </div>
        ) : null}
      </section>

      {film ? <FilmDialog onClose={() => setFilm(false)} /> : null}
    </main>
  );
}

/** Who is already at a table, one mark per chair: filled for a player, a ring for an empty chair. */
function SeatDots({ seated }: { seated: number }) {
  return (
    <span className="bench__dots" aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <span key={i} className={`bench__dot${i < seated ? " bench__dot--on" : ""}`} />
      ))}
    </span>
  );
}

const WALL = 10;
const POND: TileCode[] = ["wn", "dg", "m9", "ww"];
const HAND: TileCode[] = ["m1", "m2", "m3", "p4", "p5", "p6", "s7", "s8", "s9", "dr", "dr"];

/**
 * A corner of the table in the look chosen right now: the wall, a few
 * discards with the latest one marked, and a hand. Everything in it follows
 * the same data- attributes the real table does, so it cannot drift from it.
 */
function Preview({ api }: { api: AppearanceApi }) {
  const { theme, tiles, body } = api.appearance;
  const name = (options: { value: string; label: string }[], value: string) =>
    options.find((o) => o.value === value)?.label ?? value;
  return (
    <div
      className="bench__preview"
      role="img"
      aria-label={`Preview of the ${name(THEMES, theme)} table with ${name(TILE_STYLES, tiles)} tile faces on ${name(TILE_BODIES, body)} tiles`}
    >
      <div className="bench__felt">
        <span className="bench__preview-label" aria-hidden="true">
          Preview
        </span>
        <div className="bench__wall">
          {Array.from({ length: WALL }, (_, i) => (
            <TileBack key={i} size="sm" />
          ))}
        </div>
        <div className="bench__pond">
          {POND.map((code, i) => (
            <TileFace key={i} code={code} size="sm" justDiscarded={i === POND.length - 1} />
          ))}
        </div>
        <div className="bench__hand">
          {HAND.map((code, i) => (
            <TileFace key={i} code={code} size="md" />
          ))}
        </div>
      </div>
    </div>
  );
}

function RulesTab({ api }: { api: GameSettings }) {
  return (
    <div className="bench__rules">
      <Segmented
        label="Min faan"
        options={MIN_FAAN}
        value={`${api.minFaan}` as `${number}`}
        onChange={(value) => api.setMinFaan(Number(value))}
      />
      <Segmented
        label="Game length"
        options={GAME_LENGTHS}
        value={`${api.rounds}` as `${number}`}
        onChange={(value) => api.setRounds(Number(value))}
      />
      <p className="bench__note">
        A table starts with these when this device opens it as the table. Once a table is up, its house rules are
        changed on the table itself.
      </p>
    </div>
  );
}

function Check() {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12l5 5 9-10" />
    </svg>
  );
}

function LookTab({ api }: { api: AppearanceApi }) {
  const { appearance, set, reset } = api;
  const back = TILE_BACKS.find((b) => b.value === appearance.backs) ?? TILE_BACKS[0];
  return (
    <div className="bench__look">
      <div className="bench__field">
        <span className="bench__label" aria-hidden="true">
          Table
        </span>
        {/* Named apart from the table picker beside it, which is also "Table". */}
        <div className="bench__themes" role="group" aria-label="Table color">
          {THEMES.map((option) => {
            const on = option.value === appearance.theme;
            return (
              <button
                key={option.value}
                type="button"
                className="bench__theme"
                aria-pressed={on}
                title={option.hint}
                onClick={() => set("theme", option.value)}
              >
                {/* The swatch wears its own theme's colours; the ring around it
                    stays in the page's, so the choice reads on every swatch. */}
                <span className="bench__theme-ring">
                  <span className="bench__theme-chip" data-theme={option.value}>
                    {on ? <Check /> : null}
                  </span>
                </span>
                {option.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="bench__look-grid">
        <Choice label="Tile faces" options={TILE_STYLES} value={appearance.tiles} onChange={(v) => set("tiles", v)} />
        <Choice label="Tile body" options={TILE_BODIES} value={appearance.body} onChange={(v) => set("body", v)} />
        <div className="bench__field">
          <span className="bench__label" id="bench-backs-label">
            Tile backs
          </span>
          <div className="bench__backs" role="group" aria-labelledby="bench-backs-label">
            {TILE_BACKS.map((option) => {
              const on = option.value === appearance.backs;
              return (
                <button
                  key={option.value}
                  type="button"
                  className="bench__back"
                  aria-label={option.label}
                  aria-pressed={on}
                  title={option.hint}
                  onClick={() => set("backs", option.value)}
                >
                  {/* "Match table" has no colours of its own: it borrows the
                      chosen table's back, whatever back the page wears now. */}
                  <span
                    className="bench__back-chip"
                    data-backs={option.value === "table" ? undefined : option.value}
                    data-theme={option.value === "table" ? appearance.theme : undefined}
                  >
                    {on ? <Check /> : null}
                  </span>
                </button>
              );
            })}
          </div>
          <span className="choice__hint">
            {back.label} · {back.hint.charAt(0).toLowerCase() + back.hint.slice(1)}
          </span>
        </div>
        <Choice label="Suit colors" options={SUIT_PALETTES} value={appearance.suits} onChange={(v) => set("suits", v)} />
      </div>

      <div className="bench__look-foot">
        <span className="bench__note">Saved on this device as you choose.</span>
        <span className="bench__spacer" />
        <TileReference api={api} />
        <button type="button" className="btn btn--sm btn--ghost" onClick={reset}>
          Reset to defaults
        </button>
      </div>
    </div>
  );
}

const LAYOUTS = [
  { compact: false, label: "Standard", hint: "A line for the prompt, roomy buttons" },
  { compact: true, label: "Compact", hint: "Slimmer bars, so the hand tiles get larger" },
];

function PhoneTab() {
  const layout = useCompactLayout();
  return (
    <div className="bench__phone">
      <span className="bench__label" id="bench-layout-label">
        Phone layout
      </span>
      <div className="bench__layouts" role="group" aria-labelledby="bench-layout-label">
        {LAYOUTS.map((option) => {
          const on = option.compact === layout.compact;
          return (
            <button
              key={option.label}
              type="button"
              className={`bench__layout${option.compact ? " bench__layout--compact" : ""}`}
              aria-pressed={on}
              onClick={() => layout.setCompact(option.compact)}
            >
              {/* A sketch of the controller: the bars, the hand, the buttons. */}
              <span className="bench__sketch" aria-hidden="true">
                <span className="bench__sketch-bar" />
                {option.compact ? null : <span className="bench__sketch-bar bench__sketch-bar--short" />}
                <span className="bench__sketch-hand">
                  {Array.from({ length: 8 }, (_, i) => (
                    <span key={i} />
                  ))}
                </span>
                <span className="bench__sketch-btns">
                  <span />
                  <span />
                </span>
              </span>
              <span className="bench__layout-name">
                {on ? <Check /> : null}
                {option.label}
              </span>
              <span className="bench__layout-hint">{option.hint}</span>
            </button>
          );
        })}
      </div>
      <p className="bench__note">
        House rules are decided on the table itself. The House rules tab only matters if this device opens a table.
      </p>
    </div>
  );
}
