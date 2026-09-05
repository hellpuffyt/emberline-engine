# Changelog

Format: [Keep a Changelog](https://keepachangelog.com). Versions: SemVer.
Save-file format changes are called out explicitly.

## [Unreleased]

## [0.1.0] — 2026-09-06

First release. Save format `emberline-save` v1.

### Added
- ECS with deterministic queries, deep snapshots, per-tick event bus.
- Timeline: fixed-step simulation, input recording, keyframes, `rewind`,
  `seek`, bounded history, state hash, serialize/deserialize; `GameLoop`
  with accumulator, interpolation alpha and stall cap.
- Input frames, keyboard source with sticky taps, scripted input.
- AABB physics with gravity, axis-separated resolution, grounded, bounce,
  ghosts, bounds, trigger events.
- Scenes and a scene stack; renderer interface with Canvas2D and null
  backends; asset manifest packer reading PNG headers; Web Audio and null
  audio; named behaviours with JSON state; save/load with replay
  verification; debug overlay and inspector.
- Demo: *Ember Run* platformer (browser) and a headless search bot that
  completes it using rewind, verifying replay and save/load.
- Determinism lint.
