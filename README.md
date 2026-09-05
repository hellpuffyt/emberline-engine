# Emberline

**A 2D game engine where time is a data structure.**

Emberline runs a fixed-step, deterministic simulation and records every
input frame. That one design decision gives you, for free and for every game
built on it: **hold-to-rewind** gameplay, **replays**, **save files that are
input logs** (tiny, verifiable, cheat-resistant), **desync-proof
networking** later, and — as the demo shows — a bot that plays your level by
*searching the future and rewinding*.

TypeScript, zero runtime dependencies, Canvas2D renderer, ~1,900 lines of
engine. Runs in the browser and headless in Node.

```
$ npm test
ℹ pass 17

$ npm run headless
search: level completed in 313 expansions, 154 ms, 189 states
tick 900: player at (427.8, 178.0), coins 2/9, deaths 0, won true
state hash: 65a217ed  (inputs: 900 ticks)
fresh replay of the input log: identical
rewind 120 + replay: identical
save + load: identical
headless run OK
```

**Play it:** `npm run demo` → http://localhost:8000 — *Ember Run*, a
platformer with coins, spikes, a moving platform and a goal. Arrow keys /
WASD move, Space jumps (variable height, coyote time), **hold R to rewind
time** and branch, F5/F9 save and load, `` ` `` shows the debug overlay
(fps, tick, entity count, state hash).

## What is it?

| Module | What it gives you |
|---|---|
| `ecs` | Entities, JSON-only components, queries in deterministic id order, deep `snapshot`/`restore`, a per-tick event bus. |
| `timeline` | The core. `step(input)` runs systems at a fixed hz; keyframes every N ticks; `rewind(n)`, `seek(tick)`, `hash()`, `serialize()`/`deserialize()`; `GameLoop` with an accumulator and render interpolation. |
| `input` | Input frames as sorted, comparable data; `Keyboard` source with one-tick sticky taps; `ScriptedInput` for tests and bots; `pressed`/`released` edge helpers. |
| `physics` | AABB bodies, gravity, axis-separated collision resolution, `grounded`, bounce, ghosts, world bounds, `trigger` overlaps as events. |
| `scene` | Scenes own a world + systems + timeline; a `SceneManager` stack (menu → level → pause). |
| `render` / `canvas` | A small `Renderer` interface; a Canvas2D backend with camera, DPR-aware backing store, pixel snapping, sprite strips; a `NullRenderer` that records draw calls for tests. |
| `assets` | Manifest-driven loader with progress; `tools/pack` builds the manifest by reading PNG headers (no image library); `name@4.png` = 4-frame strip. |
| `audio` | Web Audio backend with lazy decoding; `NullAudio` records plays. Sounds are triggered from tick events, never from inside the simulation. |
| `script` | Named behaviours attached through a `script` component whose state is JSON, so scripted entities rewind and save like everything else. |
| `save` | `saveGame`/`loadGame`: keyframe + input log + hash; loading replays and refuses a file whose replay diverges. |
| `debug` | Frame stats, an overlay (fps, tick, history window, entity count, state hash), an entity inspector. |

## Who is it for?

- Developers making **precision platformers, puzzle games, roguelikes or
  fighting games**, where rewind, replays and reproducibility are features,
  not debugging luxuries.
- **Speedrun and tool-assisted communities**: a save is a replay; a replay is
  a proof.
- Anyone who wants an engine **small enough to read in an evening** and
  typed end to end.

## Why does it exist?

Phaser, PixiJS and friends are renderers with game loops bolted on; time
travel, replays and deterministic saves are things you build yourself, and
you usually discover too late that `Math.random()` and `Date.now()` are
scattered through your systems. Emberline flips the priority: the simulation
is a pure function of inputs *by construction* (a lint enforces it), and the
timeline is the engine's spine. Rendering is deliberately simple — Canvas2D,
rectangles and sprites — because that is not where the idea lives.

## What makes it different?

- **Rewind is a primitive.** `timeline.rewind(60)` restores the exact state
  one second ago and lets play continue on a new branch. The demo binds it to
  a key.
- **Saves replay, and verify.** A save file is a keyframe plus the inputs
  since. Loading replays them through your systems and checks the recorded
  hash, so a save from a different build or a tampered file is rejected
  loudly rather than loading garbage.
- **The engine can search.** Because stepping and rewinding are cheap and
  exact, the headless demo's bot completes the level by depth-first search
  over input options, backtracking with `rewind`. Same code path players use.
- **Determinism is enforced, not hoped for.** `npm run lint` fails the build
  if engine code touches `Math.random`, `Date.now`, `performance.now` or the
  DOM outside the backends that own it.
- **Interpolated rendering** at any refresh rate from a 60 Hz simulation,
  with a stall cap so a background tab does not cause a spiral of death.

## Why is this not just a tutorial?

Every claim above has a test: identical hashes for identical inputs (and
different for a different seed), rewind to an exact earlier hash with future
inputs forgotten, scrubbing that preserves the future, history bounds,
save/load round trip *and* tamper rejection, loop step accounting, physics
resolution on both axes with sides reported, triggers that do not block,
keyboard sticky taps, asset packing from real PNG bytes, scene stacking,
audio from events, behaviours failing loudly when unregistered. CI runs the
headless demo end to end.

## Build, test, run

```
npm install            # typescript + @types/node only (dev)
npm test               # tsc, then node --test
npm run lint           # determinism / DOM-boundary lint
npm run headless       # bot plays the level, replay + save/load verified
npm run pack           # rebuild demo/assets/manifest.json from PNG headers
npm run demo           # http://localhost:8000
```

Node 20+. No bundler: the browser loads the compiled ES modules directly.

## Using it

```ts
import { World, Timeline, physicsSystem, held, type Body, type System } from 'emberline';

const controls: System = {
  name: 'controls',
  update(world, ctx) {
    for (const e of world.query('body', 'player')) {
      const b = world.need<Body>(e, 'body');
      b.vx = held(ctx.input, 'ArrowRight') ? 120 : held(ctx.input, 'ArrowLeft') ? -120 : 0;
    }
  },
};
const world = new World();
world.create({ body: { x: 0, y: 200, w: 1000, h: 20, vx: 0, vy: 0, static: true } });
world.create({ body: { x: 10, y: 0, w: 10, h: 10, vx: 0, vy: 0 }, player: {} });
const timeline = new Timeline(world, [controls, physicsSystem({ gravity: 1000 })], { seed: 7 });
timeline.step({ keys: ['ArrowRight'] });
timeline.rewind(1);
```

## Limits (honest)

- Canvas2D only: rectangles, sprites, text. No WebGL, lighting, particles
  or tilemap renderer (yet).
- AABB physics with static-vs-dynamic resolution; no dynamic-vs-dynamic
  response, slopes or rotation.
- Rewind history is bounded by `maxHistory` (default 5 minutes at 60 Hz);
  memory is proportional to world size × keyframes.
- Floating-point determinism holds across runs on the same engine; cross-
  platform bit-exactness is expected from JS semantics but not yet verified
  across browsers in CI.

## Documentation

- [`ARCHITECTURE.md`](ARCHITECTURE.md) — the timeline model, keyframes, rewind, loop
- [`SECURITY.md`](SECURITY.md) — save-file trust, determinism guarantees
- [`TESTING.md`](TESTING.md), [`ROADMAP.md`](ROADMAP.md), [`CONTRIBUTING.md`](CONTRIBUTING.md), [`CHANGELOG.md`](CHANGELOG.md)

## Why star or contribute?

Star it if you have ever wanted to press R and undo a bad jump, or wanted a
save file you could diff. Contribute a tilemap renderer, a particle system, a
gamepad source, a WebGL backend, or rollback netcode — the timeline already
does the hard part of the last one.

## License

MIT. See [`LICENSE`](LICENSE).
