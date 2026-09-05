import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deflateSync } from 'node:zlib';
import {
  World,
  Timeline,
  NullRenderer,
  NullAudio,
  Assets,
  packManifest,
  readPngSize,
  SceneManager,
  Behaviours,
  script,
  Keyboard,
  pressed,
  released,
  frameEquals,
  drawOverlay,
  inspect,
  type SceneDef,
} from '../src/index.js';

/** Builds a valid PNG (1 bit-depth greyscale, zlib-compressed) in memory. */
export function png(w: number, h: number): Uint8Array {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (b: Uint8Array): number => {
    let c = 0xffffffff;
    for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Uint8Array): Uint8Array => {
    const out = new Uint8Array(12 + data.length);
    const dv = new DataView(out.buffer);
    dv.setUint32(0, data.length);
    out.set(Buffer.from(type), 4);
    out.set(data, 8);
    dv.setUint32(8 + data.length, crc(out.subarray(4, 8 + data.length)));
    return out;
  };
  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, w);
  dv.setUint32(4, h);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 0; // greyscale
  const raw = new Uint8Array((w + 1) * h); // filter byte 0 + pixels (all zero)
  const idat = new Uint8Array(deflateSync(raw));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', new Uint8Array(0)),
  ]);
}

test('asset pipeline reads PNG sizes and builds a manifest', async () => {
  assert.deepEqual(readPngSize(png(48, 16)), { w: 48, h: 16 });
  assert.throws(() => readPngSize(new Uint8Array([1, 2, 3])), /not a PNG/);
  const m = packManifest([
    { path: 'img/coin@4.png', bytes: png(64, 16) },
    { path: 'img/hero.png', bytes: png(12, 20) },
    { path: 'sfx/jump.wav', bytes: new Uint8Array(4) },
    { path: 'levels/one.json', bytes: new Uint8Array(2) },
    { path: 'notes.txt', bytes: new Uint8Array(1) },
  ]);
  assert.deepEqual(m.images.coin, { src: 'img/coin@4.png', w: 16, h: 16, frames: 4 });
  assert.deepEqual(m.images.hero, { src: 'img/hero.png', w: 12, h: 20 });
  assert.deepEqual(Object.keys(m.sounds), ['jump']);
  assert.deepEqual(Object.keys(m.data), ['one']);
  const progress: number[] = [];
  const assets = new Assets(m, { loadImage: async () => 'H', loadSound: async () => 'S', loadData: async () => ({ level: 1 }) });
  await assets.load((n) => progress.push(n));
  assert.deepEqual(progress, [1, 2, 3, 4]);
  assert.equal(assets.image('hero').handle, 'H');
  assert.deepEqual(assets.frame('coin', 6), { sx: 32, sy: 0, sw: 16, sh: 16 });
  assert.deepEqual(assets.data('one'), { level: 1 });
  assert.throws(() => assets.image('nope'), /unknown image/);
});

test('keyboard source: sticky presses, sorted keys, edge helpers', () => {
  const listeners: Record<string, (ev: { code: string; preventDefault(): void }) => void> = {};
  const kb = new Keyboard({ addEventListener: (t, l) => (listeners[t] = l) });
  let prevented = 0;
  const ev = (code: string) => ({ code, preventDefault: () => prevented++ });
  listeners.keydown(ev('KeyD'));
  listeners.keydown(ev('ArrowUp'));
  listeners.keyup(ev('ArrowUp')); // tapped between ticks
  const f1 = kb.frame();
  assert.deepEqual(f1.keys, ['ArrowUp', 'KeyD']);
  assert.equal(prevented, 1, 'arrow keys are captured, letters are not');
  const f2 = kb.frame();
  assert.deepEqual(f2.keys, ['KeyD'], 'tap lasted exactly one tick');
  assert.ok(pressed(f1, { keys: [] }, 'ArrowUp'));
  assert.ok(released(f2, f1, 'ArrowUp'));
  assert.ok(!pressed(f2, f1, 'KeyD'), 'held, not newly pressed');
  listeners.blur({ code: '', preventDefault() {} });
  assert.deepEqual(kb.frame().keys, []);
  assert.ok(frameEquals({ keys: ['a'] }, { keys: ['a'] }));
  assert.ok(!frameEquals({ keys: ['a'], pointer: { x: 1, y: 1, down: true } }, { keys: ['a'] }));
});

test('scene stack, behaviours, audio from events, overlay and inspector', () => {
  const renderer = new NullRenderer(320, 180);
  const audio = new NullAudio();
  const assets = new Assets({ images: {}, sounds: {}, data: {} });
  const behaviours = new Behaviours().register('blinker', (e, state, world, ctx) => {
    state.ticks = ((state.ticks as number) ?? 0) + 1;
    if (state.ticks === 3) ctx.events.emit('blink', { e });
    void world;
  });
  const level: SceneDef = {
    name: 'level',
    systems: [behaviours.system()],
    setup(world) {
      world.create({ script: script('blinker'), pos: { x: 1 } });
    },
    render(world, r) {
      r.clear('#000');
      for (const e of world.query('pos')) r.rect(e, 0, 1, 1, '#fff');
      r.text('hud', 0, 0);
    },
    afterTick(scene, s) {
      for (const _ of scene.timeline.events.of('blink')) s.audio.play('blink', { volume: 0.5 });
    },
  };
  const menu: SceneDef = { name: 'menu', systems: [], setup() {}, render(_w, r) { r.clear('#111'); } };
  const scenes = new SceneManager({ renderer, audio, assets });
  scenes.push(menu);
  scenes.push(level);
  assert.equal(scenes.depth, 2);
  for (let i = 0; i < 5; i++) scenes.step({ keys: [] });
  assert.deepEqual(audio.played, [{ name: 'blink', opts: { volume: 0.5 } }]);
  scenes.render(0.5);
  assert.equal(renderer.count('rect'), 1);
  assert.equal(renderer.count('text'), 1);
  const cur = scenes.current!;
  const e = cur.world.query('script')[0];
  assert.equal(cur.world.need<{ state: { ticks: number } }>(e, 'script').state.ticks, 5);
  drawOverlay(renderer, { timeline: cur.timeline, world: cur.world, extra: ['x'] });
  assert.ok(renderer.calls.some((c) => c.op === 'text' && String(c.args[0]).startsWith('tick 5')));
  assert.ok(inspect(cur.world, e).includes(`  pos: {"x":1}`));
  assert.deepEqual(inspect(cur.world, 999), ['entity 999: (destroyed)']);
  scenes.pop();
  assert.equal(scenes.current!.def.name, 'menu');
  // Unregistered behaviours fail loudly.
  const w = new World();
  w.create({ script: script('ghost') });
  assert.throws(() => new Timeline(w, [behaviours.system()]).step({ keys: [] }), /unregistered behaviour/);
});
