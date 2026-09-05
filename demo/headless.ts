/** Runs Ember Run without a browser. A search bot plays the level by
 * literally exploring the future: it commits to a few ticks of input,
 * looks at the outcome, and *rewinds the timeline* to try something else
 * when it died or got stuck. Determinism + rewind turn the engine into a
 * planner. The found input log is then replayed and saved/loaded to prove
 * all three paths agree. Used by CI as the real-execution check. */

import { Assets, NullAudio, NullRenderer, SceneManager, saveGame, loadGame, type Body, type World, type InputFrame } from '../src/index.js';
import { level, type GameState } from './platformer.js';

const renderer = new NullRenderer(480, 270);
const audio = new NullAudio();
const scenes = new SceneManager({ renderer, audio, assets: new Assets({ images: {}, sounds: {}, data: {} }) });
const scene = scenes.push(level);
const tl = scene.timeline;

const R: InputFrame = { keys: ['ArrowRight'] };
const RJ: InputFrame = { keys: ['ArrowRight', 'Space'] };
const N: InputFrame = { keys: [] };
const STEP = 6; // ticks per decision
const options: InputFrame[][] = [
  Array(STEP).fill(R), // run
  Array(STEP).fill(RJ), // jump and keep holding (chains into a full-height jump)
  [RJ, RJ, N, N, N, N], // short hop, then coast
  Array(STEP).fill(N), // wait (for the moving platform)
];

const game = (w: World): GameState => w.need<GameState>(w.query('game')[0], 'game');
const player = (): Body => scene.world.need<Body>(scene.world.query('player')[0], 'body');

let expansions = 0;
const seen = new Set<string>();
const log: InputFrame[] = [];

function search(depth: number): boolean {
  const g = game(scene.world);
  if (g.won) return true;
  if (depth === 0) return false;
  const b = player();
  const key = `${tl.tick / STEP}|${Math.round(b.x / 4)}|${Math.round(b.y / 4)}|${b.grounded ? 1 : 0}`;
  if (seen.has(key)) return false;
  seen.add(key);
  const deathsBefore = g.deaths;
  const xBefore = b.x;
  for (const opt of options) {
    expansions++;
    for (const f of opt) scene.step(f);
    const after = player();
    const bad = game(scene.world).deaths > deathsBefore || (opt[0] === N && after.x <= xBefore && !after.grounded);
    if (!bad && search(depth - 1)) {
      log.unshift(...opt);
      return true;
    }
    tl.rewind(STEP); // undo this branch and try the next option
  }
  return false;
}

const t0 = Date.now();
const won = search(150);
const ms = Date.now() - t0;
const g = game(scene.world);
const b = player();
console.log(`search: ${won ? 'level completed' : 'no path found'} in ${expansions} expansions, ${ms} ms, ${seen.size} states`);
console.log(`tick ${tl.tick}: player at (${b.x.toFixed(1)}, ${b.y.toFixed(1)}), coins ${g.coins}/${g.total}, deaths ${g.deaths}, won ${g.won}`);
if (!won) process.exit(1);
scene.render(0);
console.log(`draw calls in one frame: ${renderer.calls.length}`);
const hash = tl.hash();
console.log(`state hash: ${hash.toString(16)}  (inputs: ${log.length} ticks)`);

// 1. Replay the found inputs from scratch on a fresh scene → same hash.
const freshAudio = new NullAudio();
const fresh = new SceneManager({ renderer: new NullRenderer(), audio: freshAudio, assets: new Assets({ images: {}, sounds: {}, data: {} }) }).push(level);
for (const f of log) fresh.step(f);
console.log(`sounds in the winning run: ${freshAudio.played.map((p) => p.name).join(' ')}`);
if (fresh.timeline.hash() !== hash) {
  console.error(`REPLAY DIVERGED: ${fresh.timeline.hash().toString(16)}`);
  process.exit(1);
}
console.log('fresh replay of the input log: identical');

// 2. Rewind 120 ticks on the original and step forward again → same hash.
const frames = log.slice(-120);
tl.rewind(120);
for (const f of frames) scene.step(f);
if (tl.hash() !== hash) {
  console.error('REWIND + REPLAY DIVERGED');
  process.exit(1);
}
console.log('rewind 120 + replay: identical');

// 3. Save file round trip.
const loaded = loadGame(saveGame('ember-run', tl), level.systems, level.timeline);
if (loaded.timeline.hash() !== hash) {
  console.error('SAVE/LOAD DIVERGED');
  process.exit(1);
}
console.log('save + load: identical');
console.log('headless run OK');
