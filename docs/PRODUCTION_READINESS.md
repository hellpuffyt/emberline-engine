# Production readiness — emberline-engine

Tested commit: `38928c8` (audit/production-readiness; this file was added in
the following docs-only commit). Date: 2026-10-22.

## Scope and architecture

A zero-runtime-dependency TypeScript 2D engine: fixed-step ECS, a `Timeline`
that records input frames and keyframes for rewind/seek/replay, AABB physics,
scenes, a Canvas2D renderer, an asset packer, scripting, and save files that
are a keyframe plus an input log, verified by replay. Demo: *Ember Run*
(browser) and a headless search bot.

## Platforms and prerequisites

- Node >= 20; CI runs Node 20/22 on Linux/Windows/macOS. Verified locally on
  macOS 27 (Apple M5), Node 24.19.0, npm 11.17.0. Windows not run locally.
- Browser demo verified in headless Chromium only (no manual play-through,
  no other browsers).

## Clean-clone verification

| Step (README) | Result |
|---|---|
| `npm install` | 0 |
| `npm test` | 24 pass, 0 fail, 0 skipped |
| `npm run lint` | `lint ok` |
| `npm run headless` | level completed, state hash `65a217ed`, replay / rewind 120 / save+load all identical |
| `npm run pack` | 0, manifest regenerated |
| `npm run demo` + headless Chromium (move, hold R, debug overlay) | renders, no page errors; one 404 console message for a resource the page requests (not investigated further) |

## Commands and results

| Check | Before | After |
|---|---|---|
| `npm test` | 17 pass | 24 pass, 0 fail |
| New property suite on the original `timeline.ts` | — | 3 failing properties (trimmed-history save/load: `save replay diverged`; mutated input object; negative rewind `TypeError`) |
| `npm run lint` | ok | ok |
| `npm run headless` | OK, hash `65a217ed` | OK, hash `65a217ed` (unchanged) |
| Demo server malformed URL `/%E0%A4%A` | process crashed | 400, server keeps serving |
| Demo server bind address | all interfaces | `127.0.0.1` |
| `npm audit` / `--omit=dev` | 0 / 0 | 0 / 0 |

## CI status

Default branch: success (latest `main` run). Audit branch: pending until pushed.

## Bugs found and fixed

1. **Keyframes lacked `prevInput`** — after history trimming (default 5 min
   at 60 Hz) rewinding to the oldest keyframe, and loading such a save,
   replayed edge-triggered input (`pressed()`) differently; `loadGame`
   threw on legitimate saves. Fixed; save field is optional for old files.
2. **Recorded input aliasing** — `step()` stored the caller's object.
3. **`rewind(-n)` crash.**
4. **Demo server** crash on malformed URLs and all-interface bind.

Regression tests: `test/property.test.ts`, `test/serve.test.ts`.

## Security review

- Secret scan of tree and full history: no hits. CI also runs gitleaks.
- Save files: replay + 32-bit FNV hash is an integrity check, not
  authentication (already documented in `SECURITY.md`; README wording
  "cheat-resistant" removed).
- Behaviours are resolved from a registry; saves carry state, not code.

## Known limitations

- `hash()` covers tick, RNG and world, not `prevInput`; two states that
  differ only in the previous input hash equal.
- `canonical()` hashes `NaN`/`Infinity` like `null` and `-0` like `0`.
- Cross-browser floating-point bit-exactness is not verified.
- Determinism holds only if game systems keep all state in components (the
  lint enforces no time/random/DOM in `src/`, not in game code).

## Acceptance checklist

| # | Item | Expected | Test | Result |
|---|---|---|---|---|
| 1 | Same seed + inputs → same hash every tick | equal | property 1 | pass |
| 2 | `rewind(k)` exact, replay converges | equal hashes | property 2 | pass |
| 3 | `seek` preserves the future | equal hashes | property 3 | pass |
| 4 | Save/load and rewind after history trim | equal hashes | property 4 | pass |
| 5 | Input aliasing cannot rewrite history | equal to fresh-frame run | property 5 | pass |
| 6 | Edited save rejected | throws | `timeline.test.ts` | pass |
| 7 | Headless demo end to end | identical ×3 | `npm run headless` | pass |
| 8 | Engine code free of time/random/DOM | lint ok | `npm run lint` | pass |
| 9 | Demo server contained and robust | 400 / not 200 | `serve.test.ts` | pass |

## Classification proposal

**READY FOR DOCUMENTED SCOPE** for the engine core (proposal; pending
audit-branch CI and the lead's verification). The browser demo is only
smoke-verified in headless Chromium.
