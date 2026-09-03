/**
 * House rules. Hong Kong scoring varies by table; these are the defaults this
 * app plays with, and every number here is shown to the player in the Rules
 * panel so nothing is hidden behind the scoreboard.
 */

export interface FaanTable {
  allChows: number;
  allPungs: number;
  halfFlush: number;
  fullFlush: number;
  terminalsAndHonors: number;
  allTerminals: number;
  allHonors: number;
  smallThreeDragons: number;
  bigThreeDragons: number;
  smallFourWinds: number;
  bigFourWinds: number;
  fourKongs: number;
  thirteenOrphans: number;
  nineGates: number;
  honorTriplet: number;
  selfDraw: number;
  concealedHand: number;
  allExposed: number;
  kongReplacement: number;
  robbingKong: number;
  lastTile: number;
  bonusSet: number;
  allEightBonus: number;
  noBonus: number;
}

/** Faan minimums a table can be set to. 3 is the Hong Kong standard. */
export const MIN_FAAN_CHOICES = [0, 1, 3, 5] as const;
export type MinFaan = (typeof MIN_FAAN_CHOICES)[number];

export interface RuleConfig {
  /**
   * Minimum faan required to declare a win. The Hong Kong standard is 3;
   * 0 allows a chicken hand (雞糊) to win for a single point.
   */
  minFaan: number;
  /** Faan cap — 滿糊. */
  limitFaan: number;
  /** payoutTable[faan] = points a single payer owes. */
  payoutTable: number[];
  /** When true the discarder alone pays a discard win (出銃全包). */
  discarderPaysAll: boolean;
  /** When true a washed-out hand keeps the dealership in place (流局連莊). */
  dealerKeepsOnWashout: boolean;
  faan: FaanTable;
}

export const DEFAULT_FAAN: FaanTable = {
  allChows: 1,
  allPungs: 3,
  halfFlush: 3,
  fullFlush: 7,
  terminalsAndHonors: 6,
  allTerminals: 10,
  allHonors: 10,
  smallThreeDragons: 5,
  bigThreeDragons: 8,
  smallFourWinds: 10,
  bigFourWinds: 13,
  fourKongs: 13,
  thirteenOrphans: 13,
  nineGates: 10,
  honorTriplet: 1,
  selfDraw: 1,
  concealedHand: 1,
  allExposed: 3,
  kongReplacement: 1,
  robbingKong: 1,
  lastTile: 1,
  bonusSet: 3,
  allEightBonus: 13,
  noBonus: 1,
};

/** Classic Hong Kong doubling table, 3 faan minimum, 10 faan limit. */
export const DEFAULT_PAYOUT_TABLE = [1, 2, 4, 8, 16, 24, 32, 48, 64, 96, 128];

export const DEFAULT_RULES: RuleConfig = {
  minFaan: 0,
  limitFaan: 10,
  payoutTable: DEFAULT_PAYOUT_TABLE,
  discarderPaysAll: true,
  dealerKeepsOnWashout: false,
  faan: DEFAULT_FAAN,
};

export interface RuleNote {
  title: string;
  body: string;
}

function describeMinimum(minFaan: number): string {
  if (minFaan <= 0) {
    return "There is no faan minimum, so even a chicken hand (雞糊, 0 faan) may be declared for one point.";
  }
  return `A win must be worth at least ${minFaan} faan, bonus tiles included.`;
}

/** Plain-language summary of the ruleset, rendered in the Rules panel. */
export function ruleNotes(config: RuleConfig = DEFAULT_RULES): RuleNote[] {
  return [
    {
      title: "Tiles",
      body:
        "144 tiles: three suits of 1–9 (Characters 萬, Dots 筒, Bamboo 索) in four copies, " +
        "four Winds and three Dragons in four copies, plus four Flowers and four Seasons as bonus tiles.",
    },
    {
      title: "Dealing",
      body:
        "Each player receives 13 tiles; the dealer (East) starts with 14 and discards first. " +
        "Bonus tiles are revealed immediately and replaced from the back of the wall.",
    },
    {
      title: "Turn order",
      body: "Play passes East → South → West → North. Draw one tile, then discard one.",
    },
    {
      title: "Claiming a discard",
      body:
        "Pung and Kong may be claimed by any player; Chow only by the player to the discarder's " +
        "right (the next to play). Priority is Win > Kong > Pung > Chow. A claim skips the players in between.",
    },
    {
      title: "Kongs",
      body:
        "Exposed kong (from a discard), concealed kong (four in hand), and added kong (a fourth tile " +
        "onto your own exposed pung). Each draws a replacement tile from the back of the wall. " +
        "An added kong can be robbed by a player who wins on that tile (搶槓).",
    },
    {
      title: "Winning hand",
      body:
        "Four sets and a pair, or Thirteen Orphans (十三么) / Nine Gates (九蓮寶燈). " +
        describeMinimum(config.minFaan),
    },
    {
      title: "Payment",
      body:
        "Self-draw (自摸): all three opponents pay the hand's value. " +
        "Win on a discard: the discarder alone pays. A washed-out wall (流局) pays nothing.",
    },
    {
      title: "Dealership",
      body:
        "The dealer keeps the deal after winning (連莊); a loss or a washout passes it to the right. " +
        "A game runs one East round — four dealerships.",
    },
  ];
}

/** The notes for the default ruleset. */
export const RULE_NOTES: RuleNote[] = ruleNotes(DEFAULT_RULES);
