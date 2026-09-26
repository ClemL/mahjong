"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { H, POSTER_TIME, RUNTIME, W, renderFrame } from "@/film/film";
import { CHAPTERS, chapterAt, lineAt, transcript } from "@/film/script";

/** Widest buffer we will paint, whatever the screen offers. */
const MAX_PIXELS = 1920;

function clock(t: number): string {
  const s = Math.max(0, Math.floor(t));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * The explainer film.
 *
 * Every frame is drawn from the timestamp alone, so playing is nothing more
 * than advancing a number and asking for that frame — which is also how the
 * scrubber, the chapter jumps and the poster work. Subtitles are real text in
 * the DOM rather than pixels on the canvas: crisper at any size, selectable,
 * and readable by a screen reader, which matters more here than usual because
 * the film has no audio and they carry the entire explanation.
 */
export function FilmPlayer({ onClose }: { onClose?: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const timeRef = useRef(0);
  const playingRef = useRef(false);
  const lastRef = useRef(0);

  const [playing, setPlaying] = useState(false);
  const [uiTime, setUiTime] = useState(0);
  const [ended, setEnded] = useState(false);
  const [showText, setShowText] = useState(false);
  const [showChapters, setShowChapters] = useState(false);
  const chaptersRef = useRef<HTMLElement>(null);

  // On a laptop screen the list opens below the fold; bring it up rather than
  // leave the button looking as if it did nothing.
  useEffect(() => {
    if (showChapters) chaptersRef.current?.scrollIntoView({ block: "nearest" });
  }, [showChapters]);
  const [calm, setCalm] = useState(false);
  const [started, setStarted] = useState(false);
  const [full, setFull] = useState(false);

  // A 2:1 frame is short on a phone held upright; fullscreen is the only way
  // it gets a picture worth reading subtitles off.
  useEffect(() => {
    const sync = () => setFull(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);

  const toggleFull = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => {});
      return;
    }
    void frameRef.current?.requestFullscreen?.().catch(() => {});
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setCalm(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  const paint = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.save();
    ctx.scale(canvas.width / W, canvas.height / H);
    renderFrame(ctx, started ? timeRef.current : POSTER_TIME, { calm });
    ctx.restore();
  }, [calm, started]);

  // Size the buffer to the element, capped so a big screen cannot ask for a
  // canvas we have no hope of filling sixty times a second.
  useEffect(() => {
    const canvas = canvasRef.current;
    const shell = shellRef.current;
    if (!canvas || !shell) return;
    const resize = () => {
      const rect = shell.getBoundingClientRect();
      if (rect.width < 2) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const px = Math.min(Math.round(rect.width * dpr), MAX_PIXELS);
      if (canvas.width !== px) {
        canvas.width = px;
        canvas.height = Math.round((px * H) / W);
      }
      paint();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(shell);
    return () => ro.disconnect();
  }, [paint]);

  // One loop for the life of the player; it idles cheaply when paused.
  useEffect(() => {
    let raf = 0;
    let lastUi = -1;
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      const prev = lastRef.current || now;
      lastRef.current = now;
      if (playingRef.current) {
        // A tab that was in the background hands back a huge delta; clamp it
        // rather than jumping the film forward by however long you were away.
        const dt = Math.min((now - prev) / 1000, 0.25);
        timeRef.current += dt;
        if (timeRef.current >= RUNTIME) {
          timeRef.current = RUNTIME;
          playingRef.current = false;
          setPlaying(false);
          setEnded(true);
        }
        paint();
      }
      const t = timeRef.current;
      if (lastUi < 0 || Math.abs(t - lastUi) > 0.1) {
        lastUi = t;
        setUiTime(t);
      }
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [paint]);

  const seek = useCallback(
    (to: number) => {
      timeRef.current = Math.max(0, Math.min(RUNTIME, to));
      setUiTime(timeRef.current);
      setEnded(timeRef.current >= RUNTIME);
      if (!started) setStarted(true);
      paint();
    },
    [paint, started],
  );

  // Picking a chapter from the list is a request to watch it, unlike dragging
  // the scrubber, which leaves play state alone.
  const playChapter = useCallback(
    (at: number) => {
      seek(at + 0.05);
      if (!playingRef.current) {
        playingRef.current = true;
        lastRef.current = 0;
        setPlaying(true);
      }
      setShowChapters(false);
    },
    [seek],
  );

  const toggle = useCallback(() => {
    if (!started) {
      setStarted(true);
      // The poster is a frame from part-way in; playing starts at the start.
      timeRef.current = 0;
    }
    if (ended) {
      timeRef.current = 0;
      setEnded(false);
    }
    const next = !playingRef.current;
    playingRef.current = next;
    lastRef.current = 0;
    setPlaying(next);
    paint();
  }, [ended, paint, started]);

  // Repaint when the poster gives way to the film, or calm mode flips.
  useEffect(() => {
    paint();
  }, [paint]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (e.key === " " || e.key === "k") {
        e.preventDefault();
        toggle();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        seek(timeRef.current + 5);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        seek(timeRef.current - 5);
      } else if (e.key === "Escape" && onClose) {
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, seek, toggle]);

  const line = lineAt(started ? uiTime : POSTER_TIME);
  const chapter = chapterAt(uiTime);
  const lines = useMemo(() => transcript(), []);
  const progress = (uiTime / RUNTIME) * 100;

  return (
    <div className="film" ref={frameRef}>
      <div className="film__stage" ref={shellRef}>
        <canvas className="film__canvas" ref={canvasRef} role="img" aria-label="An illustrated guide to mahjong" />

        {started && line.text ? (
          <p className="film__sub" key={line.index}>
            <span>{line.text}</span>
          </p>
        ) : null}

        {!started ? (
          <button
            type="button"
            className="film__big"
            onClick={toggle}
            aria-label="Play the film"
          >
            <span className="film__bigicon" aria-hidden="true" />
            <span className="film__biglabel">
              How mahjong works
              <small>{clock(RUNTIME)} · no sound needed</small>
            </span>
          </button>
        ) : null}

        {ended ? (
          <div className="film__end">
            <p className="film__endline">That is the whole game.</p>
            <div className="film__endrow">
              <button type="button" className="btn btn--sm" onClick={() => seek(0)}>
                Watch again
              </button>
              {onClose ? (
                <button type="button" className="btn btn--sm btn--primary" onClick={onClose}>
                  Take a seat
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      {/* The narration, for anyone not watching the pictures. */}
      <p className="film__live" aria-live="polite">
        {line.text}
      </p>

      <div className="film__bar">
        <button
          type="button"
          className="film__play"
          onClick={toggle}
          aria-label={playing ? "Pause" : "Play"}
          aria-pressed={playing}
        >
          {playing ? "❚❚" : "▶"}
        </button>

        <span className="film__time">{clock(uiTime)}</span>

        <div className="film__track">
          <input
            className="film__range"
            type="range"
            min={0}
            max={RUNTIME}
            step={0.1}
            value={uiTime}
            aria-label="Scrub the film"
            onChange={(e) => seek(Number(e.target.value))}
          />
          <div className="film__fill" style={{ width: `${progress}%` }} aria-hidden="true" />
          {CHAPTERS.map((c) => (
            <button
              key={c.at}
              type="button"
              className="film__mark"
              style={{ left: `${(c.at / RUNTIME) * 100}%` }}
              title={c.title}
              aria-label={`Jump to ${c.title}`}
              onClick={() => seek(c.at + 0.05)}
            />
          ))}
        </div>

        <span className="film__time film__time--total">{clock(RUNTIME)}</span>
        {/* The dots on the track carry their names only on hover, which a
            phone never has; this is the way to every chapter by name. */}
        <button
          type="button"
          className="btn btn--sm btn--ghost film__chapter"
          onClick={() => setShowChapters((v) => !v)}
          aria-expanded={showChapters}
        >
          <span className="film__chapterlabel">Chapters</span>
          <span className="film__chaptername">{chapter.title}</span>
        </button>

        <button
          type="button"
          className="btn btn--sm btn--ghost"
          onClick={() => setShowText((v) => !v)}
          aria-expanded={showText}
        >
          {showText ? "Hide text" : "Read it instead"}
        </button>

        <button
          type="button"
          className="btn btn--sm btn--ghost"
          onClick={toggleFull}
          aria-pressed={full}
          aria-label={full ? "Leave fullscreen" : "Watch fullscreen"}
        >
          {full ? "Exit full" : "Fullscreen"}
        </button>
      </div>

      {showChapters ? (
        <nav className="film__chapters" aria-label="Chapters" ref={chaptersRef}>
          <ol>
            {CHAPTERS.map((c, i) => (
              <li key={c.at}>
                <button
                  type="button"
                  aria-current={c.at === chapter.at ? "true" : undefined}
                  onClick={() => playChapter(c.at)}
                >
                  <span className="film__chapternum">{i + 1}</span>
                  <span className="film__chaptertitle">{c.title}</span>
                  <span className="film__tstamp">{clock(c.at)}</span>
                </button>
              </li>
            ))}
          </ol>
        </nav>
      ) : null}

      {showText ? (
        <div className="film__transcript">
          <ol>
            {lines.map((l) => (
              <li key={l.time}>
                <button type="button" onClick={() => seek(l.time + 0.05)}>
                  <span className="film__tstamp">{clock(l.time)}</span>
                  {l.text}
                </button>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </div>
  );
}

/** The film, full width, over the table. */
export function FilmDialog({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  return (
    <div
      className="film__backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="film__shell" role="dialog" aria-modal="true" aria-label="How mahjong works">
        <div className="film__head">
          <h2 className="film__title">How mahjong works</h2>
          <button type="button" className="btn btn--sm btn--ghost" onClick={onClose}>
            Close
          </button>
        </div>
        <FilmPlayer onClose={onClose} />
      </div>
    </div>
  );
}
