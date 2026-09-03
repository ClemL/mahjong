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
  awaitingHumanClaim,
  needsTurnAdvance,
  resolveWithAi,
  stepTable,
} from "@/game/controller";
import { type Rng, createRng } from "@/game/rng";
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
}

export function useMahjong(humanSeat: Seat = 0): MahjongApi {
  const [state, setState] = useState<GameState | null>(null);
  const [speed, setSpeed] = useState<Speed>("normal");
  const [paused, setPaused] = useState(false);
  const [showHints, setShowHints] = useState(true);
  const rngRef = useRef<Rng>(createRng(1));

  const start = useCallback(() => {
    const seed = Math.floor(Math.random() * 0xffffffff);
    rngRef.current = createRng(seed ^ 0x5bf03635);
    setState(createGame({ seed, humanSeat }));
  }, [humanSeat]);

  // Deal on the client so the server render stays deterministic.
  useEffect(() => {
    start();
  }, [start]);

  const awaitingClaim = state ? awaitingHumanClaim(state) : false;

  // Drive the table forward whenever it is not the player's move.
  useEffect(() => {
    if (!state || paused) return;
    if (state.phase === "handOver" || state.phase === "gameOver") return;
    if (awaitingHumanClaim(state)) return;
    const humanToAct =
      state.phase === "action" && state.players[state.turn].isHuman && !needsTurnAdvance(state);
    if (humanToAct) return;

    const timer = setTimeout(() => {
      setState((current) => (current === state ? stepTable(state, rngRef.current) : current));
    }, DELAYS[speed]);
    return () => clearTimeout(timer);
  }, [state, paused, speed]);

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
          ? resolveWithAi(current, rngRef.current, { seat: humanSeat, optionId })
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
  };
}
