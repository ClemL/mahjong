/**
 * Table sounds, synthesised with the Web Audio API.
 *
 * Everything is generated at runtime rather than loaded as audio files: the
 * cues are short and percussive, so synthesis costs a few lines and keeps the
 * deployment a single static bundle with no media to fetch.
 *
 * Browsers refuse to start audio before a user gesture, so the context is
 * created lazily on the first sound and resumed on demand; every call is a
 * no-op until then, and any failure is swallowed — sound is never load-bearing.
 */

export type SoundName = "discard" | "draw" | "claim" | "kong" | "win" | "washout";

let context: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    if (!context) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      context = new Ctor();
    }
    if (context.state === "suspended") void context.resume();
    return context;
  } catch {
    return null;
  }
}

/** A short filtered noise burst — the clack of a tile hitting the table. */
function clack(ctx: AudioContext, at: number, gain: number, brightness: number): void {
  const length = Math.floor(ctx.sampleRate * 0.06);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) {
    // White noise under a steep exponential decay.
    data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 7);
  }
  const source = ctx.createBufferSource();
  source.buffer = buffer;

  const band = ctx.createBiquadFilter();
  band.type = "bandpass";
  band.frequency.value = brightness;
  band.Q.value = 1.1;

  const amp = ctx.createGain();
  amp.gain.value = gain;

  source.connect(band).connect(amp).connect(ctx.destination);
  source.start(at);
  source.stop(at + 0.08);
}

/** A short pitched blip, used for the claim and win cues. */
function blip(ctx: AudioContext, at: number, freq: number, seconds: number, gain: number): void {
  const osc = ctx.createOscillator();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(freq, at);

  const amp = ctx.createGain();
  amp.gain.setValueAtTime(0.0001, at);
  amp.gain.exponentialRampToValueAtTime(gain, at + 0.012);
  amp.gain.exponentialRampToValueAtTime(0.0001, at + seconds);

  osc.connect(amp).connect(ctx.destination);
  osc.start(at);
  osc.stop(at + seconds + 0.02);
}

export function playSound(name: SoundName): void {
  const ctx = audio();
  if (!ctx) return;
  const now = ctx.currentTime;
  try {
    switch (name) {
      case "discard":
        clack(ctx, now, 0.5, 1750);
        break;
      case "draw":
        clack(ctx, now, 0.16, 2600);
        break;
      case "claim":
        // A tile pulled back off the table, then a rising two-tone confirmation.
        clack(ctx, now, 0.34, 1500);
        blip(ctx, now + 0.05, 523.25, 0.1, 0.1);
        blip(ctx, now + 0.13, 784.0, 0.14, 0.1);
        break;
      case "kong":
        clack(ctx, now, 0.4, 1300);
        blip(ctx, now + 0.05, 392.0, 0.12, 0.11);
        blip(ctx, now + 0.15, 587.33, 0.18, 0.11);
        break;
      case "win": {
        // A pentatonic run — unmistakably different from a claim.
        const notes = [523.25, 659.25, 783.99, 1046.5];
        notes.forEach((f, i) => blip(ctx, now + i * 0.1, f, 0.34, 0.13));
        break;
      }
      case "washout":
        blip(ctx, now, 349.23, 0.2, 0.1);
        blip(ctx, now + 0.16, 261.63, 0.34, 0.09);
        break;
    }
  } catch {
    // A failed cue must never interrupt play.
  }
}

/** Nudge the audio context awake from a user gesture. */
export function primeAudio(): void {
  audio();
}
