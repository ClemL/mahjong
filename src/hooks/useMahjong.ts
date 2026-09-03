"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type ClaimOption,
  type GameState,
  type KongOption,
  type TurnActions,
  createGame,
  declareAddedKong,
  declareConcealedKong,
  declareSelfDraw,
  discard as discardTile,
  nextHand as nextHandOf,
  setMinFaan as setMinFaanOf,
  turnActions,
  waitsAfterDiscard,
} from "@/game/engine";
import {
  type ClaimPrompt,
  awaitingHumanClaim,
  needsTurnAdvance,
  resolveWithAi,
  shouldPromptClaim,
  stepTable,
} from "@/game/controller";
import { STRATEGIES, type StrategyName } from "@/game/ai";
import { type Rng, createRng } from "@/game/rng";
import { type SoundName, playSound, primeAudio } from "@/game/sound";
import type { Seat } from "@/game/tiles";
import { isFlower } from "@/game/tiles";
import { DEFAULT_RULES } from "@/game/rules";

export type Speed = "slow" | "normal" | "fast";

const DELAYS: Record<Speed, number> = { slow: 1200, normal: 650, fast: 260 };

const IDLE_ACTIONS: TurnActions = {
  canDiscard: false,
  kongs: [],
  canWin: false,
  winScore: null,
  waits: [],
};

export interface MahjongApi {
  state: GameState | null;
  humanSeat: Seat;
  /** What the player may do on their own turn. */
  actions: TurnActions;
  /** Claim options offered to the player on the current discard. */
  claimOptions: ClaimOption[];
  awaitingClaim: boolean;
  /** Ids of hand tiles whose discard would leave the hand ready (聽牌). */
  readyDiscards: Set<string>;
  showHints: boolean;
  setShowHints: (value: boolean) => void;
  speed: Speed;
  setSpeed: (value: Speed) => void;
  paused: boolean;
  setPaused: (value: boolean) => void;
  discard: (tileId: string) => void;
  declareKong: (option: KongOption) => void;
  declareWin: () => void;
  claim: (optionId: string) => void;
  pass: () => void;
  nextHand: () => void;
  newGame: () => void;
  /** Table faan minimum, and a setter that applies mid-hand. */
  minFaan: number;
  setMinFaan: (value: number) => void;
  muted: boolean;
  setMuted: (value: boolean) => void;
  /** Which opponent strategy is playing the other three seats. */
  opponents: StrategyName;
  setOpponents: (value: StrategyName) => void;
  /** How often the table stops to ask about a claim. */
  claimPrompt: ClaimPrompt;
  setClaimPrompt: (value: ClaimPrompt) => void;
}

export function useMahjong(humanSeat: Seat = 0): MahjongApi {
  const [state, setState] = useState<GameState | null>(null);
  const [speed, setSpeed] = useState<Speed>("normal");
  const [paused, setPaused] = useState(false);
  const [showHints, setShowHints] = useState(true);
  const [muted, setMutedState] = useState(false);
  const [opponents, setOpponents] = useState<StrategyName>("greedy");
  const [claimPrompt, setClaimPrompt] = useState<ClaimPrompt>("useful");
  const rngRef = useRef<Rng>(createRng(1));
  const mutedRef = useRef(muted);
  mutedRef.current = muted;

  const start = useCallback(() => {
    const seed = Math.floor(Math.random() * 0xffffffff);
    rngRef.current = createRng(seed ^ 0x5bf03635);
    setState(createGame({ seed, humanSeat }));
  }, [humanSeat]);

  // Deal on the client so the server render stays deterministic.
  useEffect(() => {
    start();
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

  const setMuted = useCallback((value: boolean) => {
    setMutedState(value);
    if (!value) primeAudio();
  }, []);

  const strategy = STRATEGIES[opponents];

  // A claim the player would never take is passed automatically, so the table
  // only stops for decisions that are actually decisions.
  const pendingClaim = state ? awaitingHumanClaim(state) : false;
  const wantsPrompt = state && pendingClaim ? shouldPromptClaim(state, humanSeat, claimPrompt) : false;
  const awaitingClaim = pendingClaim && wantsPrompt;

  // Drive the table forward whenever it is not the player's move.
  useEffect(() => {
    if (!state || paused) return;
    if (state.phase === "handOver" || state.phase === "gameOver") return;
    if (awaitingHumanClaim(state) && shouldPromptClaim(state, humanSeat, claimPrompt)) return;
    const humanToAct =
      state.phase === "action" && state.players[state.turn].isHuman && !needsTurnAdvance(state);
    if (humanToAct) return;

    const timer = setTimeout(() => {
      setState((current) => {
        if (current !== state) return current;
        // An auto-passed claim still resolves through the normal path, so the
        // other seats' claims on the same discard are honoured.
        if (awaitingHumanClaim(state)) {
          return resolveWithAi(state, rngRef.current, { seat: humanSeat, optionId: null }, strategy);
        }
        return stepTable(state, rngRef.current, strategy);
      });
    }, DELAYS[speed]);
    return () => clearTimeout(timer);
  }, [state, paused, speed, humanSeat, claimPrompt, strategy]);

  const actions = useMemo<TurnActions>(
    () => (state ? turnActions(state, humanSeat) : IDLE_ACTIONS),
    [state, humanSeat],
  );

  const claimOptions = useMemo<ClaimOption[]>(
    () => (state?.pendingClaims.find((c) => c.seat === humanSeat)?.options ?? []),
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
          ? resolveWithAi(current, rngRef.current, { seat: humanSeat, optionId }, strategy)
          : current,
      );
    },
    [humanSeat, strategy],
  );

  const claim = useCallback((optionId: string) => respond(optionId), [respond]);
  const pass = useCallback(() => respond(null), [respond]);

  const nextHand = useCallback(() => {
    setState((current) => (current ? nextHandOf(current) : current));
  }, []);

  const setMinFaan = useCallback((value: number) => {
    setState((current) => (current ? setMinFaanOf(current, value) : current));
  }, []);

  return {
    state,
    humanSeat,
    actions,
    claimOptions,
    awaitingClaim,
    readyDiscards,
    showHints,
    setShowHints,
    speed,
    setSpeed,
    paused,
    setPaused,
    discard,
    declareKong,
    declareWin,
    claim,
    pass,
    nextHand,
    newGame: start,
    minFaan: state?.config.minFaan ?? DEFAULT_RULES.minFaan,
    setMinFaan,
    muted,
    setMuted,
    opponents,
    setOpponents,
    claimPrompt,
    setClaimPrompt,
  };
}
