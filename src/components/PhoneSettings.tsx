"use client";

import type { RuleConfig } from "@/game/rules";
import type { AppearanceApi } from "@/hooks/useAppearance";
import type { CompactLayout } from "@/hooks/useCompactLayout";
import type { HandOrder, SortMode } from "@/hooks/useHandOrder";
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
  sort,
}: {
  sound: SoundToggle;
  config: RuleConfig;
  appearance: AppearanceApi;
  /** Explain the home-screen route on phones that cannot go full screen. */
  fullscreenHint?: boolean;
  /** Only the controller has a density to choose. */
  layout?: CompactLayout;
  /** How the hand is laid out; absent where there is no hand yet. */
  sort?: HandOrder;
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
          {fullscreenHint ? (
            <p className="seat__meta">
              This browser cannot go full screen. On iPhone, Share → Add to Home Screen opens
              the table without the browser bars.
            </p>
          ) : null}
        </div>
      </section>
      <AppearancePanel api={appearance} />
      <RulesPanel config={config} />
      <FaanPanel config={config} />
    </>
  );
}
