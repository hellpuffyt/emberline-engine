// Property tests for determinism and rewind. Each property is checked over
// many generated cases; the generator is the engine's own seeded Rng, so a
// failing case is reproducible from the printed case seed. Inputs are random
// key sets so that edge-triggered logic (`pressed`, which reads prevInput)
// is exercised across keyframe and history-trim boundaries.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World, Timeline, physicsSystem, held, pressed, Rng, type Body, type System, type InputFrame, saveGame, loadGame } from '../src/index.js';

const KEYS = ['ArrowLeft', 'ArrowRight', 'Space', 'KeyX'];

const controls: System = {
  name: 'controls',
  update(world, ctx) {
    for (const e of world.query('body', 'player')) {
      const b = world.need<Body>(e, 'body');
      b.vx = held(ctx.input, 'ArrowRight') ? 120 : held(ctx.input, 'ArrowLeft') ? -120 : 0;
      if (pressed(ctx.input, ctx.prevInput, 'Space') && b.grounded) b.vy = -400;
      const c = world.need<{ n: number; r: number }>(e, 'counter');
      if (pressed(ctx.input, ctx.prevInput, 'KeyX')) c.n += 1;
      c.r = ctx.rng.int(0, 1000);
    }
  },
};

function build(opts: { seed?: number; keyframeEvery?: number; maxHistory?: number } = {}): Timeline {
  const w = new World();
  w.create({ body: { x: 0, y: 200, w: 1000, h: 20, vx: 0, vy: 0, static: true } });
  w.create({ body: { x: 10, y: 100, w: 10, h: 10, vx: 0, vy: 0 }, player: {}, counter: { n: 0, r: 0 } });
  return new Timeline(w, [controls, physicsSystem({ gravity: 1000 })], {
    hz: 60,
    seed: opts.seed ?? 7,
    keyframeEvery: opts.keyframeEvery ?? 30,
    ...(opts.maxHistory !== undefined ? { maxHistory: opts.maxHistory } : {}),
  });
}

/** Random input log; keys are held for random runs so edges are sparse but present. */
function inputs(gen: Rng, n: number): InputFrame[] {
  const out: InputFrame[] = [];
  let cur: string[] = [];
  for (let i = 0; i < n; i++) {
    if (gen.next() < 0.15) cur = KEYS.filter(() => gen.next() < 0.4).sort();
    out.push({ keys: [...cur] });
  }
  return out;
}

const CASES = 60;

test('property: identical seed + inputs give identical hashes at every tick', () => {
  for (let c = 0; c < CASES; c++) {
    const gen = new Rng(1000 + c);
    const log = inputs(gen, 50 + gen.int(0, 250));
    const a = build({ seed: c });
    const b = build({ seed: c });
    for (const f of log) {
      a.step(f);
      b.step(f);
      assert.equal(a.hash(), b.hash(), `case ${c} tick ${a.tick}`);
    }
  }
});

test('property: rewind(k) restores the exact hash of tick-k, and replaying the same inputs returns to the same end state', () => {
  for (let c = 0; c < CASES; c++) {
    const gen = new Rng(2000 + c);
    const log = inputs(gen, 40 + gen.int(0, 260));
    const t = build({ seed: c, keyframeEvery: 1 + gen.int(0, 40) });
    const hashes = [t.hash()];
    for (const f of log) {
      t.step(f);
      hashes.push(t.hash());
    }
    const end = t.tick;
    const k = gen.int(0, end);
    t.rewind(k);
    assert.equal(t.tick, end - k, `case ${c}`);
    assert.equal(t.hash(), hashes[end - k], `case ${c} rewind ${k}`);
    for (let i = t.tick; i < end; i++) t.step(log[i]);
    assert.equal(t.hash(), hashes[end], `case ${c} replay after rewind ${k}`);
  }
});

test('property: seek to any tick and back preserves the future exactly', () => {
  for (let c = 0; c < CASES; c++) {
    const gen = new Rng(3000 + c);
    const log = inputs(gen, 60 + gen.int(0, 200));
    const t = build({ seed: c, keyframeEvery: 1 + gen.int(0, 50) });
    const hashes = [t.hash()];
    for (const f of log) {
      t.step(f);
      hashes.push(t.hash());
    }
    const end = t.tick;
    for (let j = 0; j < 5; j++) {
      const target = gen.int(0, end);
      t.seek(target);
      assert.equal(t.hash(), hashes[target], `case ${c} seek ${target}`);
    }
    t.seek(end);
    assert.equal(t.hash(), hashes[end], `case ${c} back to end`);
  }
});

test('property: after history is trimmed, rewinding to the oldest tick and save/load still reproduce the original states', () => {
  for (let c = 0; c < CASES; c++) {
    const gen = new Rng(4000 + c);
    const keyframeEvery = 1 + gen.int(0, 20);
    const maxHistory = keyframeEvery + gen.int(5, 60);
    const log = inputs(gen, maxHistory * 3 + gen.int(0, 100));
    const t = build({ seed: c, keyframeEvery, maxHistory });
    const hashes = [t.hash()];
    for (const f of log) {
      t.step(f);
      hashes.push(t.hash());
    }
    const end = t.tick;
    assert.ok(t.oldestTick > 0, `case ${c}: history should have been trimmed`);

    const json = saveGame('prop', t);
    const loaded = loadGame(json, build().systems, { keyframeEvery, maxHistory });
    assert.equal(loaded.timeline.hash(), hashes[end], `case ${c} save/load`);

    const oldest = t.oldestTick;
    t.rewind(end - oldest);
    assert.equal(t.hash(), hashes[oldest], `case ${c} rewind to oldest`);
    for (let i = oldest; i < end; i++) t.step(log[i]);
    assert.equal(t.hash(), hashes[end], `case ${c} replay from oldest`);
  }
});

test('property: reusing and mutating one input frame object behaves exactly like passing fresh frames', () => {
  for (let c = 0; c < 20; c++) {
    const seq: string[][] = [];
    const gen = new Rng(5000 + c);
    for (let i = 0; i < 120; i++) seq.push(gen.next() < 0.5 ? ['KeyX', 'Space'] : []);

    const fresh = build({ seed: c, keyframeEvery: 10 });
    const truth = [fresh.hash()];
    for (const keys of seq) {
      fresh.step({ keys: [...keys] });
      truth.push(fresh.hash());
    }

    const reused = build({ seed: c, keyframeEvery: 10 });
    const frame: InputFrame = { keys: [] };
    for (const keys of seq) {
      frame.keys = [...keys];
      reused.step(frame); // same object every tick, mutated in between
      assert.equal(reused.hash(), truth[reused.tick], `case ${c} tick ${reused.tick}`);
    }
    reused.rewind(60 + new Rng(c).int(0, 50));
    assert.equal(reused.hash(), truth[reused.tick], `case ${c} after rewind`);
  }
});

test('rewind and seek with out-of-range arguments clamp instead of crashing', () => {
  const t = build();
  for (let i = 0; i < 30; i++) t.step({ keys: ['ArrowRight'] });
  const h = t.hash();
  t.rewind(-5);
  assert.equal(t.tick, 30);
  assert.equal(t.hash(), h);
  t.rewind(1e9);
  assert.equal(t.tick, 0);
});
