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
  heavenlyHand: number;
  earthlyHand: number;
}

/** Faan minimums a table can be set to. 3 is the Hong Kong standard. */
export const MIN_FAAN_CHOICES = [0, 1, 3, 5] as const;
export type MinFaan = (typeof MIN_FAAN_CHOICES)[number];

/** Wind rounds a game can run: East only, East and South, or all four. */
export const ROUND_CHOICES = [1, 2, 4] as const;

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
  /**
   * When false the eight bonus tiles are left out of the set — 136 tiles —
   * and nothing is scored for them, No Bonus Tiles included.
   */
  flowers: boolean;
  /**
   * Wind rounds in a game, four dealerships each: 1 is the East round alone,
   * 2 adds the South round, 4 plays every wind.
   */
  rounds: number;
  /**
   * 包: whoever feeds a player the set that makes a third dragon set or a
   * fourth set of any kind pays the whole of that player's self-drawn win.
   */
  liability: boolean;
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
  heavenlyHand: 13,
  earthlyHand: 13,
};

/**
 * Chips each player sits down with at a table with a tablet. A chip is a
 * point: the balance is this plus the running score.
 */
export const STARTING_CHIPS = 100;

/** Classic Hong Kong doubling table, 3 faan minimum, 10 faan limit. */
export const DEFAULT_PAYOUT_TABLE = [1, 2, 4, 8, 16, 24, 32, 48, 64, 96, 128];

export const DEFAULT_RULES: RuleConfig = {
  minFaan: 3,
  limitFaan: 10,
  payoutTable: DEFAULT_PAYOUT_TABLE,
  discarderPaysAll: true,
  dealerKeepsOnWashout: false,
  flowers: true,
  rounds: 4,
  liability: true,
  faan: DEFAULT_FAAN,
};

/** Wind rounds this game runs. A table saved before the option existed ran one. */
export function roundsInGame(config: Pick<RuleConfig, "rounds">): number {
  return (ROUND_CHOICES as readonly number[]).includes(config.rounds) ? config.rounds : 1;
}

/** The game's length in words, e.g. "the East and South rounds". */
export function describeRounds(rounds: number): string {
  if (rounds >= 4) return "all four wind rounds";
  if (rounds === 2) return "the East and South rounds";
  return "the East round";
}

/** Whether this table plays with the bonus tiles. A table saved before the option existed did. */
export function flowersInPlay(config: Pick<RuleConfig, "flowers">): boolean {
  return config.flowers !== false;
}

/** Whether this table plays 包. A table saved before the option existed gets the default. */
export function liabilityInPlay(config: Pick<RuleConfig, "liability">): boolean {
  return config.liability !== false;
}

/** A faan value, falling back to the default for a table saved before the pattern existed. */
export function faanFor(config: RuleConfig, key: keyof FaanTable): number {
  return config.faan[key] ?? DEFAULT_FAAN[key];
}

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
      body: flowersInPlay(config)
        ? "144 tiles: three suits of 1–9 (Characters 萬, Dots 筒, Bamboo 索) in four copies, " +
          "four Winds and three Dragons in four copies, plus four Flowers and four Seasons as bonus tiles."
        : "136 tiles: three suits of 1–9 (Characters 萬, Dots 筒, Bamboo 索) in four copies, " +
          "four Winds and three Dragons in four copies. This table plays without Flowers and Seasons, " +
          "so no faan is scored for them.",
    },
    {
      title: "Dealing",
      body:
        "Each player receives 13 tiles; the dealer (East) starts with 14 and discards first." +
        (flowersInPlay(config)
          ? " Bonus tiles are revealed immediately and replaced from the back of the wall."
          : ""),
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
      title: "Limit hands at the deal",
      body:
        "天糊 Heavenly Hand: the dealer wins on the tiles dealt, before anyone has discarded. " +
        "地糊 Earthly Hand: another player wins on the dealer's first discard, or self-draws on their own " +
        "first draw, before anyone has claimed a set or declared a kong. Both score the limit.",
    },
    {
      title: "Payment",
      body:
        "Self-draw (自摸): all three opponents pay the hand's value. " +
        "Win on a discard: the discarder alone pays. A washed-out wall (流局) pays nothing.",
    },
    {
      title: "Liability (包)",
      body: liabilityInPlay(config)
        ? "Whoever discards the tile that gives a player their third dragon set, or their fourth set of any " +
          "kind (twelve tiles face up, 十二張落地), pays that player's whole self-drawn win alone — all three " +
          "shares. If it happens more than once, the latest feed is the one that pays. A concealed kong is " +
          "nobody's feed. A win off a discard is paid by the discarder as usual. House rules vary; the table " +
          "can switch this off."
        : "This table does not play liability (包): a self-drawn win is paid by all three opponents, " +
          "whoever fed the sets.",
    },
    {
      title: "Dealership",
      body:
        "The dealer keeps the deal after winning (連莊); a loss or a washout passes it to the right. " +
        `A game runs ${describeRounds(roundsInGame(config))} — four dealerships each, ` +
        "the round wind moving on once the deal has been all the way round.",
    },
  ];
}

/** The notes for the default ruleset. */
export const RULE_NOTES: RuleNote[] = ruleNotes(DEFAULT_RULES);
