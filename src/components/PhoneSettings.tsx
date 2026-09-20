"use client";

import { Choice, type ChoiceOption } from "./Choice";
import type { SoundToggle } from "./TableView";

const SOUND: ChoiceOption<"on" | "off">[] = [
  { value: "on", label: "On", hint: "Clacks on discards, claims and wins" },
  { value: "off", label: "Off", hint: "Silent" },
];

/** A phone carries one setting of its own; the rest belong to the table. */
export function PhoneSettings({ sound }: { sound: SoundToggle }) {
  return (
    <section className="panel">
      <h2 className="panel__title">This phone</h2>
      <div className="appearance">
        <Choice
          label="Sound"
          options={SOUND}
          value={sound.muted ? "off" : "on"}
          onChange={(value) => sound.setMuted(value === "off")}
        />
      </div>
    </section>
  );
}
