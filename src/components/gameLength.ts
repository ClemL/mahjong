import type { ChoiceOption } from "./Choice";

/** The game lengths a table can choose, for the start page, the solo game and the tablet alike. */
export const GAME_LENGTHS: ChoiceOption<`${number}`>[] = [
  { value: "1", label: "East round", hint: "Four dealerships — the usual short game" },
  { value: "2", label: "East + South", hint: "Eight dealerships: the South round follows the East" },
  { value: "4", label: "All four winds", hint: "Sixteen dealerships, East round through North round" },
];
