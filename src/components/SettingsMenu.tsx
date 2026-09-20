"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

/**
 * Settings behind a hamburger.
 *
 * The bar is for operating the game — pause, deal, redeal, restart. Everything
 * you set once and then forget about (the house minimum, sound, speed, tile
 * artwork) lives in here instead, so the handful of controls reached for every
 * hand are not buried among the ones touched once a session.
 */
export function SettingsMenu({
  label = "Settings",
  children,
}: {
  label?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Focus follows the panel — into it on open, back onto the hamburger on
  // close — so the menu can be worked without a pointer. The `wasOpen` guard
  // keeps the first render from stealing focus off the page.
  useEffect(() => {
    if (open) closeButton.current?.focus();
    else if (wasOpen.current) trigger.current?.focus();
    wasOpen.current = open;
  }, [open]);

  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="btn btn--sm btn--ghost hamburger"
        aria-label={label}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen(true)}
      >
        <span className="hamburger__bars" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
        <span className="hamburger__text">{label}</span>
      </button>

      {open ? (
        <div
          className="drawer__backdrop"
          // Only a click on the backdrop itself closes the drawer, or dragging
          // to select text inside it would dismiss the whole panel.
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <aside id={panelId} className="drawer" role="dialog" aria-modal="true" aria-label={label}>
            <header className="drawer__head">
              <h2 className="drawer__title">{label}</h2>
              <button
                ref={closeButton}
                type="button"
                className="btn btn--sm btn--ghost"
                onClick={() => setOpen(false)}
              >
                Close
              </button>
            </header>
            <div className="drawer__body">{children}</div>
          </aside>
        </div>
      ) : null}
    </>
  );
}
