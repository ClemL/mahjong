"use client";

/**
 * The table's own controls, shared by the bar above the felt and, on a
 * widescreen tablet, the side panel beside it — so the two can never offer
 * different buttons.
 */

import type { PublicPlayer, RoomView } from "@/game/room";
import { SEAT_NAMES, roundName } from "@/game/tiles";
import { tableName } from "@/game/tables";
import type { RoomApi } from "@/hooks/useRoom";
import type { AppearanceApi } from "@/hooks/useAppearance";
import type { FullscreenApi } from "@/hooks/useFullscreen";
import type { TabletDisplay } from "@/hooks/useLocalSetting";
import type { SoundToggle } from "@/hooks/useRoomSound";
import type { WakeLockState } from "@/hooks/useWakeLock";
import { isLastHand } from "./TableResult";
import { SettingsMenu } from "./SettingsMenu";
import { TableSettings } from "./TableSettings";

/** Who sits in a chair: a person's name, the computer's Robot name, or nobody yet. */
export function occupantName(player: PublicPlayer): string {
  return player.occupant.name ?? (player.occupant.kind === "open" ? "Open" : SEAT_NAMES[player.seat]);
}

/** Said only when the screen may go dark mid-hand. */
export function WakeNote({ state }: { state: WakeLockState }) {
  if (state === "held") return null;
  return (
    <span className="tableview__wake" title="This device may sleep during a hand">
      {state === "unsupported"
        ? "Screen may sleep — this browser cannot keep it awake"
        : state === "denied"
          ? "Screen may sleep — the browser refused to keep it awake"
          : "Screen lock pending…"}
    </span>
  );
}

/** What the table reaches for between and during hands. */
export function TableActions({
  api,
  view,
  sheet,
}: {
  api: RoomApi;
  view: RoomView;
  sheet: { aside: boolean; show: () => void };
}) {
  const live = view.started && (view.phase === "action" || view.phase === "claiming");
  return (
    <>
      {live ? (
        <button
          type="button"
          className={`btn btn--sm${view.paused ? " btn--primary" : ""}`}
          disabled={api.busy}
          onClick={() => void api.control({ type: "pause", value: !view.paused })}
        >
          {view.paused ? "Resume" : "Pause"}
        </button>
      ) : null}
      {sheet.aside ? (
        <button type="button" className="btn btn--sm" onClick={sheet.show}>
          {view.phase === "gameOver" ? "Final scores" : "Result"}
        </button>
      ) : null}
      {view.phase === "handOver" ? (
        <button
          type="button"
          className="btn btn--sm btn--primary"
          disabled={api.busy}
          onClick={() => void api.control({ type: "nextHand" })}
        >
          {isLastHand(view) ? "Final scores" : "Next hand"}
        </button>
      ) : null}
      <button
        type="button"
        className="btn btn--sm"
        disabled={api.busy}
        onClick={() => void api.control({ type: "redeal" })}
      >
        Redeal
      </button>
      {view.phase !== "gameOver" ? (
        <button
          type="button"
          className="btn btn--sm btn--ghost"
          disabled={api.busy}
          onClick={() => {
            const unscored = view.phase === "handOver" ? "" : " The hand being played is not scored.";
            if (confirm(`End the game now and show the final scores?${unscored}`)) {
              void api.control({ type: "endGame" });
            }
          }}
        >
          End game
        </button>
      ) : null}
      <button
        type="button"
        className="btn btn--sm btn--ghost"
        disabled={api.busy}
        onClick={() => {
          if (confirm("Reset all scores and go back to the seating screen?")) {
            void api.control({ type: "restart" });
          }
        }}
      >
        Restart
      </button>
    </>
  );
}

/** Full screen, and every setting behind the hamburger. */
export function TableMenu({
  api,
  view,
  sound,
  appearance,
  display,
  fullscreen,
}: {
  api: RoomApi;
  view: RoomView;
  sound?: SoundToggle;
  appearance: AppearanceApi;
  display: TabletDisplay;
  fullscreen: FullscreenApi;
}) {
  return (
    <>
      {fullscreen.supported && !fullscreen.active ? (
        <button type="button" className="btn btn--sm btn--ghost" onClick={fullscreen.enter}>
          Full screen
        </button>
      ) : null}
      <SettingsMenu
        sheet={{
          title: "Table settings",
          subtitle: `${tableName(view.roomId)} · Hand ${view.handNumber} · ${roundName(view.roundWind)} round`,
        }}
      >
        <TableSettings api={api} view={view} sound={sound} appearance={appearance} display={display} />
      </SettingsMenu>
    </>
  );
}
