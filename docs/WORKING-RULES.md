# Working rules for this repo (read before editing)

The game was one HTML file; it is now a Vite project (see README.md). docs/brief.md is the
improvement brief written against the old single file. Its function names still exist, but:

- IGNORE "keep the game one file / no build step". Multiple files and `npm run build` are fine.
- Code lives in: src/sim/sim.js (everything inside `makeSim`), src/sim/data.js, src/sim/scripts.js,
  src/sim/persist.js, src/render/draw.js, src/app/game.js (UI, cards, book, saves), src/ai/ (AI providers).
- Determinism: sim randomness uses the seeded `R()` from `makeSim`, never `Math.random()`.
  (game.js uses Math.random for UI pacing only; keep that out of the sim.)
- Saves must keep loading: new state is plain data with defaults when missing; re-attach functions
  in `S.rehydrate`. Old saves (made before your change) must still restore.
- Performance: per-agent per-tick code must stay cheap; heavy logic goes in the yearly pass.
- Every new event goes through `log(type, importance, title, text, x, y, facs, {why:[...]})`.
- New card/vision effects go in `FX`, `FX_DOC`, and `validCard`.
- Event text: short, concrete, no modern jargon before the industrial ages.

Checks before you finish:
1. `npx tsc --noEmit` and `npm run build` pass.
2. Headless smoke test: playwright-core is not in the repo; `npm i --no-save playwright-core` in a
   temp dir OUTSIDE the repo, launch `/opt/pw-browsers/chromium` against `npx vite preview` (or dev),
   start a world, run it, and confirm there are no `pageerror`s and the thing you built works.
3. Commit on your branch with a clear message. Do not push and do not open a PR.
