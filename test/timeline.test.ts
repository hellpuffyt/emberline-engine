import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World, Timeline, GameLoop, physicsSystem, held, pressed, ScriptedInput, type Body, type System, saveGame, loadGame } from '../src/index.js';

const controls: System = {
  name: 'controls',
  update(world, ctx) {
    for (const e of world.query('body', 'player')) {
      const b = world.need<Body>(e, 'body');
      b.vx = held(ctx.input, 'ArrowRight') ? 120 : held(ctx.input, 'ArrowLeft') ? -120 : 0;
      if (pressed(ctx.input, ctx.prevInput, 'Space') && b.grounded) b.vy = -400;
      if (ctx.rng.next() < 0.01) ctx.events.emit('sparkle', { e });
    }
  },
};

function build(seed = 7): { w: World; t: Timeline; p: number } {
  const w = new World();
  w.create({ body: { x: 0, y: 200, w: 1000, h: 20, vx: 0, vy: 0, static: true } });
  const p = w.create({ body: { x: 10, y: 100, w: 10, h: 10, vx: 0, vy: 0 }, player: {} });
  const t = new Timeline(w, [controls, physicsSystem({ gravity: 1000 })], { hz: 60, keyframeEvery: 30, seed });
  return { w, t, p };
}

const script = new ScriptedInput([
  { until: 60, keys: ['ArrowRight'] },
  { until: 65, keys: ['ArrowRight', 'Space'] },
  { until: 120, keys: ['ArrowRight'] },
  { until: 200, keys: ['ArrowLeft'] },
]);

function play(t: Timeline, until: number): void {
  while (t.tick < until) t.step(script.frame(t.tick));
}

test('same inputs and seed produce identical state hashes', () => {
  const a = build();
  const b = build();
  play(a.t, 200);
  play(b.t, 200);
  assert.equal(a.t.hash(), b.t.hash());
  const c = build(8);
  play(c.t, 200);
  assert.notEqual(a.t.hash(), c.t.hash(), 'different seed → different rng-driven events');
  const pos = a.w.need<Body>(a.p, 'body');
  assert.ok(pos.x > 10 && pos.y === 190, `player moved and landed: ${pos.x},${pos.y}`);
});

test('rewind restores an exact earlier state and truncates history', () => {
  const { t, w, p } = build();
  play(t, 150);
  const hashAt100 = (() => {
    const fresh = build();
    play(fresh.t, 100);
    return fresh.t.hash();
  })();
  t.rewind(50);
  assert.equal(t.tick, 100);
  assert.equal(t.hash(), hashAt100, 'rewound state equals the state first reached at tick 100');
  assert.equal(t.inputAt(120), undefined, 'future inputs forgotten');
  // Continue on a new branch: hold left instead.
  const xBefore = w.need<Body>(p, 'body').x;
  for (let i = 0; i < 30; i++) t.step({ keys: ['ArrowLeft'] });
  assert.ok(w.need<Body>(p, 'body').x < xBefore);
  assert.equal(t.tick, 130);
});

test('seek scrubs without losing the future', () => {
  const { t } = build();
  play(t, 120);
  const end = t.hash();
  t.seek(45);
  assert.equal(t.tick, 45);
  t.seek(120);
  assert.equal(t.hash(), end);
});

test('history bound keeps rewind possible up to maxHistory', () => {
  const w = new World();
  w.create({ body: { x: 0, y: 0, w: 5, h: 5, vx: 1, vy: 0 } });
  const t = new Timeline(w, [physicsSystem({ gravity: 0 })], { keyframeEvery: 10, maxHistory: 50 });
  for (let i = 0; i < 200; i++) t.step({ keys: [] });
  assert.ok(t.oldestTick >= 140 && t.oldestTick <= 150, `oldest ${t.oldestTick}`);
  t.rewind(1000);
  assert.equal(t.tick, t.oldestTick);
});

test('save files replay to the same hash and reject tampering', () => {
  const { t } = build();
  play(t, 137);
  const json = saveGame('level1', t, { score: 3 });
  const loaded = loadGame(json, [controls, physicsSystem({ gravity: 1000 })], { keyframeEvery: 30 });
  assert.equal(loaded.timeline.tick, 137);
  assert.equal(loaded.timeline.hash(), t.hash());
  assert.equal(loaded.file.meta!.score, 3);
  const tampered = JSON.parse(json);
  tampered.timeline.inputs[3] = { keys: ['ArrowLeft'] };
  assert.throws(() => loadGame(JSON.stringify(tampered), [controls, physicsSystem({ gravity: 1000 })]), /diverged/);
  assert.throws(() => loadGame('{"format":"x"}', []), /not an Emberline save/);
  assert.throws(() => loadGame('nope', []), /valid JSON/);
});

test('game loop runs fixed steps from variable frame times', () => {
  const { t } = build();
  let renders = 0;
  let lastAlpha = -1;
  const loop = new GameLoop(
    t,
    () => ({ keys: [] }),
    (alpha) => {
      renders++;
      lastAlpha = alpha;
    },
  );
  assert.equal(loop.advance(16.6667), 1);
  assert.equal(loop.advance(50), 3);
  assert.equal(t.tick, 4);
  assert.ok(lastAlpha >= 0 && lastAlpha < 1);
  assert.equal(loop.advance(5000), loop.maxSteps, 'a stall is capped, not simulated');
  assert.equal(renders, 3);
});
