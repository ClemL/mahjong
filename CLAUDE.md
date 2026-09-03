# CLAUDE.md

Guidance for Claude Code (and anyone else) working in this repository.

## Working agreements

These apply to every request in this repo.

* **Always start a new branch for each request.** Do not commit directly to `main`, and do not stack
  an unrelated request's changes onto a branch created for a previous one. Name the branch after the
  work being done (e.g. `claude/<short-description>`). If a request's PR has already been merged,
  restart from the latest `main` rather than adding commits on top of merged history.
* **Open a pull request when the work is done.** Once changes are committed and pushed, open a PR
  against `main` summarizing what changed and why, so it can be reviewed before merging.
* **Verify before opening the PR.** All three must pass:
  * `npm run typecheck`
  * `npm test` — the engine suite, including the fuzz run over full hands
  * `npm run build`
* **Add a line to `public/updates.txt` when you ship a user-visible change.** One entry per line,
  **oldest first** (append to the end), formatted `<ISO timestamp> - <what changed>`. The footer
  shows the last line; the changelog dialog shows them all, newest first. Engine refactors and test
  changes are not user-visible; a new rule, control, or visual change is.
* **Post the links at the end of every response** — the Vercel app, the Vercel pipeline and the git
  repo — so they can be opened quickly:
  * App: https://clem-mahjong.vercel.app/
  * Pipeline: https://vercel.com/clem21/clem-mahjong
  * Repo: https://github.com/ClemL/mahjong
* **Comments explain *why*, not *what*.** Skip them where the code already says it.

## What this project is

A Hong Kong old-style mahjong table for the browser. You play East; three computer opponents play
the other seats. Next.js App Router, deployed to Vercel as a fully static site — the whole game runs
client-side, with no backend, database, or environment variables.

## Layout

```
src/game/          Rules engine — no React, no DOM, no browser APIs
  tiles.ts         Tile codes, the 144-tile set, display glyphs
  melds.ts         Meld shapes and chow partners
  winning.ts       Hand decomposition, special hands, waits
  scoring.ts       Faan patterns, exclusions, payout
  rules.ts         House ruleset — every tunable number lives here
  engine.ts        State machine: deal, draw, discard, claims, settlement, history
  ai.ts            AiStrategy interface + the random opponent
  controller.ts    Steps the table one beat at a time
  sound.ts         Web Audio cues, synthesised at runtime
  rng.ts           Seeded PRNG (mulberry32) for reproducible games
src/hooks/         React binding for the engine
src/components/    Tiles, pip artwork, seats, pond, hand, modals, chart, footer
src/app/           Next.js entry and all styles
public/updates.txt Changelog, oldest first
```

## Conventions that matter here

* **The engine is pure and UI-free.** Every mutator takes a `GameState` and returns a new one. Do not
  import React, touch the DOM, or read a browser API from `src/game/` — `sound.ts` is the one
  deliberate exception and guards every call. This is what lets the tests fuzz 150 complete hands
  without a browser.
* **Rules changes go in `rules.ts`.** Hong Kong scoring is a house-rules affair. Faan values, the
  payout table, the faan minimum and the limit are configuration, not constants scattered through
  the scoring code. A rule the player can change belongs in `RuleConfig`, threaded through
  `GameState.config` so it applies mid-hand.
* **Presentation concerns stay out of the engine.** Sound cues and animations are derived by diffing
  consecutive states in the React layer, not by the engine emitting events.
* **Test the engine, not the pixels.** New rules need a unit test; the fuzz test in
  `engine.test.ts` asserts the invariants that matter — all 144 tiles accounted for, hand sizes
  matching the melds exposed, every chow a real run, scores zero-sum.
* **Verify UI work in a real browser.** The React layer has no automated coverage yet. Every UI bug
  found so far — a double discard, a broken mobile grid, an invisible suit mark — was caught by
  driving the built app in Chromium, not by the test suite. Do that before claiming a UI change works.
* **Before writing chart code, load the `dataviz` skill and run its palette validator** against the
  surface the chart actually sits on. The existing chart's colors are validated; do not add series
  colors by eye.
* **Motion and color are accessibility surfaces.** Animations must respect `prefers-reduced-motion`,
  hover-only affordances must be gated behind `(hover: hover) and (pointer: fine)`, and identity must
  never rest on color alone.

## Commands

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # engine unit tests + fuzz run
npm run typecheck  # tsc --noEmit
npm run build      # production build; must pass before a PR
```
