"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type ClaimOption,
  type GameState,
  type KongOption,
  type TurnActions,
  answerClaim,
  claimTurn,
  createGame,
  declareAddedKong,
  declareConcealedKong,
  declareSelfDraw,
  discard as discardTile,
  nextHand as nextHandOf,
  setMinFaan as setMinFaanOf,
  setRounds as setRoundsOf,
  turnActions,
  waitsAfterDiscard,
} from "@/game/engine";
import {
  awaitingHumanClaim,
  needsTurnAdvance,
  shouldPromptClaim,
  stepTable,
} from "@/game/controller";
import { STRATEGIES } from "@/game/ai";
import { type Rng, createRng } from "@/game/rng";
import { type SoundName, playSound, primeAudio } from "@/game/sound";
import { type GameSettings, type Speed, readPreferences, usePreferences } from "@/hooks/usePreferences";
import type { Seat } from "@/game/tiles";
import { isFlower } from "@/game/tiles";
import { DEFAULT_RULES, roundsInGame } from "@/game/rules";

export type { Speed };

const DELAYS: Record<Speed, number> = { slow: 1200, normal: 650, fast: 260 };

const IDLE_ACTIONS: TurnActions = {
  canDiscard: false,
  kongs: [],
  canWin: false,
  winScore: null,
};

export interface MahjongApi extends GameSettings {
  state: GameState | null;
  /** Counts the games dealt on this page; a new game starts back at hand 1. */
  game: number;
  humanSeat: Seat;
  /** What the player may do on their own turn. */
  actions: TurnActions;
  /** Claim options offered to the player on the current discard. */
  claimOptions: ClaimOption[];
  awaitingClaim: boolean;
  /** Ids of hand tiles whose discard would leave the hand ready (聽牌). */
  readyDiscards: Set<string>;
  /** The felt is still building the wall and dealing; nobody plays until it has. */
  dealing: boolean;
  paused: boolean;
  setPaused: (value: boolean) => void;
  discard: (tileId: string) => void;
  declareKong: (option: KongOption) => void;
  declareWin: () => void;
  claim: (optionId: string) => void;
  pass: () => void;
  nextHand: () => void;
  newGame: () => void;
}

/**
 * A `?seed=` on the address deals that game, so a reported deal can be played
 * again and the browser tests start from a known table. Only the first deal
 * reads it; New game is a fresh shuffle.
 */
function seedFromAddress(): number | undefined {
  const asked = Number(new URLSearchParams(window.location.search).get("seed"));
  return Number.isInteger(asked) && asked > 0 ? asked >>> 0 : undefined;
}

export interface MahjongOptions {
  /**
   * How long a fresh hand is shown being dealt before anyone plays, decided as
   * it is dealt. The table on screen knows; the default is not at all.
   */
  dealHoldMs?: (state: GameState) => number;
}

export function useMahjong(humanSeat: Seat = 0, options: MahjongOptions = {}): MahjongApi {
  const [state, setState] = useState<GameState | null>(null);
  const [game, setGame] = useState(0);
  const settings = usePreferences();
  const { speed, showHints, muted, opponents, claimPrompt } = settings;
  const [paused, setPaused] = useState(false);
  const rngRef = useRef<Rng>(createRng(1));
  const mutedRef = useRef(muted);
  mutedRef.current = muted;
  const dealHoldRef = useRef(options.dealHoldMs);
  dealHoldRef.current = options.dealHoldMs;

  const start = useCallback((asked?: number) => {
    const seed = asked ?? Math.floor(Math.random() * 0xffffffff);
    rngRef.current = createRng(seed ^ 0x5bf03635);
    // Read straight from storage: this runs on mount, before the hook's own
    // copy of the stored choices has landed in state.
    const { minFaan, rounds } = readPreferences();
    setState(createGame({ seed, humanSeat, config: { ...DEFAULT_RULES, minFaan, rounds } }));
    setGame((n) => n + 1);
  }, [humanSeat]);

  const newGame = useCallback(() => start(), [start]);

  // A table that shows the deal holds play until it has, rather than playing
  // on top of it. The hold is decided the moment a hand is first seen, so no
  // render ever offers a move early.
  const dealKey = state ? `${state.rngSeed}:${state.handNumber}` : null;
  const hold = useRef<{ key: string | null; until: number }>({ key: null, until: 0 });
  if (state && hold.current.key !== dealKey) {
    hold.current = { key: dealKey, until: Date.now() + (dealHoldRef.current?.(state) ?? 0) };
  }
  const [, wake] = useState(0);
  const dealing = hold.current.until > Date.now();
  useEffect(() => {
    const left = hold.current.until - Date.now();
    if (left <= 0) return;
    const timer = setTimeout(() => wake((n) => n + 1), left + 20);
    return () => clearTimeout(timer);
  }, [dealKey]);

  // Deal on the client so the server render stays deterministic.
  useEffect(() => {
    start(seedFromAddress());
  }, [start]);

  // Cues are derived by comparing each state to the one before it, so the
  // engine stays free of presentation concerns.
  const previousRef = useRef<GameState | null>(null);
  useEffect(() => {
    const previous = previousRef.current;
    previousRef.current = state;
    if (!state || !previous || mutedRef.current) return;
    if (state.handNumber !== previous.handNumber) return;

    const cues: SoundName[] = [];
    const meldsBefore = previous.players.reduce((n, p) => n + p.melds.length, 0);
    const meldsAfter = state.players.reduce((n, p) => n + p.melds.length, 0);
    const kongsBefore = previous.players.reduce(
      (n, p) => n + p.melds.filter((m) => m.type === "kong").length,
      0,
    );
    const kongsAfter = state.players.reduce(
      (n, p) => n + p.melds.filter((m) => m.type === "kong").length,
      0,
    );

    if (state.phase === "handOver" && previous.phase !== "handOver") {
      cues.push(state.result?.type === "win" ? "win" : "washout");
    } else if (kongsAfter > kongsBefore) {
      cues.push("kong");
    } else if (meldsAfter > meldsBefore) {
      cues.push("claim");
    } else if (state.lastDiscard && state.lastDiscard.tile.id !== previous.lastDiscard?.tile.id) {
      cues.push("discard");
    } else if (
      state.drawnTileId &&
      state.drawnTileId !== previous.drawnTileId &&
      state.players[state.turn]?.isHuman
    ) {
      cues.push("draw");
    }
    for (const cue of cues) playSound(cue);
  }, [state]);

  const strategy = STRATEGIES[opponents];

  // A claim the player would never take is passed automatically, so the table
  // only stops for decisions that are actually decisions.
  const pendingClaim = state ? awaitingHumanClaim(state) : false;
  const wantsPrompt = state && pendingClaim ? shouldPromptClaim(state, humanSeat, claimPrompt) : false;
  const awaitingClaim = pendingClaim && wantsPrompt;

  // Drive the table forward whenever it is not the player's move.
  useEffect(() => {
    if (!state || paused || dealing) return;
    if (state.phase === "handOver" || state.phase === "gameOver") return;
    if (awaitingHumanClaim(state) && shouldPromptClaim(state, humanSeat, claimPrompt)) return;
    const humanToAct =
      state.phase === "action" && state.players[state.turn].isHuman && !needsTurnAdvance(state);
    if (humanToAct) return;

    const timer = setTimeout(() => {
      setState((current) => {
        if (current !== state) return current;
        // A claim the player would not be asked about is passed for them, and
        // the next seat in line is asked in turn.
        if (awaitingHumanClaim(state)) return answerClaim(state, humanSeat, null);
        return stepTable(state, rngRef.current, strategy);
      });
    }, DELAYS[speed]);
    return () => clearTimeout(timer);
  }, [state, paused, dealing, speed, humanSeat, claimPrompt, strategy]);

  const actions = useMemo<TurnActions>(
    () => (state && !dealing ? turnActions(state, humanSeat) : IDLE_ACTIONS),
    [state, humanSeat, dealing],
  );

  const claimOptions = useMemo<ClaimOption[]>(
    () => {
      const turn = state ? claimTurn(state) : null;
      return turn?.seat === humanSeat ? turn.options : [];
    },
    [state, humanSeat],
  );

  const readyDiscards = useMemo(() => {
    const ids = new Set<string>();
    if (!state || !showHints || !actions.canDiscard) return ids;
    for (const tile of state.players[humanSeat].hand) {
      if (isFlower(tile.code)) continue;
      if (waitsAfterDiscard(state, humanSeat, tile.id).length > 0) ids.add(tile.id);
    }
    return ids;
  }, [state, humanSeat, showHints, actions.canDiscard]);

  const discard = useCallback(
    (tileId: string) => {
      primeAudio();
      setState((current) =>
        current && turnActions(current, humanSeat).canDiscard
          ? discardTile(current, humanSeat, tileId)
          : current,
      );
    },
    [humanSeat],
  );

  const declareKong = useCallback(
    (option: KongOption) => {
      setState((current) => {
        if (!current) return current;
        return option.kind === "concealed"
          ? declareConcealedKong(current, humanSeat, option.code)
          : declareAddedKong(current, humanSeat, option.code);
      });
    },
    [humanSeat],
  );

  const declareWin = useCallback(() => {
    setState((current) => (current ? declareSelfDraw(current, humanSeat) : current));
  }, [humanSeat]);

  const respond = useCallback(
    (optionId: string | null) => {
      setState((current) =>
        current && awaitingHumanClaim(current)
          ? answerClaim(current, humanSeat, optionId)
          : current,
      );
    },
    [humanSeat],
  );

  const claim = useCallback((optionId: string) => respond(optionId), [respond]);
  const pass = useCallback(() => respond(null), [respond]);

  const nextHand = useCallback(() => {
    setState((current) => (current ? nextHandOf(current) : current));
  }, []);

  const rememberMinFaan = settings.setMinFaan;
  const setMinFaan = useCallback(
    (value: number) => {
      rememberMinFaan(value);
      setState((current) => (current ? setMinFaanOf(current, value) : current));
    },
    [rememberMinFaan],
  );

  const rememberRounds = settings.setRounds;
  const setRounds = useCallback(
    (value: number) => {
      rememberRounds(value);
      setState((current) => (current ? setRoundsOf(current, value) : current));
    },
    [rememberRounds],
  );

  return {
    ...settings,
    state,
    game,
    humanSeat,
    actions,
    claimOptions,
    awaitingClaim,
    readyDiscards,
    dealing,
    paused,
    setPaused,
    discard,
    declareKong,
    declareWin,
    claim,
    pass,
    nextHand,
    newGame,
    minFaan: state?.config.minFaan ?? DEFAULT_RULES.minFaan,
    setMinFaan,
    rounds: state ? roundsInGame(state.config) : DEFAULT_RULES.rounds,
    setRounds,
  };
}
