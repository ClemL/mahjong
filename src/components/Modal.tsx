"use client";

import { useEffect, type ReactNode } from "react";

interface Props {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Extra classes for the panel, e.g. `modal--wide`. */
  className?: string;
}

/**
 * Generic overlay dialog. Closes on Escape and on a backdrop click, and is
 * shared by anything that needs a centered panel — the changelog today, a
 * confirm dialog tomorrow.
 */
export function Modal({ open, title, onClose, children, className }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // A dialog opened from the settings drawer should close alone, not take
      // the drawer with it, so it hears Escape first and keeps it.
      e.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="modal__backdrop"
      // Only a click on the backdrop itself closes the dialog. Without this
      // guard a click inside the panel bubbles up and dismisses it, which
      // makes selecting text in the panel feel broken.
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={className ? `modal ${className}` : "modal"} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal__head">
          <h2 className="modal__title">{title}</h2>
          <button type="button" className="btn btn--sm btn--ghost" onClick={onClose}>
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
