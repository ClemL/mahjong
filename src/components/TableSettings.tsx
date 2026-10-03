"use client";

import type { RoomView } from "@/game/room";
import type { RoomApi } from "@/hooks/useRoom";
import type { AppearanceApi } from "@/hooks/useAppearance";
import { MIN_FAAN_CHOICES } from "@/game/rules";
import { Choice, type ChoiceOption } from "./Choice";
import { AppearancePanel } from "./AppearancePanel";
import { FaanPanel, RulesPanel } from "./SidePanels";
import type { SoundToggle } from "./TableView";

const SOUND: ChoiceOption<"on" | "off">[] = [
  { value: "on", label: "On", hint: "Clacks on discards, claims and wins" },
  { value: "off", label: "Off", hint: "Silent" },
];

/** What the table is set to, as opposed to what it is doing. */
export function TableSettings({
  api,
  view,
  sound,
  appearance,
}: {
  api: RoomApi;
  view: RoomView;
  sound?: SoundToggle;
  appearance: AppearanceApi;
}) {
  return (
    <>
      <section className="panel">
        <details open>
          <summary>Table</summary>
          <div className="appearance">
            <label className="field">
              <span className="field__label">Min faan</span>
              <select
                className="field__select"
                value={view.config.minFaan}
                disabled={api.busy}
                onChange={(e) => void api.control({ type: "minFaan", value: Number(e.target.value) })}
              >
                {MIN_FAAN_CHOICES.map((n) => (
                  <option key={n} value={n}>
                    {n === 0 ? "0 (chicken)" : n === 3 ? "3 (HK standard)" : n}
                  </option>
                ))}
              </select>
            </label>

            {sound ? (
              <Choice
                label="Sound"
                options={SOUND}
                value={sound.muted ? "off" : "on"}
                onChange={(value) => sound.setMuted(value === "off")}
              />
            ) : null}
          </div>
        </details>
      </section>
      <AppearancePanel api={appearance} />
      <RulesPanel config={view.config} />
      <FaanPanel config={view.config} />
    </>
  );
}
