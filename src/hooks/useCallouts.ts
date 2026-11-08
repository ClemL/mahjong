"use client";

import { useEffect, useRef } from "react";
import type { RoomView } from "@/game/room";
import type { PatternHit, ScoreResult } from "@/game/scoring";
import { type TileCode, isHonor, rankOf, tileName, tileSuitGlyph } from "@/game/tiles";
import type { AnnounceSpeed, SpeechLanguage } from "./useLocalSetting";

export type Call = "chow" | "pung" | "kong" | "win" | "selfDrawn";

/** Something the tablet can say, in each language it speaks. */
export interface Words {
  zh: string;
  en: string;
}

/** What each call sounds like, in Cantonese and in English. */
export const CALL_WORDS: Record<Call, Words> = {
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
 * For Cantonese, a Cantonese voice if the device lists one, then any Chinese
 * voice, which reads the same characters; for English, the device's own
 * English voice, then any. None found, the words are still marked with their
 * language, which lets a device whose voices load late pick its own.
 */
export function pickVoice(
  voices: readonly SpeechSynthesisVoice[],
  language: SpeechLanguage = "cantonese",
): SpeechSynthesisVoice | null {
  const lang = (v: SpeechSynthesisVoice) => v.lang.toLowerCase().replace("_", "-");
  if (language === "english") {
    const english = voices.filter((v) => lang(v).startsWith("en"));
    return english.find((v) => v.default) ?? english[0] ?? null;
  }
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

/** Honours as they are said: a wind by its direction alone, a dragon by its full name. */
const HONOR_WORDS: Record<string, Words> = {
  we: { zh: "東", en: "East" },
  ws: { zh: "南", en: "South" },
  ww: { zh: "西", en: "West" },
  wn: { zh: "北", en: "North" },
  dr: { zh: "紅中", en: "Red Dragon" },
  dg: { zh: "發財", en: "Green Dragon" },
  dw: { zh: "白板", en: "White Dragon" },
};

const NUMERALS = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"];

/** A tile as it is said: 五筒, 紅中, 東 in Cantonese; 5 Dots, Red Dragon, East in English. */
export function spokenTile(code: TileCode): Words {
  if (isHonor(code)) return HONOR_WORDS[code] ?? { zh: tileName(code), en: tileName(code) };
  const suit = tileSuitGlyph(code);
  return { zh: suit ? `${NUMERALS[rankOf(code)]}${suit}` : tileName(code), en: tileName(code) };
}

/** A count as said before 番: 兩 for two, as Cantonese has it, and 十三 for thirteen. */
function chineseCount(n: number): string {
  if (n === 2) return "兩";
  if (n < 10) return NUMERALS[n];
  if (n < 100) {
    const tens = Math.floor(n / 10);
    return `${tens > 1 ? NUMERALS[tens] : ""}十${n % 10 ? NUMERALS[n % 10] : ""}`;
  }
  return String(n);
}

/** Patterns about how a hand was kept or won rather than what it is: its theme only when nothing of the hand's own outranks them. */
const INCIDENTAL = new Set(["concealedHand", "noBonus", "ownFlower", "ownSeason"]);

/**
 * The pattern a hand is known by: its biggest, and on a tie one of the hand's
 * own shape before one about how it was kept. Self-draw is never it — the
 * call has just said 自摸.
 */
export function mainTheme(score: ScoreResult): PatternHit | null {
  let best: PatternHit | null = null;
  for (const p of score.patterns) {
    if (p.key === "selfDraw") continue;
    const outranks =
      !best || p.faan > best.faan || (p.faan === best.faan && INCIDENTAL.has(best.key) && !INCIDENTAL.has(p.key));
    if (outranks) best = p;
  }
  return best;
}

/**
 * What the table says after the call on a win: the hand's main theme, then
 * the faan it is paid at — 清一色，七番. A hand with no pattern at all is a
 * chicken hand, 雞糊. With several winners on one tile, the first is told.
 */
export function winSummary(score: ScoreResult): Words {
  const theme = mainTheme(score);
  const faan = score.scoredFaan;
  const named: Words | null = theme
    ? // "一台花 (季)": the bracket tells the two sets apart in writing, and is not said.
      { zh: theme.chinese.replace(/\s*\(.*?\)/g, ""), en: theme.name }
    : faan === 0
      ? { zh: "雞糊", en: "Chicken Hand" }
      : null;
  const count: Words = { zh: `${chineseCount(faan)}番`, en: `${faan} faan` };
  return named ? { zh: `${named.zh}，${count.zh}`, en: `${named.en}, ${count.en}` } : count;
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

function speak(words: Words, kind: Speech, rate: number, interrupt: boolean, language: SpeechLanguage): void {
  try {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
    const synth = window.speechSynthesis;
    const english = language === "english";
    const utterance = new SpeechSynthesisUtterance(english ? words.en : words.zh);
    const voice = pickVoice(synth.getVoices(), language);
    if (voice) utterance.voice = voice;
    utterance.lang = voice?.lang ?? (english ? "en-US" : "zh-HK");
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
 * 碰, 上, 槓, 食糊, 自摸, and after a win the hand's theme and faan — and,
 * when asked to, naming every tile as it is thrown. In Cantonese unless the
 * table chose English. Only the tablet speaks — four phones saying it at once
 * would be a chorus — and the caller passes nothing switched on while its
 * sound is off.
 */
export function useCallouts(
  view: RoomView | null,
  { calls, announce, language }: { calls: boolean; announce: AnnounceSpeed; language: SpeechLanguage },
): void {
  const previous = useRef<RoomView | null>(null);
  const speaking = calls || announce !== "off";
  useEffect(() => {
    // Some browsers list their voices only once asked, and late: asking now
    // means the first call already finds the Cantonese one.
    if (!speaking) return;
    try {
      window.speechSynthesis?.getVoices();
    } catch {
      // No speech here; the calls are skipped as they come.
    }
  }, [speaking]);
  useEffect(() => {
    const before = previous.current;
    previous.current = view;
    if (!view || !before) return;
    const tile = announce === "off" ? null : announcementFor(before, view);
    const call = calls ? calloutFor(before, view) : null;
    if (tile && announce !== "off") speak(spokenTile(tile), "tile", ANNOUNCE_RATES[announce], true, language);
    if (!call) return;
    // Seen in the same poll as the tile it claims, the call follows it rather than silencing it.
    speak(CALL_WORDS[call], "call", 1, tile === null, language);
    const score = call === "win" || call === "selfDrawn" ? view.result?.score : null;
    if (score) speak(winSummary(score), "call", 1, false, language);
  }, [view, calls, announce, language]);
}
