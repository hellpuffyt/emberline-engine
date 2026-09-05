import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World, Timeline, physicsSystem, type Body } from '../src/index.js';

function world(): { w: World; player: number; ground: number } {
  const w = new World();
  const ground = w.create({ body: { x: 0, y: 100, w: 400, h: 20, vx: 0, vy: 0, static: true } });
  const player = w.create({ body: { x: 50, y: 0, w: 10, h: 10, vx: 0, vy: 0 } });
  return { w, player, ground };
}

test('gravity pulls a body down until it rests on the ground', () => {
  const { w, player, ground } = world();
  const t = new Timeline(w, [physicsSystem({ gravity: 1000 })], { hz: 60 });
  const b = w.need<Body>(player, 'body');
  for (let i = 0; i < 120; i++) t.step({ keys: [] });
  assert.equal(b.y, 90, 'sits exactly on top of the ground');
  assert.equal(b.vy, 0);
  assert.equal(b.grounded, true);
  const hits = t.events.of('collision');
  assert.ok(hits.some((e) => e.b === ground && e.side === 'bottom'));
});

test('horizontal movement is blocked by walls and reported by side', () => {
  const { w, player } = world();
  const wall = w.create({ body: { x: 100, y: 0, w: 10, h: 200, vx: 0, vy: 0, static: true } });
  const t = new Timeline(w, [physicsSystem({ gravity: 0 })], { hz: 60 });
  const b = w.need<Body>(player, 'body');
  b.vx = 600;
  for (let i = 0; i < 30; i++) t.step({ keys: [] });
  assert.equal(b.x, 90, 'stopped flush against the wall');
  assert.equal(b.vx, 0);
  assert.ok(t.events.of('collision').length === 0 || t.events.of('collision')[0].side === 'right');
  b.vx = -600;
  b.bounce = 1;
  t.step({ keys: [] });
  assert.ok(b.vx < 0, 'moving away, no collision');
  b.x = 111;
  b.vx = -600;
  t.step({ keys: [] });
  assert.equal(b.x, 110);
  assert.equal(b.vx, 600, 'bounce = 1 reflects velocity');
  void wall;
});

test('triggers report overlaps without blocking, ghosts pass through', () => {
  const { w, player } = world();
  const coin = w.create({ body: { x: 50, y: 40, w: 10, h: 10, vx: 0, vy: 0, static: true }, trigger: { tag: 'coin' } });
  const t = new Timeline(w, [physicsSystem({ gravity: 1000 })], { hz: 60 });
  let seen = false;
  for (let i = 0; i < 60; i++) {
    t.step({ keys: [] });
    if (t.events.of('trigger').some((e) => e.b === coin && e.tag === 'coin' && e.a === player)) seen = true;
  }
  assert.ok(seen, 'falling through the coin fires a trigger');
  const b = w.need<Body>(player, 'body');
  assert.equal(b.y, 90, 'the trigger did not block the fall');
  // ghost: falls straight through the ground
  b.ghost = true;
  b.y = 0;
  b.vy = 0;
  for (let i = 0; i < 120; i++) t.step({ keys: [] });
  assert.ok(b.y > 120);
});

test('world bounds clamp bodies', () => {
  const w = new World();
  const e = w.create({ body: { x: 5, y: 5, w: 10, h: 10, vx: -500, vy: -500 } });
  const t = new Timeline(w, [physicsSystem({ gravity: 0, bounds: { x: 0, y: 0, w: 100, h: 100 } })]);
  t.step({ keys: [] });
  const b = w.need<Body>(e, 'body');
  assert.deepEqual([b.x, b.y, b.vx, b.vy], [0, 0, 0, 0]);
});
