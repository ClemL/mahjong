"use client";

import type { CSSProperties } from "react";

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  /** A second line under the label, e.g. "HK standard". */
  sub?: string;
  /** Said under the control while this option is the chosen one. */
  hint?: string;
}

/**
 * Mutually exclusive options as one bar, the chosen one filled. Each option is
 * a real button marked pressed, so the choice never rests on the fill alone.
 */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  disabled = false,
  note,
}: {
  label: string;
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
  /** Said in place of the chosen option's hint — why it cannot be changed now, say. */
  note?: string;
}) {
  const hint = note ?? options.find((o) => o.value === value)?.hint;
  return (
    <div className="seg-field">
      <span className="seg-field__label">{label}</span>
      <div
        className="seg"
        role="group"
        aria-label={label}
        style={{ "--seg-count": options.length } as CSSProperties}
      >
        {options.map((option) => {
          const on = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              className={`seg__btn${on ? " seg__btn--on" : ""}${option.sub ? " seg__btn--tall" : ""}`}
              aria-pressed={on}
              disabled={disabled}
              title={option.hint}
              onClick={() => onChange(option.value)}
            >
              <span className="seg__label">{option.label}</span>
              {option.sub ? <span className="seg__sub">{option.sub}</span> : null}
            </button>
          );
        })}
      </div>
      {hint ? <span className="seg-field__hint">{hint}</span> : null}
    </div>
  );
}

/** One setting that is either on or off: what it is, what it does, and the switch. */
export function SwitchRow({
  label,
  hint,
  checked,
  onChange,
  disabled = false,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="switch-row">
      <span className="switch-row__text">
        <span className="switch-row__label">{label}</span>
        {hint ? <span className="switch-row__hint">{hint}</span> : null}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        className="switch"
        disabled={disabled}
        onClick={() => onChange(!checked)}
      >
        <span className="switch__knob" aria-hidden="true" />
      </button>
    </div>
  );
}
