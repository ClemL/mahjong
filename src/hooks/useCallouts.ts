"use client";

import { useEffect, useRef } from "react";
import type { RoomView } from "@/game/room";

export type Call = "chow" | "pung" | "kong" | "win" | "selfDrawn";

/** What each call sounds like: Cantonese where the device has a voice for it, English where not. */
export const CALL_WORDS: Record<Call, { zh: string; en: string }> = {
  chow: { zh: "上", en: "Chow" },
  pung: { zh: "碰", en: "Pung" },
  kong: { zh: "槓", en: "Kong" },
  win: { zh: "食糊", en: "Mahjong" },
  selfDrawn: { zh: "自摸", en: "Self-drawn" },
};

/**
 * The call a change at the table is worth, if any: a set laid down, or a hand
 * won. Read from two consecutive views, as every cue at the table is.
 */
export function calloutFor(before: RoomView, view: RoomView): Call | null {
  if (view.handNumber !== before.handNumber) return null;
  if (view.phase === "handOver" && before.phase !== "handOver") {
    if (view.result?.type !== "win") return null;
    return view.result.from === null ? "selfDrawn" : "win";
  }
  for (const player of view.players) {
    const had = before.players[player.seat]?.melds.length ?? 0;
    const laid = player.melds[had];
    if (player.melds.length > had && laid) return laid.type === "kong" ? "kong" : laid.type === "chow" ? "chow" : "pung";
  }
  return null;
}

/**
 * A Cantonese voice if the device has one, then any Chinese voice, which reads
 * the same characters; otherwise none, and the call is said in English.
 */
export function pickVoice(voices: readonly SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const lang = (v: SpeechSynthesisVoice) => v.lang.toLowerCase().replace("_", "-");
  return (
    voices.find((v) => lang(v).startsWith("zh-hk") || lang(v).startsWith("yue")) ??
    voices.find((v) => lang(v).startsWith("zh")) ??
    null
  );
}

function say(call: Call): void {
  try {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const synth = window.speechSynthesis;
    const voice = pickVoice(synth.getVoices());
    const words = CALL_WORDS[call];
    const utterance = new SpeechSynthesisUtterance(voice ? words.zh : words.en);
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    }
    // A call cut short by the next one is better than two talking at once.
    synth.cancel();
    synth.speak(utterance);
  } catch {
    // Speech is a nicety: a browser that refuses it changes nothing at the table.
  }
}

/**
 * The table calling out claims and wins, as people would around a real one:
 * 碰, 上, 槓, 食糊, 自摸. Only the tablet speaks — four phones saying it at
 * once would be a chorus — and never while its sound is off.
 */
export function useCallouts(view: RoomView | null, enabled: boolean): void {
  const previous = useRef<RoomView | null>(null);
  useEffect(() => {
    const before = previous.current;
    previous.current = view;
    if (!view || !before || !enabled) return;
    const call = calloutFor(before, view);
    if (call) say(call);
  }, [view, enabled]);
}
