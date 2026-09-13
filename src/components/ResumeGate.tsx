"use client";

import { SEAT_NAMES, type Seat } from "@/game/tiles";

/**
 * Shown when this phone was asleep long enough that the table stopped waiting
 * for it. The tap matters: it is an acknowledgement that the computer has been
 * playing this hand, and it is also the gesture browsers require before audio
 * will start again after a suspend.
 */
export function ResumeGate({
  seat,
  onResume,
}: {
  seat: Seat | null;
  onResume: () => void;
}) {
  return (
    <div className="resume" role="alertdialog" aria-labelledby="resume-title">
      <div className="resume__card">
        <h2 className="resume__title" id="resume-title">
          You were away
        </h2>
        <p className="resume__body">
          This phone went to sleep, so the computer has been playing{" "}
          {seat === null ? "your seat" : `${SEAT_NAMES[seat]}`} in the meantime.
          Your seat is still yours.
        </p>
        <button type="button" className="btn btn--primary btn--deal" onClick={onResume}>
          I&rsquo;m back
        </button>
      </div>
    </div>
  );
}
