# Hong Kong Mahjong

A playable Hong Kong old-style mahjong table for the browser. You sit East; the
other three seats are played by the computer. Built as a Next.js app that
deploys to Vercel as a fully static site — the whole game runs client-side, with
no backend, database or API keys.

![Status](https://img.shields.io/badge/tests-58%20passing-brightgreen)

## What is implemented

**Tiles and the deal**

- The full 144-tile set: Characters (萬), Dots (筒) and Bamboo (索) 1–9 in four
  copies, four Winds and three Dragons in four copies, and eight bonus tiles
  (four Flowers, four Seasons).
- 13 tiles per player, 14 to the dealer. Bonus tiles are revealed on sight and
  replaced from the back of the wall, recursively.

**Play**

- Turn order East → South → West → North.
- Chow (上), Pung (碰), exposed Kong (明槓), concealed Kong (暗槓) and added
  Kong (加槓), each with the correct replacement draw.
- Claim priority Win > Kong > Pung > Chow; a chow is only offered to the player
  to the discarder's right; ties between winners go to the seat nearest the
  discarder.
- Robbing the kong (搶槓) — an added kong is exposed to a claim before it
  completes.
- Washed-out wall (流局).

**Scoring**

- Four sets and a pair, plus Thirteen Orphans (十三么) and Nine Gates (九蓮寶燈).
- Every valid reading of a hand is enumerated and the highest-scoring one is
  used, so 111 222 333 is read as triplets or sequences — whichever pays more.
- Faan patterns with correct exclusions (Big Three Dragons suppresses the
  individual dragon triplets, Full Flush suppresses Half Flush, and so on).
- Classic Hong Kong payout table: 3 faan minimum to win, 10 faan limit
  (滿糊 = 128 points), doubling 1 · 2 · 4 · 8 · 16 · 24 · 32 · 48 · 64 · 96 · 128.
- Self-draw: all three opponents pay. Win on a discard: the discarder alone
  pays (出銃全包).

The exact ruleset is listed in the app under **House rules** and **Faan table**,
and lives in [`src/game/rules.ts`](src/game/rules.ts). Hong Kong scoring is a
house-rules affair, so every number is in one file and is easy to change.

## The computer opponents

Iteration 1, as specified: **the AI plays randomly.** It draws, and unless it
can declare a legal win it discards a uniformly random tile. On a discard it
picks uniformly from `{pass, ...legal claims}`, except that a winning claim is
always taken. Kongs on its own turn are taken half the time.

One consequence worth knowing before you play: random discarding almost never
assembles a 3-faan hand. Over 400 simulated all-AI hands:

| Metric | Value |
| --- | --- |
| Hands won | 2.5% |
| Washed out (流局) | 97.5% |
| Average faan when a hand is won | 4.2 |
| Melds claimed per hand (all four seats) | 7.2 |

You will win far more often than the machines do, and most AI-vs-AI hands will
run the wall out. That is the expected behaviour of a random agent, not a bug —
but it is the first thing a smarter strategy should fix.

Adding one is a single file: implement the `AiStrategy` interface in
[`src/game/ai.ts`](src/game/ai.ts) and register it in `STRATEGIES`.

```ts
export interface AiStrategy {
  name: string;
  chooseTurnAction(state: GameState, seat: Seat, rng: Rng): AiTurnDecision;
  chooseClaim(state: GameState, seat: Seat, options: ClaimOption[], rng: Rng): ClaimOption | null;
}
```

Useful primitives already exist for a greedy or shanten-based opponent:
`waitingTiles()` and `analyzeShape()` in `src/game/winning.ts`, and
`scoreHand()` in `src/game/scoring.ts`.

## Running it

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # 58 unit tests
npm run typecheck  # tsc --noEmit
npm run build      # production build
```

## Deploying to Vercel

The project is a stock Next.js app — Vercel detects it with no configuration.
There are no environment variables and no server-side state.

**From the dashboard:** import the Git repository at
[vercel.com/new](https://vercel.com/new). Framework preset *Next.js*, build
command `npm run build`, output directory `.next`. All defaults.

**From the CLI:**

```bash
npm i -g vercel
vercel          # preview deployment
vercel --prod   # production
```

Both routes produce a fully static export (`○ (Static) prerendered as static
content`), so the game is served from the CDN edge.

## Project layout

```
src/game/          Rules engine — no React, no DOM
  tiles.ts         Tile codes, the 144-tile set, display glyphs
  melds.ts         Meld shapes and chow partners
  winning.ts       Hand decomposition, special hands, waits
  scoring.ts       Faan patterns, exclusions, payout
  rules.ts         House ruleset — every tunable number
  engine.ts        The state machine: deal, draw, discard, claims, settlement
  ai.ts            AiStrategy interface + the random opponent
  controller.ts    Steps the table one beat at a time
  rng.ts           Seeded PRNG (mulberry32) for reproducible games
src/hooks/         React binding for the engine
src/components/    Tiles, seats, pond, hand, result modal, side panels
src/app/           Next.js App Router entry and styles
```

The engine is a pure state machine: every mutator takes a `GameState` and
returns a new one. That is what lets the test suite fuzz 150 complete hands
without a browser, asserting on every one that all 144 tiles are still
accounted for, that hand sizes match the melds exposed, that every chow is a
real run and every pung is three of a kind, and that the scores stay zero-sum.

## Playing

- Click a tile in your hand to discard it.
- When an opponent discards something you can use, Chow / Pung / Kong / Win
  buttons appear with a preview of the meld they would form. **Pass** declines.
- A green dot on a tile means discarding it leaves you ready (聽牌). Toggle this
  with **Hints**.
- **Speed** cycles the pace of the computer players; **Pause** stops the table.
- A game runs one East round — four dealerships. The dealer keeps the deal
  after winning (連莊); a loss or a washout passes it on.

## Known limitations

- One East round only; no South/West/North rounds.
- No sacred-discard (furiten) rule — Hong Kong does not use one, but some houses
  do bar winning on a tile you have discarded.
- Seven Pairs (七對子) is deliberately not scored: it is not part of the Hong
  Kong old-style set.
- Multiple simultaneous winners settle to the seat nearest the discarder rather
  than paying out to all of them.
- You always sit East. The engine supports any `humanSeat`; only the UI hard-codes it.
