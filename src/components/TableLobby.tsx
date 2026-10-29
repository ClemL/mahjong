"use client";

import { useEffect, useState } from "react";
import { type RoomView, neighbourSeat, openSeatName, seatedNames } from "@/game/room";
import type { RoomApi } from "@/hooks/useRoom";
import { useAppearance } from "@/hooks/useAppearance";
import { useCompactLayout } from "@/hooks/useCompactLayout";
import { usePhoneDisplay, useTabletDisplay } from "@/hooks/useLocalSetting";
import { useFullscreen } from "@/hooks/useFullscreen";
import { useWakeLock } from "@/hooks/useWakeLock";
import {
  MIN_FAAN_CHOICES,
  flowersInPlay,
  liabilityInPlay,
  multipleWinnersInPlay,
  othersPayHalfInPlay,
  roundsInGame,
} from "@/game/rules";
import { SEAT_NAMES, type Seat, seatWind, tileGlyph } from "@/game/tiles";
import { tableName } from "@/game/tables";
import { QrCode } from "./QrCode";
import { positionOf } from "./tableLayout";
import { SettingsMenu } from "./SettingsMenu";
import { TableSettings, rulesInForce } from "./TableSettings";
import { PhoneSettings } from "./PhoneSettings";
import { GAME_LENGTHS } from "./gameLength";
import { joinNames } from "./TableResult";
import type { SoundToggle } from "@/hooks/useRoomSound";

/** Screen edges by position; which seat is at which follows the table's rotation. */
const EDGES = ["bottom", "right", "top", "left"];

const SEATS: Seat[] = [0, 1, 2, 3];

/** Four stacked squares: the QR code, small, on the buttons that show one. */
function CodeIcon() {
  return (
    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="7" height="7" />
      <rect x="14" y="3" width="7" height="7" />
      <rect x="3" y="14" width="7" height="7" />
      <path d="M14 14h3v3h-3zM20 20h1" />
    </svg>
  );
}

/**
 * The name an empty chair offers: the one the server gives whoever sits in it
 * without typing, worked out from the same view so the two always agree.
 */
function openName(view: RoomView, seat: Seat): string {
  return openSeatName(seatedNames(view.players.map((p) => p.occupant)), seat);
}

/**
 * The gathering screen.
 *
 * On the tablet everyone is already looking at, one large code is up for the
 * next open chair — large enough to scan from across the table — and the list
 * beside it says who has sat where. Somebody scanning it sits down in that
 * chair and the code moves on to the next one; tapping any chair puts its code
 * up instead. Nothing is dealt until somebody presses Deal, which is what stops
 * the first phone to connect from starting a hand the computer then plays on
 * everyone else's behalf.
 *
 * On a phone, already in a chair, the same list with its own chair marked, and
 * a code to bring somebody else in.
 */
export function TableLobby({
  api,
  view,
  sound,
}: {
  api: RoomApi;
  view: RoomView;
  sound: SoundToggle;
}) {
  const appearance = useAppearance();
  const layout = useCompactLayout();
  const tabletDisplay = useTabletDisplay();
  const phoneDisplay = usePhoneDisplay(
    view.you.seat !== null ? view.players[view.you.seat].occupant.name : null,
  );
  const fullscreen = useFullscreen("landscape");
  // A phone left waiting for the deal is kept awake too, if it asked to be.
  const wakeLock = useWakeLock(view.you.role === "player" && phoneDisplay.keepAwake === "on");

  // The join link has to be built in the browser — a statically exported page
  // has no idea what host it will be served from.
  const [origin, setOrigin] = useState<string | null>(null);
  useEffect(() => setOrigin(window.location.origin), []);

  // Names typed on the tablet, one per chair. They ride along in that seat's
  // QR rather than being held on the server: nobody owns the chair until
  // somebody scans it, so there is nothing to reserve.
  const [names, setNames] = useState<Record<number, string>>({});

  // An open table, so the link is just its address — there is no key to carry
  // and nothing to type once it has been scanned.
  const joinUrl = origin ? `${origin}/room/${view.roomId}` : null;

  const taken = (seat: Seat) => view.players[seat].occupant.kind === "human";

  /**
   * A seat's own link: which chair, and the name the table typed for it. A
   * taken chair's link also says to put out whoever is there, so a dead phone
   * or a swap of players never needs the table to free the seat first.
   */
  const seatUrl = (seat: Seat): string | null => {
    if (!joinUrl) return null;
    const here = taken(seat);
    const name = (names[seat] ?? "").trim();
    return `${joinUrl}?seat=${seat}${name && !here ? `&name=${encodeURIComponent(name)}` : ""}${here ? "&replace=1" : ""}`;
  };

  // The chair whose code is up. A chair tapped while open gives way to the
  // next open one as soon as somebody sits in it; a taken chair tapped on
  // purpose keeps its code up until another is tapped.
  const [chosen, setChosen] = useState<{ seat: Seat; wasTaken: boolean } | null>(null);
  const firstOpen = SEATS.find((s) => !taken(s)) ?? null;
  const spot: Seat | null =
    chosen && (chosen.wasTaken || !taken(chosen.seat)) ? chosen.seat : firstOpen;
  const choose = (seat: Seat) => setChosen({ seat, wasTaken: taken(seat) });

  // Typed names belong to the chair, so they trade places with whoever moves.
  const move = (seat: Seat, step: 1 | -1) => {
    const to = neighbourSeat(seat, step);
    setNames((n) => ({ ...n, [seat]: n[to] ?? "", [to]: n[seat] ?? "" }));
    void api.control({ type: "moveSeat", seat, step });
  };

  const seated = SEATS.filter(taken);
  const open = 4 - seated.length;
  const isTable = view.you.role === "table";
  const me = view.you.seat;

  const settings = (
    // The same drawer as during play, so the look and the house rules can be
    // settled while people are still sitting down.
    <SettingsMenu
      sheet={isTable ? { title: "Table settings", subtitle: `${tableName(view.roomId)} · Before the deal` } : undefined}
    >
      {isTable ? (
        <TableSettings api={api} view={view} sound={sound} appearance={appearance} display={tabletDisplay} />
      ) : (
        <PhoneSettings
          sound={sound}
          config={view.config}
          appearance={appearance}
          layout={layout}
          display={phoneDisplay}
          fullscreen={fullscreen}
          wakeLock={phoneDisplay.keepAwake === "on" ? wakeLock : undefined}
          tableTakeBack={view.settings.takeBack !== false}
          table={tableName(view.roomId)}
          onLeave={() => void api.leave()}
        />
      )}
    </SettingsMenu>
  );

  const rows = (
    <ul className="gather__rows" aria-label="Seats">
      {SEATS.map((seat) => (
        <SeatRow
          key={seat}
          seat={seat}
          view={view}
          api={api}
          isTable={isTable}
          typed={names[seat] ?? ""}
          spot={isTable && spot === seat}
          onShow={() => choose(seat)}
          onMove={(step) => move(seat, step)}
        />
      ))}
    </ul>
  );

  if (!isTable) {
    return (
      <div className="gather gather--phone">
        <div className="gather__main">
          <header className="gather__head">
            <h1 className="gather__title">{tableName(view.roomId)}</h1>
            <span className="gather__sub">
              {me !== null ? `You're in as ${SEAT_NAMES[me]}` : null}
            </span>
            <span className="gather__spacer" />
            {settings}
          </header>
          {rows}
          <p className="gather__wait" role="status">
            <span className="gather__wait-dot" aria-hidden />
            {/* A game is played with a tablet in the middle: no phone deals, and
                there is nothing to deal to until one is the table. */}
            {view.tablePresent
              ? "The table deals when everyone is ready."
              : `On a tablet, open “Be ${tableName(view.roomId)} on this screen” to deal. It goes in the middle, as the table.`}
          </p>
        </div>

        <aside className="gather__invite" aria-labelledby="invite-title">
          <h2 className="gather__invite-title" id="invite-title">
            Bring someone in
          </h2>
          {joinUrl ? (
            <QrCode value={joinUrl} label={`Join ${tableName(view.roomId)}`} className="qr--invite" />
          ) : (
            <span className="qr qr--invite qr--pending" aria-hidden />
          )}
          <span className="gather__hint">They scan this and pick an open chair</span>
          {/* A seated phone can get up again before the deal — wrong chair, or
              not playing after all. */}
          <button
            type="button"
            className="btn btn--ghost btn--reset gather__leave"
            disabled={api.busy}
            onClick={() => {
              if (confirm("Leave your seat? This phone goes back to choosing a seat.")) void api.leave();
            }}
          >
            Leave seat
          </button>
        </aside>
      </div>
    );
  }

  const spotTaken = spot !== null && taken(spot);
  const spotUrl = spot !== null ? seatUrl(spot) : null;
  const computerSeats = SEATS.filter((s) => !taken(s)).map((s) => SEAT_NAMES[s]);

  return (
    <div className="gather gather--table">
      <section className="spot" aria-labelledby="spot-title">
        {spot !== null ? (
          <>
            <span className="spot__kicker">{spotTaken ? "Seated" : "Now seating"}</span>
            <h2 className="spot__title" id="spot-title">
              <span className="spot__wind" aria-hidden>
                {tileGlyph(seatWind(spot))}
              </span>
              {SEAT_NAMES[spot]}
            </h2>
            {spotUrl ? (
              <QrCode
                value={spotUrl}
                label={
                  spotTaken
                    ? `Scan to take over seat ${spot + 1}, ${SEAT_NAMES[spot]}, from ${view.players[spot].occupant.name}`
                    : `Scan to take seat ${spot + 1}, ${SEAT_NAMES[spot]}`
                }
                className="qr--spot"
              />
            ) : (
              <span className="qr qr--spot qr--pending" aria-hidden />
            )}
            {spotTaken ? (
              <p className="spot__note">{view.players[spot].occupant.name} is sitting here.</p>
            ) : (
              <>
                <p className="spot__note">
                  Scan to sit {SEAT_NAMES[spot]}. Then the code moves on to the next open chair.
                </p>
                <label className="spot__name">
                  <span className="spot__name-label">Name for {SEAT_NAMES[spot]} (optional)</span>
                  <input
                    className="spot__name-input"
                    value={names[spot] ?? ""}
                    maxLength={16}
                    // The name the chair offers until somebody types one. It
                    // only becomes Robot <name> if the deal finds nobody here.
                    placeholder={openName(view, spot)}
                    aria-label={`Name for seat ${spot + 1}`}
                    autoComplete="off"
                    spellCheck={false}
                    onChange={(e) => setNames((n) => ({ ...n, [spot]: e.target.value }))}
                  />
                </label>
              </>
            )}
          </>
        ) : (
          <>
            <span className="spot__kicker">Everyone is here</span>
            <h2 className="spot__title spot__title--done" id="spot-title">
              <span aria-hidden>✓</span> All four seated
            </h2>
            <p className="spot__note">Deal when you are ready.</p>
          </>
        )}
        {joinUrl ? (
          <span className="spot__url">
            No camera? Open <span className="spot__url-text">{joinUrl.replace(/^https?:\/\//, "")}</span>
          </span>
        ) : null}
      </section>

      <div className="gather__side">
        <header className="gather__head">
          {/* A plain link rather than a leave: the table keeps its claim and the
              phones keep their chairs, so opening this table again from the start
              page picks the lobby up where it was. Nothing to confirm. */}
          <a href="/" className="btn btn--ghost btn--sm gather__home">
            ‹ Start page
          </a>
          {/* Three tables can be gathering at once; say which one this is. */}
          <h1 className="gather__title">{tableName(view.roomId)}</h1>
          <span className="gather__sub">{seated.length} of 4 seated</span>
          <span className="gather__spacer" />
          {settings}
        </header>

        {rows}

        {view.canDeal ? <RulesRow api={api} view={view} /> : null}

        <footer className="gather__foot">
          {/* Restart keeps everyone in their chairs; this empties them, for when
              the next game is a different group of people. */}
          <button
            type="button"
            className="btn btn--ghost btn--reset"
            disabled={api.busy}
            onClick={() => {
              if (
                confirm(
                  "Reset the table? Everyone is sent back to choose a seat, and the scores and house rules go back to the defaults.",
                )
              ) {
                setNames({});
                setChosen(null);
                void api.control({ type: "reset" });
              }
            }}
          >
            Reset table
          </button>
          <span className="gather__count">
            {seated.length > 0 && open > 0
              ? `${joinNames(computerSeats)} ${open === 1 ? "goes" : "go"} to the computer if still open`
              : null}
            {/* Nobody should have to sit and watch a seating screen because a
                friend is running late. Start a game now; it is dropped the
                moment they arrive. */}
            {view.canDeal && seated.length === 1 ? " · start one now and the table regroups when somebody joins" : null}
          </span>
          {view.canDeal ? (
            <button
              type="button"
              className="btn btn--primary btn--deal"
              disabled={api.busy || seated.length === 0}
              // The table's look goes with the deal, for every phone to start the game in.
              onClick={() => void api.control({ type: "deal", look: appearance.appearance })}
            >
              {/* Waiting alone, the honest label for dealing is what it does. */}
              {seated.length === 1 ? "Play the computer" : "Deal"}
            </button>
          ) : null}
        </footer>
      </div>
    </div>
  );
}

/** One chair in the list: its wind, who is in it, and what can be done with it from here. */
function SeatRow({
  seat,
  view,
  api,
  isTable,
  typed,
  spot,
  onShow,
  onMove,
}: {
  seat: Seat;
  view: RoomView;
  api: RoomApi;
  isTable: boolean;
  /** A name typed on the tablet for this chair, not yet scanned. */
  typed: string;
  /** This chair's code is the one up. */
  spot: boolean;
  onShow: () => void;
  onMove: (step: 1 | -1) => void;
}) {
  const occupant = view.players[seat].occupant;
  const here = occupant.kind === "human";
  const mine = view.you.seat === seat;
  const name = occupant.name ?? openName(view, seat);
  // The table can move anybody; a phone only its own player.
  const canMove = here && (isTable || mine);
  const where = `${SEAT_NAMES[seat]} · seat ${seat + 1} · ${EDGES[positionOf(seat, view.settings.rotation)]} edge`;

  return (
    <li
      className={["gather__row", here ? "gather__row--here" : "", spot ? "gather__row--spot" : "", mine ? "gather__row--mine" : ""]
        .filter(Boolean)
        .join(" ")}
    >
      <span className={here ? "gather__tile" : "gather__tile gather__tile--open"} aria-hidden>
        {tileGlyph(seatWind(seat))}
      </span>
      <span className="gather__who">
        <span className="gather__nameline">
          {here ? (
            isTable || mine ? (
              <SeatRename
                seat={seat}
                name={occupant.name ?? ""}
                mine={mine}
                busy={api.busy}
                onRename={(next) => void api.control({ type: "rename", seat, name: next })}
              />
            ) : (
              <span className="gather__seatname">{occupant.name}</span>
            )
          ) : typed.trim() ? (
            <span className="gather__seatname gather__seatname--typed">{typed.trim()}</span>
          ) : (
            <span className="gather__seatname gather__seatname--open">{name}</span>
          )}
          {mine ? <span className="gather__you">you</span> : null}
          {/* Joined state must not rest on the colour of the row alone. */}
          <span className={here ? "gather__state gather__state--here" : "gather__state"}>
            {here ? "✓ Seated" : occupant.kind === "ai" ? `Computer · ${name}` : "Open"}
          </span>
        </span>
        <span className="gather__seatmeta">{where}</span>
      </span>

      {isTable ? (
        spot ? (
          <span className="gather__showing">
            <CodeIcon />
            Code showing
          </span>
        ) : (
          <button
            type="button"
            className={here ? "btn btn--ghost btn--sm gather__show gather__show--quiet" : "btn btn--ghost btn--sm gather__show"}
            aria-label={`Show the code for seat ${seat + 1}, ${SEAT_NAMES[seat]}`}
            onClick={onShow}
          >
            <CodeIcon />
            {here ? null : "Show code"}
          </button>
        )
      ) : null}

      {/* One chair either way round the table; a taken chair means the two
          players trade places. Labelled with where they land, since left and
          right depend on where you stand. */}
      {canMove ? (
        <span className="gather__move">
          {([-1, 1] as const).map((step) => {
            const to = neighbourSeat(seat, step);
            const swap = view.players[to].occupant.kind === "human";
            return (
              <button
                key={step}
                type="button"
                className="btn btn--ghost btn--sm"
                disabled={api.busy}
                aria-label={`${swap ? "Swap" : "Move"} ${name} ${swap ? `with ${view.players[to].occupant.name}, seat ${to + 1}` : `to seat ${to + 1}`}, ${SEAT_NAMES[to]}`}
                onClick={() => onMove(step)}
              >
                {step < 0 ? `‹ ${tileGlyph(seatWind(to))}` : `${tileGlyph(seatWind(to))} ›`}
              </button>
            );
          })}
        </span>
      ) : null}
    </li>
  );
}

/**
 * The house rules in force, in one line, opening out to change them. They
 * belong to whoever deals, so only the table sees this.
 */
function RulesRow({ api, view }: { api: RoomApi; view: RoomView }) {
  const [open, setOpen] = useState(false);
  const config = view.config;
  return (
    <section className="gather__rules" aria-label="House rules">
      <div className="gather__rules-line">
        <span className="gather__rules-label">House rules</span>
        <span className="gather__rules-text">{rulesInForce(config).join(" · ")}</span>
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? "Done" : "Change"}
        </button>
      </div>
      {open ? (
        <div className="gather__rules-fields">
          <label className="field">
            <span className="field__label">Min faan</span>
            <select
              className="field__select"
              value={config.minFaan}
              disabled={api.busy}
              onChange={(e) => void api.control({ type: "minFaan", value: Number(e.target.value) })}
            >
              {MIN_FAAN_CHOICES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field__label">Game length</span>
            <select
              className="field__select"
              value={String(roundsInGame(config))}
              disabled={api.busy}
              onChange={(e) => void api.control({ type: "rounds", value: Number(e.target.value) })}
            >
              {GAME_LENGTHS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field__label">Flowers</span>
            <select
              className="field__select"
              value={flowersInPlay(config) ? "on" : "off"}
              disabled={api.busy}
              onChange={(e) => void api.control({ type: "flowers", value: e.target.value === "on" })}
            >
              <option value="on">In play</option>
              <option value="off">Left out</option>
            </select>
          </label>
          <label className="field">
            <span className="field__label">Liability (包)</span>
            <select
              className="field__select"
              value={liabilityInPlay(config) ? "on" : "off"}
              disabled={api.busy}
              onChange={(e) => void api.control({ type: "liability", value: e.target.value === "on" })}
            >
              <option value="on">In play</option>
              <option value="off">Off</option>
            </select>
          </label>
          <label className="field">
            <span className="field__label">Others pay on a discard</span>
            <select
              className="field__select"
              value={othersPayHalfInPlay(config) ? "on" : "off"}
              disabled={api.busy}
              onChange={(e) => void api.control({ type: "othersPayHalf", value: e.target.value === "on" })}
            >
              <option value="on">Half each</option>
              <option value="off">Discarder only</option>
            </select>
          </label>
          <label className="field">
            <span className="field__label">Two winners on one discard</span>
            <select
              className="field__select"
              value={multipleWinnersInPlay(config) ? "on" : "off"}
              disabled={api.busy}
              onChange={(e) => void api.control({ type: "multipleWinners", value: e.target.value === "on" })}
            >
              <option value="off">First only 截糊</option>
              <option value="on">Both paid 雙響</option>
            </select>
          </label>
        </div>
      ) : null}
    </section>
  );
}

/**
 * A seated chair's name, with a way to change it. A typo on the phone, or a
 * name the table typed for whoever scanned, should not mean leaving the chair
 * and scanning in again.
 */
function SeatRename({
  seat,
  name,
  mine,
  busy,
  onRename,
}: {
  seat: Seat;
  name: string;
  mine: boolean;
  busy: boolean;
  onRename: (name: string) => void;
}) {
  // The draft lives here rather than in the view: the lobby polls, and a poll
  // landing mid-edit must not snatch the text out from under the person typing.
  const [draft, setDraft] = useState<string | null>(null);

  if (draft === null) {
    return (
      <span className="gather__namerow">
        <span className="gather__seatname">{name}</span>
        <button
          type="button"
          className="btn btn--ghost btn--sm gather__rename"
          disabled={busy}
          aria-label={mine ? "Rename yourself" : `Rename seat ${seat + 1}`}
          onClick={() => setDraft(name)}
        >
          ✎
        </button>
      </span>
    );
  }

  const commit = () => {
    const next = draft.trim();
    setDraft(null);
    if (next && next !== name) onRename(next);
  };

  return (
    <input
      className="gather__nameinput"
      value={draft}
      maxLength={16}
      autoFocus
      placeholder={name}
      aria-label={`New name for seat ${seat + 1}`}
      autoComplete="off"
      spellCheck={false}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") commit();
        if (e.key === "Escape") setDraft(null);
      }}
    />
  );
}
