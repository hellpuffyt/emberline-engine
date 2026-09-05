import { test } from 'node:test';
import assert from 'node:assert/strict';
import { World, EventBus, hashState, canonical, Rng } from '../src/index.js';

test('entities, components, queries in id order', () => {
  const w = new World();
  const a = w.create({ pos: { x: 1 }, tag: { name: 'a' } });
  const b = w.create({ pos: { x: 2 } });
  const c = w.create({ pos: { x: 3 }, tag: { name: 'c' } });
  assert.deepEqual(w.query('pos'), [a, b, c]);
  assert.deepEqual(w.query('pos', 'tag'), [a, c]);
  assert.deepEqual(w.query('nope'), []);
  assert.equal(w.get<{ x: number }>(b, 'pos')!.x, 2);
  w.set(b, 'tag', { name: 'b' });
  assert.deepEqual(w.query('tag'), [a, b, c]);
  w.remove(a, 'tag');
  assert.deepEqual(w.query('tag'), [b, c]);
  w.destroy(b);
  assert.equal(w.exists(b), false);
  assert.deepEqual(w.query('pos'), [a, c]);
  assert.equal(w.count(), 2);
  assert.throws(() => w.set(b, 'pos', {}), /does not exist/);
  assert.throws(() => w.need(a, 'tag'), /has no tag/);
});

test('snapshot/restore is a deep copy and preserves ids', () => {
  const w = new World();
  const e = w.create({ body: { x: 0, list: [1, 2] } });
  const snap = w.snapshot();
  w.need<{ x: number; list: number[] }>(e, 'body').x = 99;
  w.need<{ x: number; list: number[] }>(e, 'body').list.push(3);
  const f = w.create({ body: { x: 5 } });
  assert.equal(f, e + 1);
  w.restore(snap);
  assert.deepEqual(w.get(e, 'body'), { x: 0, list: [1, 2] });
  assert.equal(w.exists(f), false);
  assert.equal(w.create(), f, 'id counter restored too');
});

test('event bus is per tick and filterable', () => {
  const ev = new EventBus();
  ev.emit('hit', { a: 1 });
  ev.emit('coin', { a: 2 });
  assert.equal(ev.of('hit').length, 1);
  assert.equal(ev.all().length, 2);
  ev.clear();
  assert.equal(ev.all().length, 0);
});

test('hashState is canonical and rng is reproducible', () => {
  assert.equal(hashState({ b: 1, a: [1, { z: 2, y: 3 }] }), hashState({ a: [1, { y: 3, z: 2 }], b: 1 }));
  assert.notEqual(hashState({ a: 1 }), hashState({ a: 2 }));
  assert.equal(canonical(new Map([['k', 1]])), '[["k",1]]');
  const r1 = new Rng(42);
  const r2 = new Rng(42);
  const seq1 = Array.from({ length: 5 }, () => r1.int(0, 100));
  const seq2 = Array.from({ length: 5 }, () => r2.int(0, 100));
  assert.deepEqual(seq1, seq2);
  const s = r1.state();
  const next = r1.next();
  r1.restore(s);
  assert.equal(r1.next(), next);
  assert.ok(seq1.every((n) => n >= 0 && n <= 100));
});
