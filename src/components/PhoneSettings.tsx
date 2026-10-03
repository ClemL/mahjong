"use client";

import type { RuleConfig } from "@/game/rules";
import type { AppearanceApi } from "@/hooks/useAppearance";
import { Choice, type ChoiceOption } from "./Choice";
import { AppearancePanel } from "./AppearancePanel";
import { FaanPanel, RulesPanel } from "./SidePanels";
import type { SoundToggle } from "./TableView";

const SOUND: ChoiceOption<"on" | "off">[] = [
  { value: "on", label: "On", hint: "Clacks on discards, claims and wins" },
  { value: "off", label: "Off", hint: "Silent" },
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
}: {
  sound: SoundToggle;
  config: RuleConfig;
  appearance: AppearanceApi;
  /** Explain the home-screen route on phones that cannot go full screen. */
  fullscreenHint?: boolean;
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
