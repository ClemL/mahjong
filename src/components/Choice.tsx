"use client";

export interface ChoiceOption<T extends string> {
  value: T;
  label: string;
  hint: string;
}

/** A labelled row of mutually exclusive chips, with a hint for the active one. */
export function Choice<T extends string>({
  label,
  options,
  value,
  onChange,
  disabled = false,
  note,
}: {
  label: string;
  options: ChoiceOption<T>[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
  /** Said in place of the active option's hint — why it cannot be changed now, say. */
  note?: string;
}) {
  const active = options.find((o) => o.value === value);
  return (
    <div className="choice">
      <span className="choice__label">{label}</span>
      <div className="choice__options" role="group" aria-label={label}>
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`choice__btn${option.value === value ? " choice__btn--on" : ""}`}
            aria-pressed={option.value === value}
            disabled={disabled}
            title={option.hint}
            onClick={() => onChange(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>
      {note || active ? <span className="choice__hint">{note ?? active!.hint}</span> : null}
    </div>
  );
}
