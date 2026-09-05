# Roadmap

Each item is one reviewable PR.

## 0.2 — more game in the box

- [ ] Tilemap component + renderer (the demo builds tiles by hand today).
- [ ] Gamepad input source.
- [ ] Particle system driven by events (deterministic, seeded).
- [ ] Sprite animation component (`frames`, `fps`) so scenes stop counting ticks by hand.
- [ ] Headless-browser smoke test of the demo in CI (Playwright, dev dependency only).

## 0.3 — timeline features

- [ ] Delta keyframes (only changed stores) to cut memory for big worlds.
- [ ] Incremental world hash maintained on `set`/`destroy`.
- [ ] Replay viewer: scrub any save file with the debug overlay.
- [ ] `Timeline.branch()` — fork a second timeline from the current tick (ghost racers, "what if" previews).

## 0.4 — rendering and physics

- [ ] WebGL batch renderer behind the same `Renderer` interface.
- [ ] Dynamic-vs-dynamic collision response; one-way platforms; slopes.
- [ ] Camera helpers: dead zones, shake (deterministic), bounds.

## Someday

- Rollback netcode: the timeline already provides prediction and rewind;
  what is missing is input exchange.
- A level editor that writes the same JSON the scenes read.

## Non-goals

- 3D.
- Becoming a general UI toolkit.
