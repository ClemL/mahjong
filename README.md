# Hong Kong Mahjong

A playable Hong Kong old-style mahjong table for the browser, played around a
shared tablet with everyone on their phone, held sideways. A game always takes
at least two devices — the tablet as the table and one phone — and seats nobody
takes are played by the computer. Built with Next.js and deployed to Vercel; the
table runs on a few API routes backed by Upstash Redis.

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

Computer seats play at the table's **Difficulty**, set on the tablet with the
pace: Easy, Normal (the default) or Hard. A random player is kept as the
measured baseline.

**Normal.** Counts *shanten* — how many tile changes a hand is from
completion — and discards whatever leaves the hand closest to ready, breaking
ties on how many useful tiles are still unseen, then on letting go of terminals
and honors first. It plays for the faan minimum: each candidate discard or claim
is judged against routes to a hand worth enough to win (a flush, all triplets,
staying concealed, honor sets already held — see
[`src/game/plan.ts`](src/game/plan.ts)), so it keeps a hand concealed or chases
a flush rather than finishing a hand it could not declare. It always declares a
win it is entitled to.

**Easy.** Normal's hand, but one discard in five is a tile it should have
kept, and it claims any set that brings the hand closer without asking whether
the hand will still be worth declaring. It never misses a win.

**Hard.** Normal's hand, played for what it is worth as well as for speed:
every route still open is weighed by what it would pay, discounted for each
step still to take (more steeply as the wall empties), and the richest is
played for. Reading the discards for danger — throwing the safest tile once
another hand looks ready, folding a poor hand — was built and measured, and
left out: it cut this seat's deal-ins from 20% to 17%, but slowed it down
enough that the people at the table won *more* (33% of hands against three
such seats), not less.

How a person fares against each level, measured with one Normal seat standing
in for the person against three computer seats, over 1,000 hands per row at the
default 1-faan minimum (October 2026):

| Computer seats | Person wins | Person's points a hand | Washed out (four computers) |
| --- | --- | --- | --- |
| Easy | 42.4% | +2.92 | 2.5% |
| Normal | 27.0% | +0.01 | 0.0% |
| Hard | 26.2% | −0.13 | 0.0% |

Easy is a clear step down. Hard is only a small step up — at the 3-faan Hong
Kong standard too (21.4% against 22.1%, −0.15 points a hand against +0.45, over
800 hands) — because at this table's rules the quickest hand is usually the
richest one as well. A clearly stronger Hard needs a deeper search, which this
does not have yet.

Normal against the random baseline, over 300 simulated all-AI hands per row
(October 2026):

| Opponents | Table minimum | Hands won | Washed out | Avg. faan |
| --- | --- | --- | --- | --- |
| Random | 0 faan | 3.0% | 97.0% | 2.33 |
| Random | 3 faan | 1.0% | 99.0% | 4.33 |
| Random | 5 faan | 0.3% | 99.7% | 6.00 |
| **Normal** | **0 faan** | **100%** | **0%** | 1.58 |
| **Normal** | **3 faan** | **82.7%** | **17.3%** | 3.40 |
| **Normal** | **5 faan** | **22.0%** | **78.0%** | 5.59 |

At a 3-faan minimum about one hand in six washes out. At 5 faan most
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

## Playing together

The game runs on a small server: **three fixed tables** (Table 1, 2 and 3), a
tablet acting as the table, and everyone else on their phone. There is no game
on one device alone, and no upright layout: phones play sideways, and a phone
held upright turns its controller on its side.

1. Everyone opens the same table — chosen on the start page, opened the first
   time somebody arrives, so there are no room codes to pass around. The tablet
   puts that address on screen as a QR code for anyone who would rather scan it.
2. The tablet takes the **Table** seat.
3. Everyone else taps the seat they want and sits down. A name is already in the
   box, so sitting down is one tap.
4. **Nothing is dealt until the table deals**, so four people arriving one at a
   time all start the same hand. Only the tablet deals; phones on their own are
   told to open one. Waiting alone, you can play the computer in the meantime;
   the table offers to deal everyone in the moment a friend sits down.
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

It also drives the game: next hand, redeal, restart and reset scores, end the
game early (the hand being played goes unscored, and everyone goes to the final
scores), change the faan minimum, free a seat, and skip a player who is not
answering a claim.

### On the devices themselves

- **The table keeps the screen awake.** A tablet acting as the table would
  otherwise sleep mid-hand. The lock is re-taken whenever the page becomes
  visible again, since browsers drop it on hide, and the table says so when the
  browser cannot hold one (Safari only gained it in 16.4). Only the table does:
  a phone sleeps as it normally would.
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
  so the table runs its animations about 2.5× slower than a screen you watch up
  close, and keeps a ring on the newest discard. All of it still respects
  `prefers-reduced-motion`.
- **Sound.** The tablet and the phones derive cues by diffing consecutive polled
  views — a clack on a discard,
  a distinct cue for a claim or kong, a run of notes on a win. Each device has
  its own mute toggle, remembered between visits.

### Configuration

```bash
UPSTASH_REDIS_REST_URL=...    # required in production
UPSTASH_REDIS_REST_TOKEN=...
```

Multiplayer needs no password variable while `REQUIRE_PASSWORD` is false.

See [`.env.example`](.env.example). The start page at `/` stays fully static and
needs none of this.

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
The tables need the two Upstash variables above, or rooms live in one serverless
instance's memory and appear to reset at random.

**From the dashboard:** import the Git repository at
[vercel.com/new](https://vercel.com/new). Framework preset *Next.js*, build
command `npm run build`, output directory `.next`. All defaults.

**From the CLI:**

```bash
npm i -g vercel
vercel          # preview deployment
vercel --prod   # production
```

`/` is prerendered as static content (`○ (Static)`) and served from the CDN
edge; the room pages and `/api/rooms/*` are server-rendered on demand.

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
  ai.ts            AiStrategy interface + the random, easy, normal and hard opponents
  controller.ts    Steps the table one beat at a time
  sets.ts, waits.ts, helper.ts   Hints: finished sets, waits, sets started
  patternTiles.ts  The tiles behind each faan pattern, for the result
  summary.ts       A finished game's standings and facts
  room.ts          Multiplayer room model: seating, draining, redaction
  presence.ts      Away and heartbeat timings
  tables.ts        The three fixed tables
  sound.ts         Web Audio cues, synthesised at runtime
  rng.ts           Seeded PRNG (mulberry32) for reproducible games
src/server/        Room store (Upstash + memory, deflated) and the room service
src/app/api/       Room, claim, action, control and reset endpoints
src/hooks/         React bindings for a room and the phone's own settings
src/film/          The explainer film — hand-drawn canvas animation
src/components/    Tiles, pip artwork, the felt, the phone controller, settings, results
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

- On your phone, **tap a tile to arm it and tap again to throw it**, or flick it
  up off the hand. Drag a tile sideways to put it where you want it.
- When you can use a discard, Chow / Pung / Kong / Win buttons appear with the
  meld they would make; **Pass** declines. With two or more sets to choose
  between, **+20s** adds twenty seconds to the claim, once a discard.
- **Hide hand** turns your tiles face down for when the phone is put down; every
  hand arrives face down until you turn it up.
- **Set hints** (the line under tiles that already make a set), the **helper**
  and **hurry up** are the assists: each phone's own choice, off unless that
  phone turns them on — or on from the start for the players who get them.
- **Stretch to the edges**, under the phone's settings, runs the hand out to
  the edges of the screen and scales its tiles up to fill it; the fewer tiles
  in hand, the larger they get.
- **Hurry up** flashes the screen of whoever the table is waiting on. Nobody can
  be hurried in the first three seconds of their turn (or of their call on a
  discard); the button counts those seconds down. After a hurry-up, every button
  at the table rests for ten seconds.
- **Min faan**, **Game length**, **Flowers**, **Liability** and who pays on a
  discard win are the table's, set from the tablet: in the lobby, or in its
  settings at any point. Game length runs the East round alone, East and South,
  or all four winds (the default) — four dealerships each. The dealer keeps the
  deal after winning (連莊); a loss or a washout passes it on.
- **Difficulty** — Easy, Normal or Hard — is how well the computer plays the
  seats nobody has taken; the table sets it with the pace.
- **Sound** is each device's own.

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

### Hand results and the end of the game

At the end of a hand the tablet lays its result over the felt: who won and what
it paid them, the winning hand in its sets with the tile it went out on ringed,
the faan ledger, and who paid. The ledger shows the tiles behind each pattern
when there are four or fewer of them — a dragon or wind set, a flower, the
self-drawn tile; a pattern about the whole hand, such as a flush, shows none,
since the hand is already above it. **Who pays** draws each seat's payment as a
bar either side of one line, paid to the left and received to the right, with
the signed amount and each seat's chips after it.

Each phone shows its own result in the space above the hand: what the hand cost
or paid you and why ("You threw the winning tile, so you pay the full share"),
the winner's hand and faan, and the table's chips. **Hide** puts it aside;
**Result** brings it back.

Every settled hand is recorded — winner, faan, value, its biggest pattern,
per-seat payments and the cumulative scores after it. When the game ends the
tablet shows the final chips in order, four facts about the game (the biggest
hand, self-draws, who threw the most winning tiles, washouts) and everyone's
chips after each hand, as a line chart or, under **Hand by hand**, as a table.
**New game** goes back to the lobby with everyone still seated; each phone shows
its place.

The chart's four series use categorical slots 1–4 of a reference palette,
validated against each theme's chart surface: on the dark themes, worst adjacent
CVD ΔE 8.4, normal-vision ΔE 19.8, all four above 3:1 contrast. On Parchment
three slots fall below 3:1 against the light surface, so the values are always
readable another way. A colour follows the seat, not the standings. Identity is
never carried by color alone — every line is named at its end, keyed in the
final chips, and repeated in the table.

## Known limitations

- No sacred-discard (furiten) rule — Hong Kong does not use one, but some houses
  do bar winning on a tile you have discarded.
- Seven Pairs (七對子) is deliberately not scored: it is not part of the Hong
  Kong old-style set.
- Multiple simultaneous winners settle to the seat nearest the discarder rather
  than paying out to all of them.
- You always sit East. The engine supports any `humanSeat`; only the UI hard-codes it.
