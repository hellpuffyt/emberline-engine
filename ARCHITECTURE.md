# Architecture

```
 Keyboard / ScriptedInput ──► InputFrame (sorted keys, pointer)
                                   │
                                   ▼
  GameLoop.advance(ms) ──► Timeline.step(frame) ──► systems[] run in order
   (accumulator, 60 Hz)         │                     over World (ECS)
         │                      ├─ inputs[]  (every frame, since oldest keyframe)
         │                      ├─ keyframes (World.snapshot + rng state, every N ticks)
         │                      └─ EventBus  (per-tick, cleared each step)
         ▼
   scene.render(alpha) ──► Renderer (Canvas2D | NullRenderer)
   scene.afterTick()   ──► Audio from events (WebAudio | NullAudio)
```

## The timeline model

A tick is `state' = systems(state, input, rng)`. Nothing else is allowed in:
no wall clock, no `Math.random`, no DOM. `tools/lint.mjs` fails the build on
those tokens in `src/` (backends excepted). Given that:

- **Keyframes** are complete world snapshots plus the RNG state, taken every
  `keyframeEvery` ticks (default 60 = one second). Components are plain
  JSON, so `structuredClone` is the whole serialiser.
- **Rewind** to tick `t`: restore the newest keyframe ≤ `t`, replay the
  recorded inputs up to `t` (at most `keyframeEvery − 1` steps), drop
  inputs and keyframes after `t`. Cost is bounded and predictable.
- **Seek** is rewind without dropping the future (scrubbing).
- **History** is bounded by `maxHistory`; the oldest keyframe becomes the
  new base and earlier inputs are discarded.
- **Hash** is FNV-1a over a canonical JSON of `{tick, rng, world}` — order-
  independent for object keys, so two worlds that are equal hash equal.
- **Save file** = the oldest kept keyframe + every input since. `loadGame`
  replays and compares the hash; a mismatch means the systems changed or
  the file was edited, and the load is refused.

Because `step` and `rewind` are cheap and exact, a program can use the
timeline as a planner: the headless demo's bot does depth-first search over
input options and backtracks with `rewind(STEP)`, completing the level in a
few hundred expansions.

## ECS

`World` keeps one `Map<Entity, component>` per component type and a set of
live ids. `query(...types)` iterates the smallest store and returns ids
ascending, so systems see entities in the same order every run. `create`
never reuses ids; `restore` resets the counter from the snapshot so ids stay
stable across rewinds and loads.

Systems are `{ name, update(world, ctx) }` where `ctx` carries `tick`, `dt`,
this and previous `InputFrame`, the seeded `Rng` and the `EventBus`. Events
are how systems talk: physics emits `collision`/`trigger`, game rules react,
scenes turn them into sounds after the tick.

## Physics

Axis-separated AABB resolution against static bodies: move X, resolve,
move Y, resolve, in entity order. Triggers are static bodies that report
overlaps instead of blocking. This is deliberately the simplest physics that
makes a good platformer; it is ~100 lines and fully deterministic.

## Rendering and interpolation

`GameLoop` accumulates real time and runs whole fixed steps; the leftover
fraction (`alpha`) is passed to `render` so positions can be interpolated
(`x + vx * alpha / hz`) for smooth motion at any refresh rate. Stalls are
capped at `maxSteps` per frame. The `Renderer` interface is intentionally
tiny (clear, camera, rect, sprite, text) so backends are trivial to add.

## Assets and audio

`packManifest` reads PNG `IHDR` chunks to record sizes and frame counts
(`name@N.png`); `Assets.load` fetches through a backend and reports
progress. Audio is triggered only from tick events in `afterTick`, keeping
side effects out of the simulation; `NullAudio` records plays for tests.

## Deliberate simplifications

| Simplification | Upgrade path |
|---|---|
| Keyframes are full snapshots | Delta snapshots per component store when worlds get large |
| Hash serialises the whole world | Incremental hashing per store, updated on `set` |
| Static-vs-dynamic physics only | Dynamic-vs-dynamic impulse response as a second pass |
| Canvas2D rects and sprites | WebGL batch renderer behind the same `Renderer` interface |
