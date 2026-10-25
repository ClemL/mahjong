"use client";

import type { ReactNode } from "react";
import type { RuleConfig } from "@/game/rules";
import type { AppearanceApi } from "@/hooks/useAppearance";
import type { CompactLayout } from "@/hooks/useCompactLayout";
import type { PhoneDisplay, PhoneSize } from "@/hooks/useLocalSetting";
import type { HandOrder, SortMode } from "@/hooks/useHandOrder";
import { canVibrate } from "@/hooks/useHaptics";
import type { FullscreenApi } from "@/hooks/useFullscreen";
import type { WakeLockState } from "@/hooks/useWakeLock";
import { type SegmentOption, Segmented, SwitchRow } from "./SettingControls";
import { AppearancePanel } from "./AppearancePanel";
import { FaanPanel, RulesPanel } from "./SidePanels";
import type { SoundToggle } from "@/hooks/useRoomSound";

const LAYOUT: SegmentOption<"standard" | "compact">[] = [
  { value: "standard", label: "Standard", hint: "A line for the prompt, roomy buttons" },
  {
    value: "compact",
    label: "Compact",
    hint: "One header line and slimmer buttons, so the hand tiles get larger",
  },
];

const SIZE: SegmentOption<PhoneSize>[] = [
  { value: "compact", label: "Compact", hint: "Smaller header, prompt and buttons" },
  { value: "standard", label: "Standard", hint: "The usual size" },
  { value: "comfy", label: "Comfy", hint: "Larger header, prompt and buttons, easier to tap" },
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

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="sgroup">
      <h2 className="sgroup__title">{title}</h2>
      <div className="sgroup__card">{children}</div>
    </section>
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
  layout?: CompactLayout;
  /** This phone's display choices. */
  display?: PhoneDisplay;
  /** How the hand is laid out; absent where there is no hand yet. */
  sort?: HandOrder;
  /** Which of the tables this phone is at, e.g. "Table 2". */
  table?: string;
  /** Give up the seat. */
  onLeave?: () => void;
}) {
  const vibrates = canVibrate();
  return (
    <>
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
            <Segmented
              label="Layout"
              options={LAYOUT}
              value={layout.compact ? "compact" : "standard"}
              onChange={(value) => layout.setCompact(value === "compact")}
            />
          ) : null}
          {display ? (
            <>
              <Segmented label="Button size" options={SIZE} value={display.size} onChange={display.setSize} />
              <SwitchRow
                label="Stretch to the edges"
                hint="The hand runs to the edges of the screen and its tiles grow to fill it — the fewer in hand, the larger"
                checked={display.stretch === "on"}
                onChange={(on) => display.setStretch(on ? "on" : "off")}
              />
              <SwitchRow
                label="Play log"
                hint="The last four plays beside your buttons: discards, chows, pungs and kongs"
                checked={display.playLog === "on"}
                onChange={(on) => display.setPlayLog(on ? "on" : "off")}
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
            hint="A wheelchair button that shows what finishes each set you've started"
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
