"use client";

import { useEffect, useState } from "react";
import { Modal } from "./Modal";

const VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "0.0.0";
const BUILD_TIME = process.env.NEXT_PUBLIC_BUILD_TIME ?? "";

function formatBuildTime(iso: string): string {
  if (!iso) return "";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().replace("T", " ").slice(0, 16);
}

/**
 * Build info plus the most recent changelog entry; clicking it opens the full
 * changelog. Entries live in `public/updates.txt`, one per line, oldest first.
 */
export function BuildFooter() {
  const [updates, setUpdates] = useState<string[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/updates.txt")
      .then((response) => (response.ok ? response.text() : Promise.reject(response.status)))
      .then((text) => {
        if (cancelled) return;
        setUpdates(
          text
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean),
        );
      })
      // A missing or unreadable changelog leaves the footer bare rather than
      // showing an error — it is never load-bearing.
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const latest = updates[updates.length - 1];
  const buildTime = formatBuildTime(BUILD_TIME);

  return (
    <>
      <footer className="build-info">
        <div className="build-info__version">
          Hong Kong Mahjong · v{VERSION}
          {buildTime ? ` · built ${buildTime} UTC` : ""}
        </div>
        {latest ? (
          <button
            type="button"
            className="build-info__latest"
            onClick={() => setOpen(true)}
            aria-haspopup="dialog"
          >
            {latest}
          </button>
        ) : null}
      </footer>

      <Modal open={open} title="Changelog" onClose={() => setOpen(false)}>
        <ul className="changelog">
          {[...updates].reverse().map((line, i) => (
            // React escapes interpolated text, so a changelog line can never
            // inject markup.
            <li className="changelog__item" key={`${i}-${line.slice(0, 24)}`}>
              {line}
            </li>
          ))}
        </ul>
      </Modal>
    </>
  );
}
