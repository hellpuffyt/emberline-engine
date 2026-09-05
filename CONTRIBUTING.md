# Contributing

## Ground rules

- **Zero runtime dependencies.** Dev dependencies are TypeScript and
  `@types/node`; that is the whole list.
- **Determinism is non-negotiable.** No `Math.random`, `Date.now`,
  `performance.now` or DOM access in engine code outside the backends that
  own them. `npm run lint` enforces it; don't add exceptions, add a backend.
- **Components are JSON.** No class instances, functions, `Map`s or typed
  arrays inside a component — snapshot, rewind and save depend on it.
- Every engine change comes with a test in the matching `test/*.test.ts`;
  anything touching `timeline.ts` also needs a hash-equality assertion.
- `npm test`, `npm run lint` and `npm run headless` must pass.

## Workflow

```
git clone https://github.com/hellpuffyt/emberline-engine
cd emberline-engine
npm install
npm test && npm run lint && npm run headless
npm run demo        # http://localhost:8000
```

## Where things live

| Want to… | Look in |
|---|---|
| Add a component-driven feature (animation, tilemap) | a new `src/*.ts` system + `src/index.ts` export |
| Change stepping, keyframes, rewind, saves | `src/timeline.ts`, `src/save.ts` |
| Add an input source | `src/input.ts` (produce `InputFrame`s) |
| Add a render backend | implement `Renderer` from `src/render.ts` |
| Change the demo | `demo/platformer.ts` (scene, headless-safe) and `demo/main.ts` (browser wiring) |

## Reporting bugs

A save file (`F5` in the demo, stored in `localStorage` under
`emberline-save`) reproduces most gameplay bugs exactly — attach it.
