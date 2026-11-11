"use client";

import { type FormEvent, type ReactNode, useId, useState } from "react";
import type { RuleConfig } from "@/game/rules";
import type { AppearanceApi } from "@/hooks/useAppearance";
import type { PhoneLayout, PhoneLayoutApi } from "@/hooks/usePhoneLayout";
import type { PhoneDisplay, PhoneSize, PhoneZoomOut, PondOrder } from "@/hooks/useLocalSetting";
import { useRoomyScreen } from "@/hooks/useRoomyScreen";
import type { HandOrder, SortMode } from "@/hooks/useHandOrder";
import { canVibrate } from "@/hooks/useHaptics";
import type { FullscreenApi } from "@/hooks/useFullscreen";
import type { WakeLockState } from "@/hooks/useWakeLock";
import { type SegmentOption, Segmented, SwitchRow } from "./SettingControls";
import { AppearancePanel } from "./AppearancePanel";
import { FaanPanel, RulesPanel } from "./SidePanels";
import type { SoundToggle } from "@/hooks/useRoomSound";

const LAYOUT: SegmentOption<PhoneLayout>[] = [
  {
    value: "rail",
    label: "Rail",
    hint: "The tile in play on the left, your buttons on the right, the hand in one row along the bottom",
  },
  {
    value: "shelves",
    label: "Shelves",
    hint: "The hand in two rows split by suit, for the largest tiles; everything else in a column on the right",
  },
];

const SIZE: SegmentOption<PhoneSize>[] = [
  { value: "compact", label: "Compact", hint: "Smaller header, prompt and buttons" },
  { value: "standard", label: "Standard", hint: "The usual size" },
  { value: "comfy", label: "Comfy", hint: "Larger header, prompt and buttons, easier to tap" },
];

const ZOOM_OUT: SegmentOption<PhoneZoomOut>[] = [
  {
    value: "0",
    label: "Off",
    hint: "Everything fills the screen. Zoom out if an edge is hard to tap, or the browser's bars cover part of it",
  },
  { value: "5", label: "5%", hint: "Everything a little smaller in the middle, with a thin margin round the edges" },
  { value: "10", label: "10%", hint: "Smaller, with a wider margin round the edges" },
  { value: "15", label: "15%", hint: "Smaller still, well clear of every edge" },
];

const SORT: SegmentOption<SortMode>[] = [
  { value: "suits", label: "Suits", hint: "Characters, dots, bamboo, then winds and dragons" },
  { value: "honors", label: "Honors first", hint: "Winds and dragons on the left, then the suits" },
  {
    value: "manual",
    label: "My order",
    hint: "Your own order — drag a tile to move it. New tiles join at the right",
  },
];

const POND_ORDER: SegmentOption<PondOrder>[] = [
  { value: "thrown", label: "As thrown", hint: "Each person's discards in the order they went out, with a space where one was claimed" },
  { value: "sorted", label: "By suit", hint: "Each person's discards by suit and number, to count what has gone" },
  {
    value: "pooled",
    label: "By tile",
    hint: "Everyone's discards together, without names: a row a suit, each tile beside its copies",
  },
];

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="sgroup">
      <h2 className="sgroup__title">{title}</h2>
      <div className="sgroup__card">{children}</div>
    </section>
  );
}

/**
 * The name this phone's player goes by at the table, and a way to change it at
 * any point in the game. Whoever scans a computer's chair mid-game names
 * themselves at the door, and a typo there should not mean living with it, or
 * leaving the chair to sit down again.
 */
function YourName({
  name,
  busy,
  error,
  onRename,
}: {
  name: string;
  busy: boolean;
  error: string | null;
  onRename: (name: string) => Promise<boolean>;
}) {
  const id = useId();
  // Kept here rather than read from the view: the room keeps polling while the
  // menu is open, and a poll landing mid-edit must not snatch the text away.
  const [draft, setDraft] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const next = (draft ?? "").trim();
  const changed = draft !== null && next !== "" && next !== name;

  // Saved, the box shows the name the room gave back, which may carry a number
  // after it; refused, it keeps what was typed so it can be sent again.
  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!changed || busy) return;
    const ok = await onRename(next);
    setFailed(!ok);
    if (ok) setDraft(null);
  };

  return (
    <form className="name-row" onSubmit={(e) => void save(e)}>
      <label className="name-row__label" htmlFor={id}>
        Your name
      </label>
      <span className="name-row__field">
        <input
          id={id}
          className="name-row__input"
          value={draft ?? name}
          maxLength={16}
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="done"
          onChange={(e) => {
            setDraft(e.target.value);
            setFailed(false);
          }}
        />
        <button type="submit" className="btn name-row__save" disabled={!changed || busy}>
          Save
        </button>
      </span>
      {failed && error ? (
        <span className="name-row__error" role="alert">
          Not saved: {error}
        </span>
      ) : (
        <span className="name-row__hint">
          How the table and the other phones show you. A name someone else here goes by gets a number after it
        </span>
      )}
    </form>
  );
}

/**
 * A phone's own settings: how this phone sounds and buzzes, how the hand is
 * laid out, and the assists. The house rules belong to the table; the rules and
 * faan table are here as what someone mid-hand reaches for.
 */
export function PhoneSettings({
  sound,
  config,
  appearance,
  fullscreen,
  wakeLock,
  tableTakeBack = true,
  layout,
  display,
  sort,
  table,
  name,
  onRename,
  busy = false,
  error = null,
  onLeave,
}: {
  sound: SoundToggle;
  config: RuleConfig;
  appearance: AppearanceApi;
  /** Full screen for this phone; where it cannot go full screen, the home-screen route is explained. */
  fullscreen?: FullscreenApi;
  /** How the keep-awake switch is faring, when it is on. */
  wakeLock?: WakeLockState;
  /** Whether the table allows take back at all. */
  tableTakeBack?: boolean;
  layout?: PhoneLayoutApi;
  /** This phone's display choices. */
  display?: PhoneDisplay;
  /** How the hand is laid out; absent where there is no hand yet. */
  sort?: HandOrder;
  /** Which of the tables this phone is at, e.g. "Table 2". */
  table?: string;
  /** The name this phone's player sits under, with `onRename` to change it. */
  name?: string;
  onRename?: (name: string) => Promise<boolean>;
  /** A command to the room is on its way; and the last one's refusal, if it was refused. */
  busy?: boolean;
  error?: string | null;
  /** Give up the seat. */
  onLeave?: () => void;
}) {
  const vibrates = canVibrate();
  const roomy = useRoomyScreen();
  return (
    <>
      {name !== undefined && onRename ? (
        <Group title="You">
          <YourName name={name} busy={busy} error={error} onRename={onRename} />
        </Group>
      ) : null}

      <Group title="On this phone">
        {display ? (
          <SwitchRow
            label="Vibrate"
            hint={
              vibrates
                ? "Your turn, a claim, a hurry-up, a win"
                : "This browser cannot vibrate the phone (iPhones never can)"
            }
            checked={vibrates && display.vibrate === "on"}
            disabled={!vibrates}
            onChange={(on) => display.setVibrate(on ? "on" : "off")}
          />
        ) : null}
        <SwitchRow
          label="Sound"
          hint="Clacks on discards, claims and wins"
          checked={!sound.muted}
          onChange={(on) => sound.setMuted(!on)}
        />
        {display ? (
          <SwitchRow
            label="Keep awake"
            hint={
              wakeLock === "unsupported"
                ? "This browser cannot keep the screen on"
                : wakeLock === "denied"
                  ? "The browser refused; low battery mode can block it"
                  : "The screen stays on while the table is open on this phone"
            }
            checked={display.keepAwake === "on" && wakeLock !== "unsupported"}
            disabled={wakeLock === "unsupported"}
            onChange={(on) => display.setKeepAwake(on ? "on" : "off")}
          />
        ) : null}
        {fullscreen ? (
          <SwitchRow
            label="Full screen"
            hint={
              fullscreen.supported
                ? "Hides the browser bars and holds the phone sideways"
                : "This browser cannot go full screen. On iPhone, Share → Add to Home Screen opens the table without the browser bars"
            }
            checked={fullscreen.active}
            disabled={!fullscreen.supported}
            onChange={(on) => (on ? fullscreen.enter() : fullscreen.exit())}
          />
        ) : null}
      </Group>

      {sort || layout || display ? (
        <Group title="Your hand">
          {sort ? <Segmented label="Sort tiles" options={SORT} value={sort.mode} onChange={sort.setMode} /> : null}
          {layout ? (
            <Segmented label="Layout" options={LAYOUT} value={layout.layout} onChange={layout.setLayout} />
          ) : null}
          {display ? (
            <>
              <Segmented label="Button size" options={SIZE} value={display.size} onChange={display.setSize} />
              <Segmented
                label="Zoom out"
                options={ZOOM_OUT}
                value={display.zoomOut}
                onChange={display.setZoomOut}
              />
              <SwitchRow
                label="Stretch to the edges"
                hint={
                  layout?.layout === "shelves"
                    ? "Rail only: shelves already size their tiles to fill the space"
                    : "The hand runs to the edges of the screen and its tiles grow to fill it — the fewer in hand, the larger"
                }
                checked={layout?.layout !== "shelves" && display.stretch === "on"}
                disabled={layout?.layout === "shelves"}
                onChange={(on) => display.setStretch(on ? "on" : "off")}
              />
              <SwitchRow
                label="Play log"
                hint="The last four plays where your buttons go, while there is nothing to decide: discards, chows, pungs and kongs"
                checked={display.playLog === "on"}
                onChange={(on) => display.setPlayLog(on ? "on" : "off")}
              />
              <SwitchRow
                label="Discards beside your hand"
                hint={
                  roomy
                    ? "Everyone's discards, small, in the middle right of the screen"
                    : "A phone has no room to keep them there. Swipe right across the middle of the screen to see them, or tap Discards"
                }
                checked={roomy && display.ponds === "on"}
                disabled={!roomy}
                onChange={(on) => display.setPonds(on ? "on" : "off")}
              />
              <Segmented
                label="Discard order"
                options={POND_ORDER}
                value={display.helper === "on" ? display.pondOrder : "thrown"}
                disabled={display.helper !== "on"}
                note={
                  display.helper === "on"
                    ? undefined
                    : "As thrown. Turn on the helper, under Assists, to sort them by suit or by tile"
                }
                onChange={display.setPondOrder}
              />
            </>
          ) : null}
        </Group>
      ) : null}

      {display ? (
        <Group title="Assists">
          <SwitchRow
            label="Set hints"
            hint="A line under tiles that already make a set: dashed for a run, solid for three of a kind, +1 or +2 where it scores"
            checked={display.setHints === "on"}
            onChange={(on) => display.setSetHints(on ? "on" : "off")}
          />
          <SwitchRow
            label="Helper"
            hint="A wheelchair button that shows what finishes each set you've started, and everyone's discards sorted by suit or by tile"
            checked={display.helper === "on"}
            onChange={(on) => display.setHelper(on ? "on" : "off")}
          />
          <SwitchRow
            label="Hurry up"
            hint="A button to nudge a slow player. Whoever you nudge sees it, whatever their own setting — and so do you, when they nudge you"
            checked={display.hurry === "on"}
            onChange={(on) => display.setHurry(on ? "on" : "off")}
          />
          <SwitchRow
            label="Take back"
            hint={
              !tableTakeBack
                ? "The table has switched take back off for everyone"
                : display.takeBackLocked
                  ? "Always on for Louis"
                  : "For five seconds after you throw a tile, a button beside your flowers puts it back in your hand. The table waits those seconds out"
            }
            checked={tableTakeBack && display.takeBack === "on"}
            disabled={!tableTakeBack || display.takeBackLocked}
            onChange={(on) => display.setTakeBack(on ? "on" : "off")}
          />
        </Group>
      ) : null}

      {onLeave ? (
        <div className="sgroup__leave">
          <button
            type="button"
            className="btn"
            onClick={() => {
              if (
                confirm(
                  `Leave ${table ?? "the table"}? The computer plays your seat from here, and this phone goes back to choosing a seat.`,
                )
              ) {
                onLeave();
              }
            }}
          >
            Leave the table
          </button>
          <span className="sgroup__note">
            {table ? `You are at ${table}. ` : null}The computer plays your chair until someone sits
            back down in it.
          </span>
        </div>
      ) : null}

      <AppearancePanel api={appearance} />
      <RulesPanel config={config} />
      <FaanPanel config={config} />
    </>
  );
}
