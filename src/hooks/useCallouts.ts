"use client";

import { useEffect, useRef } from "react";
import type { RoomView } from "@/game/room";
import { type TileCode, isHonor, rankOf, tileName, tileSuitGlyph } from "@/game/tiles";
import type { AnnounceSpeed } from "./useLocalSetting";

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

/** How fast each announcement speed talks, as a speech rate: 1 is the voice's own pace. */
export const ANNOUNCE_RATES: Record<Exclude<AnnounceSpeed, "off">, number> = {
  slow: 0.7,
  normal: 1,
  fast: 1.6,
};

/** Honours as a Hong Kong table names them aloud: the wind with 風, the dragons by their full names. */
const HONOR_WORDS: Record<string, string> = {
  we: "東風",
  ws: "南風",
  ww: "西風",
  wn: "北風",
  dr: "紅中",
  dg: "發財",
  dw: "白板",
};

const RANK_WORDS = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九"];

/** A tile as it is said: 五筒, 紅中, 東風 for a Chinese voice; 5 Dots, Red Dragon in English. */
export function spokenTile(code: TileCode): { zh: string; en: string } {
  const en = tileName(code);
  if (isHonor(code)) return { zh: HONOR_WORDS[code] ?? en, en };
  const suit = tileSuitGlyph(code);
  return { zh: suit ? `${RANK_WORDS[rankOf(code)]}${suit}` : en, en };
}

/**
 * The tile a change at the table has just put out, if any. Read from the
 * newest discard of the hand rather than the one awaiting claims, which is
 * gone again once the next player draws — a poll can miss that in between.
 */
export function announcementFor(before: RoomView, view: RoomView): TileCode | null {
  if (view.handNumber !== before.handNumber) return null;
  const played = view.lastPlayed;
  if (!played || played.tile.id === before.lastPlayed?.tile.id) return null;
  return played.tile.code;
}

type Speech = "call" | "tile";

/** What the tablet is saying now, so a tile can tell whether it would cut a call short. */
let current: { kind: Speech; utterance: SpeechSynthesisUtterance } | null = null;

function speak(words: { zh: string; en: string }, kind: Speech, rate: number, interrupt: boolean): void {
  try {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const synth = window.speechSynthesis;
    const voice = pickVoice(synth.getVoices());
    const utterance = new SpeechSynthesisUtterance(voice ? words.zh : words.en);
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    }
    utterance.rate = rate;
    // Whatever was being said is cut short rather than queued, so the table is
    // never more than one thing behind play — except that a tile waits for a
    // call to finish, since the call is the news.
    const behindCall = kind === "tile" && current?.kind === "call" && (synth.speaking || synth.pending);
    const queue = !interrupt || behindCall;
    if (!queue) {
      synth.cancel();
      current = { kind, utterance };
    }
    utterance.onstart = () => {
      current = { kind, utterance };
    };
    utterance.onend = utterance.onerror = () => {
      if (current?.utterance === utterance) current = null;
    };
    synth.speak(utterance);
  } catch {
    // Speech is a nicety: a browser that refuses it changes nothing at the table.
  }
}

/**
 * The table calling out claims and wins, as people would around a real one:
 * 碰, 上, 槓, 食糊, 自摸 — and, when asked to, naming every tile as it is
 * thrown. Only the tablet speaks — four phones saying it at once would be a
 * chorus — and the caller passes nothing switched on while its sound is off.
 */
export function useCallouts(
  view: RoomView | null,
  { calls, announce }: { calls: boolean; announce: AnnounceSpeed },
): void {
  const previous = useRef<RoomView | null>(null);
  useEffect(() => {
    const before = previous.current;
    previous.current = view;
    if (!view || !before) return;
    const tile = announce === "off" ? null : announcementFor(before, view);
    const call = calls ? calloutFor(before, view) : null;
    if (tile && announce !== "off") speak(spokenTile(tile), "tile", ANNOUNCE_RATES[announce], true);
    // Seen in the same poll as the tile it claims, the call follows it rather than silencing it.
    if (call) speak(CALL_WORDS[call], "call", 1, tile === null);
  }, [view, calls, announce]);
}
