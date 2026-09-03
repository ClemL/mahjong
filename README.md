# Hong Kong Mahjong

A playable Hong Kong old-style mahjong table for the browser. You sit East; the
other three seats are played by the computer. Built as a Next.js app that
deploys to Vercel as a fully static site — the whole game runs client-side, with
no backend, database or API keys.

![Status](https://img.shields.io/badge/tests-86%20passing-brightgreen)

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
- Classic Hong Kong payout table: 10 faan limit (滿糊 = 128 points), doubling
  1 · 2 · 4 · 8 · 16 · 24 · 32 · 48 · 64 · 96 · 128.
- **The faan minimum is a table setting** — 0, 1, 3 (the Hong Kong standard) or
  5 — changeable mid-hand from the top bar. It defaults to **0**, so a chicken
  hand (雞糊) can be declared for a single point.
- Self-draw: all three opponents pay. Win on a discard: the discarder alone
  pays (出銃全包).

The exact ruleset is listed in the app under **House rules** and **Faan table**,
and lives in [`src/game/rules.ts`](src/game/rules.ts). Hong Kong scoring is a
house-rules affair, so every number is in one file and is easy to change.

## The computer opponents

Two strategies, switchable from the **Play** panel.

**Skilled (default).** Counts *shanten* — how many tile changes a hand is from
completion — and discards whatever leaves the hand closest to ready, breaking
ties on how many useful tiles are still unseen, then on letting go of terminals
and honors first. It claims a discard only when the meld genuinely brings the
hand closer, takes a concealed kong only when it costs the hand nothing, and
always declares a win it is entitled to. It does **not** read the discards for
danger or steer toward scoring patterns — a competent beginner, not a strong
player.

**Random.** Draws and discards uniformly at random, claiming at random too.
Kept because it is the honest baseline, and because it makes the difference
visible.

Over 120 simulated all-AI hands per cell:

| Opponents | Table minimum | Hands won | Washed out | Avg. faan |
| --- | --- | --- | --- | --- |
| Random | 0 faan | 2.5% | 97.5% | 1.67 |
| Random | 3 faan | 0.8% | 99.2% | 3.00 |
| **Skilled** | **0 faan** | **100%** | **0%** | 1.48 |
| **Skilled** | **3 faan** | **65%** | **35%** | 3.17 |

At the default 0-faan minimum every hand now finishes. At the Hong Kong
standard of 3 faan a third still wash out, which is roughly what a table of
beginners produces. Average faan falls with skilled play because the opponents
go out quickly with cheap hands rather than sitting on the wall.

The shanten calculator decomposes each suit independently and caches per suit,
since a candidate discard changes only one of the four groups. That took a
greedy turn from 13.2 ms to 2.2 ms.

Adding another strategy is a single file: implement `AiStrategy` in
[`src/game/ai.ts`](src/game/ai.ts) and register it in `STRATEGIES`.

```ts
export interface AiStrategy {
  name: string;
  chooseTurnAction(state: GameState, seat: Seat, rng: Rng): AiTurnDecision;
  chooseClaim(state: GameState, seat: Seat, options: ClaimOption[], rng: Rng): ClaimOption | null;
}
```

## Claim prompts

Being asked about every claimable discard is the main source of friction in a
mahjong UI. **Ask me about claims** has three settings:

- **Useful only** (default) — interrupts when a claim would actually reduce
  your shanten, using the same judgment the skilled opponent applies to its own
  hand. About 35% fewer interruptions than asking every time.
- **Every claim** — the traditional behavior.
- **Wins only** — never interrupts except to declare a win.

A win is always offered, whatever the setting.

## Running it

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # 86 unit tests
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

### Appearance

A **Table & tiles** panel in the sidebar carries three independent settings,
remembered in `localStorage` between visits:

- **Table** — Jade, Slate, Mahogany, Midnight, or Parchment (a light table).
- **Tile faces** — drawn pips, or the Chinese numeral over the suit mark.
- **Suit colors** — Vivid (furthest apart), Classic (traditional ink, blue and
  green), or Monochrome (one ink; the pips carry the suit).

Each setting is a `data-` attribute on the document element consumed entirely by
CSS, so switching costs no React re-render, and a small inline script restores
the choice before first paint rather than flashing the default theme. Both tile
faces are always in the DOM with one hidden, which is why the switch is instant.

Light and dark tables get chart palettes **selected for their own surface**
rather than one flipped from the other, each validated against the surface it
actually sits on.

### Changelog

A footer strip carries the build version and the most recent changelog entry;
clicking it opens the full changelog, newest first. Entries live in
[`public/updates.txt`](public/updates.txt), one per line, oldest first — add a
line there whenever you ship a user-visible change.

## Project layout

```
src/game/          Rules engine — no React, no DOM
  tiles.ts         Tile codes, the 144-tile set, display glyphs
  melds.ts         Meld shapes and chow partners
  winning.ts       Hand decomposition, special hands, waits
  scoring.ts       Faan patterns, exclusions, payout
  rules.ts         House ruleset — every tunable number
  engine.ts        The state machine: deal, draw, discard, claims, settlement
  shanten.ts       Distance-to-ready, hand acceptance, visible-tile counting
  ai.ts            AiStrategy interface + the random and skilled opponents
  controller.ts    Steps the table one beat at a time
  rng.ts           Seeded PRNG (mulberry32) for reproducible games
src/hooks/         React binding for the engine
src/game/sound.ts  Web Audio cues, synthesised at runtime
src/components/    Tiles, pip artwork, seats, pond, hand, result modal, chart
src/app/           Next.js App Router entry and styles
public/updates.txt Changelog, oldest first
```

The engine is a pure state machine: every mutator takes a `GameState` and
returns a new one. That is what lets the test suite fuzz 150 complete hands
without a browser, asserting on every one that all 144 tiles are still
accounted for, that hand sizes match the melds exposed, that every chow is a
real run and every pung is three of a kind, and that the scores stay zero-sum.

## Playing

- Click a tile in your hand to discard it.
- **Hover any tile to zoom it** — in your hand, in the pond, or in an
  opponent's meld — so a 22px discard is still readable.
- When an opponent discards something you can use, Chow / Pung / Kong / Win
  buttons appear with a preview of the meld they would form. **Pass** declines.
- A green dot on a tile means discarding it leaves you ready (聽牌). Toggle this
  with **Hints**.
- **Min faan** sets the table minimum and applies immediately, mid-hand.
- **Sound** mutes or unmutes the table cues.
- **Speed** cycles the pace of the computer players; **Pause** stops the table.
- A game runs one East round — four dealerships. The dealer keeps the deal
  after winning (連莊); a loss or a washout passes it on.

### Table and tiles

Dots (筒) and Bamboo (索) are drawn as **real pip artwork** — inline SVG in the
traditional arrangements, including the slanted three across the top of the
seven of Dots. Characters (萬) keep the numeral-over-萬 face and honors keep
their glyphs, because that is already how those tiles look. Traditional sets
color individual pips (a red five, a green one bamboo); we draw every pip in
its suit color instead, since the suits have to stay apart at a glance and a
red pip would read as a Red Dragon.

Suits are set far apart in both hue and lightness — blue Characters,
burnt-orange Dots, green Bamboo, purple bonus tiles — with a matching wash
across the tile face, which also keeps them separable for red-green color
vision deficiency.

Discards stack **six to a row** in front of each seat, the way a pond is laid
out at a real table, rather than in one long wrapping line.

Tiles are animated so the table is readable at a glance: a discard flies in
from the direction of the player who threw it, a tile retrieved from the pond
pops into the meld that claimed it, and the tile you just drew slides into your
hand. All motion respects `prefers-reduced-motion`.

### Sound

Tile clacks and the claim, kong, win and washout cues are **synthesised at
runtime with the Web Audio API** — a filtered noise burst for the clack, short
triangle blips for the pitched cues. Nothing is loaded as an audio file, so the
deployment stays a single static bundle with no media to fetch. Cues are derived
by diffing consecutive game states, which keeps the engine free of presentation
concerns. Audio is created lazily on your first action, since browsers refuse to
start it before a gesture, and every call is wrapped so a failed cue can never
interrupt play. Toggle it with **Sound**.

### Score history

Every settled hand is recorded — winner, faan, value, per-seat payments and the
cumulative scores after it. The **Score history** panel lists them as they
happen, and the end-of-round summary shows final standings, a cumulative-score
line chart, and the full hand-by-hand table.

The chart's four series use categorical slots 1–4 of a reference palette,
validated against the panel's dark-green surface: worst adjacent CVD ΔE 8.4,
normal-vision ΔE 19.8, all four above 3:1 contrast. Identity is never carried by
color alone — every series is direct-labeled, listed in the legend, and repeated
in the table.

## Known limitations

- One East round only; no South/West/North rounds.
- No sacred-discard (furiten) rule — Hong Kong does not use one, but some houses
  do bar winning on a tile you have discarded.
- Seven Pairs (七對子) is deliberately not scored: it is not part of the Hong
  Kong old-style set.
- Multiple simultaneous winners settle to the seat nearest the discarder rather
  than paying out to all of them.
- You always sit East. The engine supports any `humanSeat`; only the UI hard-codes it.
