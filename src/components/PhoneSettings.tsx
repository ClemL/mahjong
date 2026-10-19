"use client";

import type { RuleConfig } from "@/game/rules";
import type { AppearanceApi } from "@/hooks/useAppearance";
import type { CompactLayout } from "@/hooks/useCompactLayout";
import type { OnOff, PhoneDisplay, PhoneSize } from "@/hooks/useLocalSetting";
import type { HandOrder, SortMode } from "@/hooks/useHandOrder";
import { canVibrate } from "@/hooks/useHaptics";
import { Choice, type ChoiceOption } from "./Choice";
import { AppearancePanel } from "./AppearancePanel";
import { FaanPanel, RulesPanel } from "./SidePanels";
import type { SoundToggle } from "./TableView";

const SOUND: ChoiceOption<"on" | "off">[] = [
  { value: "on", label: "On", hint: "Clacks on discards, claims and wins" },
  { value: "off", label: "Off", hint: "Silent" },
];

const LAYOUT: ChoiceOption<"standard" | "compact">[] = [
  { value: "standard", label: "Standard", hint: "A line for the prompt, roomy buttons" },
  {
    value: "compact",
    label: "Compact",
    hint: "One header line and slimmer buttons, so the hand tiles get larger",
  },
];

const SIZE: ChoiceOption<PhoneSize>[] = [
  { value: "compact", label: "Compact", hint: "Smaller header, prompt and buttons" },
  { value: "standard", label: "Standard", hint: "The usual size" },
  { value: "comfy", label: "Comfy", hint: "Larger header, prompt and buttons, easier to tap" },
];

const PLAY_LOG: ChoiceOption<OnOff>[] = [
  { value: "on", label: "Show", hint: "The last four plays: discards, chows, pungs and kongs" },
  { value: "off", label: "Hide", hint: "Just the prompt" },
];

const VIBRATE: ChoiceOption<OnOff>[] = [
  {
    value: "on",
    label: "On",
    hint: "A buzz when it is your turn, when you can claim, when someone hurries you up, and when you win",
  },
  { value: "off", label: "Off", hint: "Never buzzes" },
];

const SET_HINTS: ChoiceOption<OnOff>[] = [
  {
    value: "on",
    label: "On",
    hint: "A line under three tiles that already make a set: dashed for a run, solid for three of a kind, orange with +1 or +2 where it scores",
  },
  { value: "off", label: "Off", hint: "No marks under your tiles" },
];

const HURRY: ChoiceOption<OnOff>[] = [
  {
    value: "on",
    label: "On",
    hint: "A Hurry up button while someone else is holding up the table, and this screen flashes when someone presses theirs",
  },
  { value: "off", label: "Off", hint: "No button, and this screen never flashes; the phone still buzzes if Vibrate is on" },
];

const HELPER: ChoiceOption<OnOff>[] = [
  { value: "on", label: "On", hint: "A wheelchair button that lists the tiles that finish each pair and part-run in your hand" },
  { value: "off", label: "Off", hint: "No helper button" },
];

const SORT: ChoiceOption<SortMode>[] = [
  { value: "suits", label: "Suits", hint: "Characters, dots, bamboo, then winds and dragons" },
  { value: "honors", label: "Honors first", hint: "Winds and dragons on the left, then the suits" },
  {
    value: "manual",
    label: "Manual",
    hint: "Your own order — drag a tile to move it. New tiles join at the right",
  },
];

/**
 * A phone's own settings. The house minimum belongs to the table, but how the
 * tiles look is each player's own choice, and the rules and faan table are
 * what someone mid-hand reaches for.
 */
export function PhoneSettings({
  sound,
  config,
  appearance,
  fullscreenHint = false,
  layout,
  display,
  controller = false,
  sort,
  table,
  onLeave,
}: {
  sound: SoundToggle;
  config: RuleConfig;
  appearance: AppearanceApi;
  /** Explain the home-screen route on phones that cannot go full screen. */
  fullscreenHint?: boolean;
  /** Only the controller has a density to choose. */
  layout?: CompactLayout;
  /** This phone's display choices. */
  display?: PhoneDisplay;
  /** A sideways controller beside a table screen: it alone has a size and a play log. */
  controller?: boolean;
  /** How the hand is laid out; absent where there is no hand yet. */
  sort?: HandOrder;
  /** Which of the tables this phone is at, e.g. "Table 2". */
  table?: string;
  /** Give up the seat. */
  onLeave?: () => void;
}) {
  return (
    <>
      <section className="panel">
        <h2 className="panel__title">This phone</h2>
        <div className="appearance">
          <Choice
            label="Sound"
            options={SOUND}
            value={sound.muted ? "off" : "on"}
            onChange={(value) => sound.setMuted(value === "off")}
          />
          {sort ? (
            <Choice
              label="Sort hand"
              options={SORT}
              value={sort.mode}
              onChange={sort.setMode}
            />
          ) : null}
          {layout ? (
            <Choice
              label="Layout"
              options={LAYOUT}
              value={layout.compact ? "compact" : "standard"}
              onChange={(value) => layout.setCompact(value === "compact")}
            />
          ) : null}
          {display && controller ? (
            <>
              <Choice label="Size" options={SIZE} value={display.size} onChange={display.setSize} />
              <Choice
                label="Play log"
                options={PLAY_LOG}
                value={display.playLog}
                onChange={display.setPlayLog}
              />
            </>
          ) : null}
          {display ? (
            <>
              <Choice
                label="Set hints"
                options={SET_HINTS}
                value={display.setHints}
                onChange={display.setSetHints}
              />
              <Choice label="Helper" options={HELPER} value={display.helper} onChange={display.setHelper} />
              <Choice label="Hurry up" options={HURRY} value={display.hurry} onChange={display.setHurry} />
              <Choice
                label="Vibrate"
                options={VIBRATE}
                value={canVibrate() ? display.vibrate : "off"}
                onChange={display.setVibrate}
                disabled={!canVibrate()}
                note={canVibrate() ? undefined : "This browser cannot vibrate the phone (iPhones never can)"}
              />
            </>
          ) : null}
          {fullscreenHint ? (
            <p className="seat__meta">
              This browser cannot go full screen. On iPhone, Share → Add to Home Screen opens
              the table without the browser bars.
            </p>
          ) : null}
          {onLeave ? (
            <div className="choice">
              <span className="choice__label">Seat</span>
              <div className="choice__options">
                <button
                  type="button"
                  className="btn btn--sm btn--ghost btn--reset"
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
              </div>
              <span className="choice__hint">
                {table ? `You are at ${table}. ` : null}The computer takes over your hand; anyone
                can sit back down in it
              </span>
            </div>
          ) : null}
        </div>
      </section>
      <AppearancePanel api={appearance} />
      <RulesPanel config={config} />
      <FaanPanel config={config} />
    </>
  );
}
