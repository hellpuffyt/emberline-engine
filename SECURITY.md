# Security

Emberline is a client-side game engine. Its security-relevant surface is
small but real: save files and replays are data that crosses trust
boundaries (shared between players, uploaded to leaderboards), and
determinism is a correctness property games depend on.

## Guarantees (tested)

| Property | Mechanism | Test |
|---|---|---|
| A save file cannot load into a state its inputs do not produce | `loadGame` replays the input log and compares the recorded hash; mismatch throws | `timeline.test.ts` "reject tampering" |
| Malformed save files fail cleanly | `parseSave` validates format, version and shape; JSON errors are caught | same |
| Simulation is reproducible | No time/random/DOM in engine code, enforced by `npm run lint`; seeded RNG; ordered iteration | `timeline.test.ts` "identical state hashes", headless replay |
| Asset packer rejects non-PNG bytes | Signature and IHDR checks | `misc.test.ts` |
| No arbitrary code in data | Behaviours are looked up by name in a registry the game registers; a save cannot introduce code, only state | `misc.test.ts` "unregistered behaviour" |
| No dependencies at runtime | `package.json` has dev dependencies only | CI |

## Non-guarantees

- **Save hashes are integrity checks, not authentication.** FNV-1a is not
  cryptographic; a determined player can recompute it after editing a file.
  For leaderboards, verify by replaying the input log server-side (the same
  `loadGame`), which is exactly what the format enables.
- **Input logs reveal what the player did.** Treat them as personal data if
  you upload them.
- **The demo's dev server** (`tools/serve.mjs`) is for local use: it serves
  the repository directory on localhost with a containment check and nothing
  else.
- **Cross-browser bit-exactness** of floating point is expected from the JS
  specification but not verified in CI across engines.

## Reporting

Open a security advisory on the GitHub repository. Acknowledgement within
7 days.
