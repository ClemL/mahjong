"use client";

import { useLocalSetting } from "./useLocalSetting";

/**
 * How a phone lays out the controller. Rail keeps the hand in one row along
 * the bottom, with the move in question on the left and the buttons for it
 * on the right. Shelves stacks the hand in two rows split by suit, so its
 * tiles can be about twice the area, and puts everything else in a column on
 * the right.
 */
export type PhoneLayout = "rail" | "shelves";
export const PHONE_LAYOUTS: readonly PhoneLayout[] = ["rail", "shelves"];

export interface PhoneLayoutApi {
  layout: PhoneLayout;
  setLayout: (value: PhoneLayout) => void;
}

/** A per-device choice, like sound: a small phone may want the larger tiles, a large one may not. */
export function usePhoneLayout(): PhoneLayoutApi {
  const [layout, setLayout] = useLocalSetting<PhoneLayout>("hk-mahjong.phone-layout", "rail", PHONE_LAYOUTS);
  return { layout, setLayout };
}
