# Testing

`npm test` compiles with `tsc --strict` and runs `node --test` — 17 tests,
under two seconds. No test framework beyond Node's built-in runner.

| Suite | File | What it proves |
|---|---|---|
| ECS | `test/ecs.test.ts` | Queries return ids ascending and only complete matches; add/remove/destroy; snapshot is a deep copy that also restores the id counter; event bus filtering and clearing; canonical hashing is key-order independent; RNG reproduces and restores. |
| Physics | `test/physics.test.ts` | Gravity lands a body exactly on the ground with `grounded` and a `bottom` collision event; walls stop motion flush with the right `side`; `bounce = 1` reflects; triggers fire without blocking; ghosts pass through; world bounds clamp. |
| Timeline | `test/timeline.test.ts` | Identical inputs + seed → identical hash, different seed → different; rewind reaches the exact hash first seen at that tick and forgets the future; seek preserves the future; history bound; save → load reproduces the hash, tampered inputs and bad files are rejected; the game loop converts variable frame times into whole fixed steps and caps stalls. |
| Assets, input, scenes, scripts, debug | `test/misc.test.ts` | PNG header parsing on real PNG bytes built in-test; manifest packing incl. `@N` strips; loader progress and frame rects; keyboard sticky taps, sorted keys, capture/preventDefault, blur; edge helpers; scene stack push/pop; behaviours run and fail loudly when unregistered; audio played from events; overlay and inspector output. |

## Real execution

`npm run headless` runs the actual demo scene in Node: a search bot
completes the level using `rewind` for backtracking, then the found input
log is replayed on a fresh scene, the timeline is rewound 120 ticks and
re-stepped, and the state is saved and loaded — all three must produce the
same hash. CI runs this on Linux, macOS and Windows.

The browser demo is exercised manually (`npm run demo`); there is no
headless-browser test yet (see `ROADMAP.md`).

## Writing a test

Build a `World`, a `Timeline` with the systems under test, step it with
literal `InputFrame`s, and assert on components, events, or `hash()`.
`ScriptedInput` gives you a deterministic multi-tick input source. Use
`NullRenderer` and `NullAudio` to assert on what would have been drawn or
played.
