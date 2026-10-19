/**
 * The tiles behind each faan pattern a hand scored, so a result can show them
 * beside the pattern. Only patterns that rest on a few tiles get any: a dragon
 * set, a wind set, a flower, the winning tile. A pattern about the whole hand
 * — a flush, all sets, a concealed hand — is the hand itself, already shown.
 */
import type { PatternHit } from "./scoring";
import { DRAGONS, type Seat, type TileCode, seatWind } from "./tiles";

/** The most tiles shown beside one pattern: a kong. */
export const PATTERN_TILE_LIMIT = 4;

export interface ScoredHand {
  /** Every set the hand went out with, open melds and concealed sets alike. */
  sets: { type: "chow" | "pung" | "kong"; codes: TileCode[] }[];
  flowers: TileCode[];
  /** The tile the hand was won on, when it is known. */
  winningTile: TileCode | null;
  seat: Seat;
  roundWind: TileCode;
}

const FLOWER_SET: TileCode[] = ["f1", "f2", "f3", "f4"];
const SEASON_SET: TileCode[] = ["f5", "f6", "f7", "f8"];

/** Each pattern's tiles, in the same order as `patterns`; null where none are worth showing. */
export function patternTiles(patterns: readonly PatternHit[], hand: ScoredHand): (TileCode[] | null)[] {
  const triplets = hand.sets.filter((s) => s.type !== "chow");
  const tripletOf = (code: TileCode) => triplets.find((s) => s.codes[0] === code)?.codes ?? null;
  // Scoring lists one Dragon Triplet per dragon set, in the order the sets were found.
  const dragonSets = triplets.filter((s) => DRAGONS.includes(s.codes[0]));
  let dragons = 0;
  const held = (code: TileCode) => (hand.flowers.includes(code) ? [code] : null);
  const winning = hand.winningTile ? [hand.winningTile] : null;

  return patterns.map((p) => {
    let tiles: TileCode[] | null;
    switch (p.key) {
      case "dragonPung":
        tiles = dragonSets[dragons++]?.codes ?? null;
        break;
      case "seatWind":
        tiles = tripletOf(seatWind(hand.seat));
        break;
      case "roundWind":
        tiles = tripletOf(hand.roundWind);
        break;
      case "ownFlower":
        tiles = held(FLOWER_SET[hand.seat]);
        break;
      case "ownSeason":
        tiles = held(SEASON_SET[hand.seat]);
        break;
      case "flowerSet":
        tiles = FLOWER_SET;
        break;
      case "seasonSet":
        tiles = SEASON_SET;
        break;
      case "selfDraw":
      case "kongReplacement":
      case "robbingKong":
      case "lastTile":
        tiles = winning;
        break;
      default:
        tiles = null;
    }
    return tiles && tiles.length <= PATTERN_TILE_LIMIT ? [...tiles] : null;
  });
}
