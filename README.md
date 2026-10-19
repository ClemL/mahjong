# Hong Kong Mahjong

A playable Hong Kong old-style mahjong table for the browser. Play solo against
three computer opponents, or around a shared tablet with friends on their
phones. Built with Next.js and deployed to Vercel: the solo game runs entirely
client-side and is served as static pages; multiplayer adds a few API routes
backed by Upstash Redis.

![CI](https://github.com/ClemL/mahjong/actions/workflows/ci.yml/badge.svg)

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
- Heavenly Hand (天糊: the dealer wins on the tiles dealt) and Earthly Hand
  (地糊: a win on the dealer's first discard, or a self-draw on your first draw,
  before anyone has claimed) score the limit.
- Every valid reading of a hand is enumerated and the highest-scoring one is
  used, so 111 222 333 is read as triplets or sequences — whichever pays more.
- Faan patterns with correct exclusions (Big Three Dragons suppresses the
  individual dragon triplets, Full Flush suppresses Half Flush, and so on).
- Classic Hong Kong payout table: 10 faan limit (滿糊 = 128 points), doubling
  1 · 2 · 4 · 8 · 16 · 24 · 32 · 48 · 64 · 96 · 128.
- **The faan minimum is a table setting** — 0, 1, 3 (the Hong Kong standard) or
  5 — changeable mid-hand. It defaults to **3**; at 0 a chicken hand (雞糊) can
  be declared for a single point.
- Self-draw: all three opponents pay. Win on a discard: the discarder pays the
  hand's value and the other two pay half of it each, rounded up. A
  multiplayer table can switch that off so the discarder alone pays (出銃全包).
- Liability (包): whoever discards the tile that gives a player their third
  dragon set, or their fourth set of any kind (十二張落地), pays that player's
  whole self-drawn win alone. House rules vary, so a multiplayer table can
  switch it off.

The exact ruleset is listed in the app under **House rules** and **Faan table**,
and lives in [`src/game/rules.ts`](src/game/rules.ts). Hong Kong scoring is a
house-rules affair, so every number is in one file and is easy to change.

## The computer opponents

Two strategies, switchable from the **Play** panel.

**Skilled (default).** Counts *shanten* — how many tile changes a hand is from
completion — and discards whatever leaves the hand closest to ready, breaking
ties on how many useful tiles are still unseen, then on letting go of terminals
and honors first. It plays for the faan minimum: each candidate discard or claim
is judged against routes to a hand worth enough to win (a flush, all triplets,
staying concealed, honor sets already held — see
[`src/game/plan.ts`](src/game/plan.ts)), so it keeps a hand concealed or chases
a flush rather than finishing a hand it could not declare. It always declares a
win it is entitled to. It does **not** read the discards for danger — a
competent beginner, not a strong player.

**Random.** Draws and discards uniformly at random, claiming at random too.
Kept because it is the honest baseline, and because it makes the difference
visible.

Over 300 simulated all-AI hands per row (October 2026):

| Opponents | Table minimum | Hands won | Washed out | Avg. faan |
| --- | --- | --- | --- | --- |
| Random | 0 faan | 3.0% | 97.0% | 2.33 |
| Random | 3 faan | 1.0% | 99.0% | 4.33 |
| Random | 5 faan | 0.3% | 99.7% | 6.00 |
| **Skilled** | **0 faan** | **100%** | **0%** | 1.58 |
| **Skilled** | **3 faan** | **82.7%** | **17.3%** | 3.40 |
| **Skilled** | **5 faan** | **22.0%** | **78.0%** | 5.59 |

At the default 3-faan minimum about one hand in six washes out. At 5 faan most
do: the route planner does not yet aim high enough, so 5 is better played
against people than against the computer.

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

## Playing together

Single player needs nothing. Multiplayer adds a small server: **three fixed
tables** (Table 1, 2 and 3), a tablet acting as the table, and everyone else on
their phone.

1. Everyone opens the same table — chosen on the start page, opened the first
   time somebody arrives, so there are no room codes to pass around. The tablet
   puts that address on screen as a QR code for anyone who would rather scan it.
2. The tablet takes the **Table** seat.
3. Everyone else taps the seat they want and sits down. A name is already in the
   box, so sitting down is one tap.
4. **Nothing is dealt until somebody deals**, so four people arriving one at a
   time all start the same hand. Waiting alone, you can play the computer in the
   meantime; the table offers to deal everyone in the moment a friend sits down.
5. **Seats nobody takes are played by the computer**, so three friends and one
   empty chair still works.

There is no password: anyone who can reach the URL can take a seat. That suits a
group who already share the link and not much else — the rate limiter is what
stops seat-grabbing, not authentication. `REQUIRE_PASSWORD` in
[`src/server/rooms.ts`](src/server/rooms.ts) turns the shared password back on
in one line.

### What each screen shows

**The table** (a tablet in the middle) carries everything shared. Each player's
discards sit **in front of them**, on the edge of their own block facing the
middle — where the tiles would land at a real table — rather than stacked in one
central pile. The middle keeps only the round, the wall count and whose turn it
is. Alongside the pond each seat shows its score, melds, flowers, how many tiles
it holds, and whether it is still deciding on a claim. It also prints the
seating — *Seat 1 East · bottom edge · Kris* — so people know where to sit. It
never receives anyone's concealed tiles.

It also drives the game: next hand, redeal, restart and reset scores, change the
faan minimum, free a seat, and skip a player who is not answering a claim.

### On the devices themselves

- **The table keeps the screen awake.** A tablet acting as the table would
  otherwise sleep mid-hand. The lock is re-taken whenever the page becomes
  visible again, since browsers drop it on hide, and the table says so when the
  browser cannot hold one (Safari only gained it in 16.4).
- **Discarding takes two taps on touch.** The first arms the tile and offers
  *Discard* / *Keep*; the second throws it. With a mouse a click still discards
  directly — a mis-click is cheap, a stray touch on a phone you are holding is
  not.
- **Touch targets meet the platform minimum.** Buttons were 31px tall against
  Apple's 44px and Material's 48px, with Pass sitting beside Win under a claim
  timer. Everything interactive is at least 44px on a coarse pointer.
- **The layout respects safe areas.** The viewport covers the display and the
  layout keeps its own controls clear of the notch and the home indicator —
  the action row with Pass and Win previously sat under it.
- **Installable.** A web app manifest with maskable icons, so the tablet can run
  standalone: no browser chrome to tap by accident, no back gesture mid-hand.

**A phone** shows only that player's own hand and the decisions that are theirs
— discard, chow/pung/kong/win, pass — because the tablet is already showing
everything else. With no table device in the room, phones fall back to the full
view so the pond is visible somewhere.

### How it works

- **Room store.** Rooms live in Upstash Redis, written with a compare-and-set on
  the room version so two people acting at the same instant cannot clobber each
  other. Without Upstash credentials the store falls back to process memory,
  which runs and tests the whole flow locally but is not safe in production —
  the lobby says so.
- **Seat tokens.** Claiming a seat returns an opaque
  token, kept in `localStorage`. Every action carries it in the request body and
  every poll in an `Authorization` header — never the URL, which ends up in
  logs — and the server maps token → seat. Nobody can play a seat that is not
  theirs.
- **Version polling.** Clients poll the room version about once a second; when
  nothing has changed the server replies with a bare marker instead of the
  table, so the idle cost to the client is a few dozen bytes a second. No
  sockets, which keeps the whole thing on Vercel's serverless runtime.
- **Rooms are stored deflated.** Each poll still reads the room from Redis, and
  a room reaches 28 KB of JSON late in a game. Stored deflated (with the version
  kept readable in front for the compare-and-set script) it is about 5 KB: over
  a simulated four-player game with a tablet, Redis bandwidth fell from 335 MB
  to 61 MB an hour. Commands stay at one per poll, about 14,400 an hour per busy
  table, which is now the first free-tier limit a table meets.
- **Redaction happens on the server.** A player's view carries their own tiles
  and opaque stand-ins for everyone else's; the table's view carries no
  concealed tiles at all; the wall is never serialized to anyone. This is
  covered by tests that assert on the wire format rather than the UI.
- **Claims are windowed.** A discard opens a 20-second window. Computer seats
  answer at once, people get the window, and an unanswered seat is treated as a
  pass — so one person putting their phone down does not stall the table. The
  table can skip the wait early.
- **Presence.** Every poll doubles as a heartbeat, written only once it has gone
  stale so polling once a second does not become a write once a second — and it
  never bumps the room version, or one person's poll would look like a table
  change to everyone else. After five minutes of silence a seat is marked *away*
  on the table and the computer plays it; the seat is kept, so acting or even
  just reopening the page takes it straight back. A phone that slept through the
  threshold asks to be tapped back in rather than quietly catching up.
- **Rate limiting.** Seat claims are throttled per IP through Upstash, shared
  across serverless instances: 20 claim attempts per 10 minutes, and 120 actions
  a minute. The table is open to anyone holding the link, so that limit is what
  stands between a passer-by and all four chairs.
- **Pacing.** Around a shared table nobody is watching the exact instant a tile
  is thrown, and a poll can deliver the move up to a second after it happened,
  so multiplayer runs its animations about 2.5× slower than single player and
  keeps a ring on the newest discard. All of it still respects
  `prefers-reduced-motion`.
- **Sound.** The tablet and the phones derive cues by diffing consecutive polled
  views, the same way single player diffs engine states — a clack on a discard,
  a distinct cue for a claim or kong, a run of notes on a win. Each device has
  its own mute toggle, remembered between visits.

### Configuration

```bash
UPSTASH_REDIS_REST_URL=...    # required in production
UPSTASH_REDIS_REST_TOKEN=...
```

Multiplayer needs no password variable while `REQUIRE_PASSWORD` is false.

See [`.env.example`](.env.example). The start page at `/` and the solo game at
`/solo` stay fully static and need none of this.

## Running it

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # engine, room, server and component tests, plus the fuzz run
npm run typecheck  # tsc --noEmit
npm run build      # production build
npm run test:e2e   # Playwright smoke tests against that build
```

CI (`.github/workflows/ci.yml`) runs all four on every pull request.

## Deploying to Vercel

The project is a stock Next.js app — Vercel detects it with no configuration.
Solo play needs no environment variables; multiplayer needs the two Upstash
variables above, or rooms live in one serverless instance's memory and appear
to reset at random.

**From the dashboard:** import the Git repository at
[vercel.com/new](https://vercel.com/new). Framework preset *Next.js*, build
command `npm run build`, output directory `.next`. All defaults.

**From the CLI:**

```bash
npm i -g vercel
vercel          # preview deployment
vercel --prod   # production
```

`/` and `/solo` are prerendered as static content (`○ (Static)`), so the solo
game is served from the CDN edge; the room pages and `/api/rooms/*` are
server-rendered on demand.

### Appearance

A **Table & tiles** panel in the sidebar carries three independent settings,
remembered in `localStorage` between visits:

- **Table** — Jade, Slate, Mahogany, Midnight, or Parchment (a light table).
- **Tile faces** — Hong Kong (the default: painted dots and bamboo as on a
  Hong Kong set), Pips, Indexed, Numerals or Western.
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
  plan.ts          Routes to a hand worth the faan minimum, for the opponents
  ai.ts            AiStrategy interface + the random and skilled opponents
  controller.ts    Steps the table one beat at a time
  sets.ts, waits.ts, helper.ts   Hints: finished sets, waits, sets started
  replay.ts        A finished hand as compact frames, for the replay
  room.ts          Multiplayer room model: seating, draining, redaction
  presence.ts      Away and heartbeat timings
  tables.ts        The three fixed tables
  sound.ts         Web Audio cues, synthesised at runtime
  rng.ts           Seeded PRNG (mulberry32) for reproducible games
src/server/        Room store (Upstash + memory, deflated) and the room service
src/app/api/       Room, claim, action, control and reset endpoints
src/hooks/         React bindings for the engine and for a room; the solo save
src/film/          The explainer film — hand-drawn canvas animation
src/components/    Tiles, pip artwork, seats, pond, hand, modals, chart, replay
src/app/           Next.js App Router entry and styles
e2e/               Playwright smoke tests against the production build
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
- **Game length** runs the East round alone, East and South, or all four winds
  (the default) — four dealerships each. The dealer keeps the deal after
  winning (連莊); a loss or a washout passes it on.
- **The game is saved on this device** after every move. Reloading `/solo`, or
  coming back after the browser discarded the tab, picks it up where it was;
  the start page offers **Resume solo game** or **New solo game**.
- **Replay hand**, on the result of a finished hand, steps through it one
  logged move at a time with every hand face up, and says what you were
  waiting on whenever your hand was ready.

### Table and tiles

A tile is a bone face set into a rounded body: the shell carries the edge and
the drop shadow, an inset ring is the bevel catching the light from above, and
a radial sheen sits over the top-left. Glyphs are given a light lip below the
stroke and shade above, so they read as carved rather than printed. Tile backs
get the same treatment with a moulded recessed panel.

Dots (筒) and Bamboo (索) are drawn as **original SVG artwork**, sized on a
0–100 square and stroked in `currentColor` so they stay crisp from the 22px
pond to the zoomed hand and recolor with the chosen palette:

- **Dots** are concentric rings around a solid centre, the way the pips are
  carved. The one of Dots takes an extra ring.
- **Bamboo** canes are stalks broken by node gaps, narrow enough that each
  segment stays taller than it is wide — split any further and they read as a
  stack of beads.
- **One Bamboo is a bird**, as on every traditional set, drawn as a perched
  sparrow with a fanned tail. A faithful peacock would be mud at 22px.

Nothing is filled with the tile's face color: rings are strokes and canes are
separate segments, so the suit's faint wash shows through the gaps rather than
being covered by a near-match.

Characters (萬) and honors keep their glyph faces, which is already how those
tiles look. Traditional sets color individual pips (a red five, a green one
bamboo); we draw every pip in its suit color instead, since the suits have to
stay apart at a glance and a red pip would read as a Red Dragon.

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

- A hand resumed after a reload can only be replayed from where it was picked
  up; the moves before the reload are not saved.
- Replay is solo only. A multiplayer server would have to keep each hand's
  moves and release them after the hand, which it does not yet.
- No sacred-discard (furiten) rule — Hong Kong does not use one, but some houses
  do bar winning on a tile you have discarded.
- Seven Pairs (七對子) is deliberately not scored: it is not part of the Hong
  Kong old-style set.
- Multiple simultaneous winners settle to the seat nearest the discarder rather
  than paying out to all of them.
- You always sit East. The engine supports any `humanSeat`; only the UI hard-codes it.
