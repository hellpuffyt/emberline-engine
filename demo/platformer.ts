/** "Ember Run" — the playable demo. A platformer with coins, hazards and a
 * goal, built entirely from engine primitives. Works headless too: the
 * scene has no DOM references, so the same file runs in the browser and
 * in `demo/headless.ts`. */

import {
  physicsSystem,
  held,
  pressed,
  script,
  Behaviours,
  drawOverlay,
  type SceneDef,
  type Body,
  type World,
  type Renderer,
  type Entity,
  type TickContext,
} from '../src/index.js';

export const VIEW = { w: 480, h: 270 };
export const TILE = 16;

// 30 x 17 tiles. # ground, = platform, c coin, ^ spike, P player, G goal, m mover.
export const LEVEL = [
  '..............................',
  '..............................',
  '.........c..........c.........',
  '..............................',
  '.......===......c....===......',
  '................==............',
  '..c......................c....',
  '..===..........m..............',
  '..............................',
  '.........c....................',
  '..............................',
  '.P......c.........c.....c..G..',
  '####...####..^^^......#..#####',
  '####...####.########..########',
  '####...####.########..########',
  '####^^^####^########^^########',
  '##############################',
];

export interface GameState extends Record<string, unknown> {
  coins: number;
  total: number;
  deaths: number;
  won: boolean;
  wonAt: number;
}

export const behaviours = new Behaviours()
  .register('player', (e, state, world, ctx) => {
    const b = world.need<Body>(e, 'body');
    const speed = 110;
    const target = held(ctx.input, 'ArrowRight') || held(ctx.input, 'KeyD') ? speed : held(ctx.input, 'ArrowLeft') || held(ctx.input, 'KeyA') ? -speed : 0;
    // Acceleration towards target speed; feels better than instant.
    b.vx += (target - b.vx) * (b.grounded ? 0.35 : 0.15);
    if (Math.abs(b.vx) < 1) b.vx = 0;
    if (target !== 0) state.facing = target > 0 ? 1 : -1;
    const jumpKey = pressed(ctx.input, ctx.prevInput, 'Space') || pressed(ctx.input, ctx.prevInput, 'ArrowUp') || pressed(ctx.input, ctx.prevInput, 'KeyW');
    // Coyote time: a few ticks of grace after leaving a ledge.
    state.coyote = b.grounded ? 6 : Math.max(0, ((state.coyote as number) ?? 0) - 1);
    if (jumpKey && (state.coyote as number) > 0) {
      b.vy = -330;
      state.coyote = 0;
      ctx.events.emit('jump', { e });
    }
    // Variable jump height: releasing early cuts the jump.
    if (b.vy < -60 && !(held(ctx.input, 'Space') || held(ctx.input, 'ArrowUp') || held(ctx.input, 'KeyW'))) b.vy = -60;
    state.anim = ((state.anim as number) ?? 0) + (Math.abs(b.vx) > 5 ? 1 : 0);
  })
  .register('mover', (e, state, world, ctx) => {
    const b = world.need<Body>(e, 'body');
    const t = ctx.tick % 240;
    // Static bodies are moved by hand: physics never integrates them.
    b.x = (state.x0 as number) + (t < 120 ? t : 240 - t) * 0.5;
  })
  .register('coin', (e, state, world, ctx) => {
    state.bob = ctx.tick % 60;
    void e;
    void world;
  });

const rules = {
  name: 'rules',
  update(world: World, ctx: TickContext) {
    const gs = world.query('game')[0];
    const g = world.need<GameState>(gs, 'game');
    const player = world.query('player')[0];
    if (player === undefined) return;
    for (const ev of ctx.events.of('trigger')) {
      if (ev.a !== player) continue;
      if (ev.tag === 'coin' && world.exists(ev.b as Entity)) {
        world.destroy(ev.b as Entity);
        g.coins++;
        ctx.events.emit('coin', {});
      } else if (ev.tag === 'hazard') {
        respawn(world, player);
        g.deaths++;
        ctx.events.emit('die', {});
      } else if (ev.tag === 'goal' && !g.won) {
        g.won = true;
        g.wonAt = ctx.tick;
        ctx.events.emit('win', {});
      }
    }
    const b = world.need<Body>(player, 'body');
    if (b.y > LEVEL.length * TILE + 40) {
      respawn(world, player);
      g.deaths++;
      ctx.events.emit('die', {});
    }
  },
};

function respawn(world: World, player: Entity): void {
  const b = world.need<Body>(player, 'body');
  const s = world.need<{ sx: number; sy: number }>(player, 'spawn');
  b.x = s.sx;
  b.y = s.sy;
  b.vx = 0;
  b.vy = 0;
}

export const level: SceneDef = {
  name: 'ember-run',
  systems: [behaviours.system(), physicsSystem({ gravity: 900, maxFall: 420 }), rules],
  timeline: { hz: 60, keyframeEvery: 30, seed: 2026 },
  setup(world) {
    let total = 0;
    LEVEL.forEach((row, ty) => {
      [...row].forEach((ch, tx) => {
        const x = tx * TILE;
        const y = ty * TILE;
        const solid = (h = TILE, dy = 0) => world.create({ body: { x, y: y + dy, w: TILE, h, vx: 0, vy: 0, static: true }, tile: { kind: ch } });
        switch (ch) {
          case '#':
            solid();
            break;
          case '=':
            solid(6);
            break;
          case 'c':
            total++;
            world.create({ body: { x: x + 4, y: y + 4, w: 8, h: 8, vx: 0, vy: 0, static: true }, trigger: { tag: 'coin' }, script: script('coin') });
            break;
          case '^':
            world.create({ body: { x: x + 2, y: y + 8, w: TILE - 4, h: 8, vx: 0, vy: 0, static: true }, trigger: { tag: 'hazard' }, tile: { kind: '^' } });
            break;
          case 'G':
            world.create({ body: { x, y: y - TILE, w: TILE, h: TILE * 2, vx: 0, vy: 0, static: true }, trigger: { tag: 'goal' }, tile: { kind: 'G' } });
            break;
          case 'm':
            world.create({ body: { x, y: y + 4, w: TILE * 2, h: 6, vx: 0, vy: 0, static: true }, script: script('mover', { x0: x }), tile: { kind: 'm' } });
            break;
          case 'P':
            world.create({
              body: { x: x + 3, y: y + 2, w: 10, h: 14, vx: 0, vy: 0 },
              player: {},
              spawn: { sx: x + 3, sy: y + 2 },
              script: script('player', { facing: 1, anim: 0, coyote: 0 }),
            });
            break;
        }
      });
    });
    world.create({ game: { coins: 0, total, deaths: 0, won: false, wonAt: 0 } satisfies GameState });
  },
  render(world, r, alpha, services) {
    const player = world.query('player')[0];
    const pb = world.need<Body>(player, 'body');
    const px = pb.x + pb.vx * alpha / 60;
    const py = pb.y + pb.vy * alpha / 60;
    const camX = Math.min(Math.max(px, VIEW.w / 2), LEVEL[0].length * TILE - VIEW.w / 2);
    const camY = Math.min(Math.max(py, VIEW.h / 2), LEVEL.length * TILE - VIEW.h / 2);
    r.clear('#1b1f3a');
    r.screenSpace();
    for (let i = 0; i < 12; i++) r.rect(((i * 97 - camX * 0.3) % (VIEW.w + 40)) - 20, 20 + ((i * 53) % 120), 40 + (i % 3) * 20, 8, '#26305a');
    r.camera({ x: Math.round(camX), y: Math.round(camY), zoom: 1 });
    for (const e of world.query('tile', 'body')) {
      const b = world.need<Body>(e, 'body');
      const kind = world.need<{ kind: string }>(e, 'tile').kind;
      const color = { '#': '#5b4636', '=': '#8a6d4b', '^': '#d9534f', G: '#f2c94c', m: '#7f8fa6' }[kind] ?? '#fff';
      if (kind === '^') for (let i = 0; i < 3; i++) r.rect(b.x + i * 4, b.y + 2, 3, 6, color);
      else r.rect(b.x, b.y, b.w, b.h, color);
      if (kind === '#') r.rect(b.x, b.y, b.w, 2, '#6f8f3e');
    }
    for (const e of world.query('trigger', 'script')) {
      const b = world.need<Body>(e, 'body');
      const bob = Math.sin(((world.need<{ state: { bob: number } }>(e, 'script').state.bob ?? 0) / 60) * Math.PI * 2) * 2;
      const img = services.assets.manifest.images.coin ? services.assets.image('coin') : undefined;
      if (img && img.handle) {
        const f = services.assets.frame('coin', Math.floor((world.need<{ state: { bob: number } }>(e, 'script').state.bob ?? 0) / 15));
        r.sprite(img, b.x - 4, b.y - 4 + bob, 16, 16, f.sx, f.sy, f.sw, f.sh);
      } else {
        r.rect(b.x, b.y + bob, b.w, b.h, '#ffd166');
        r.rect(b.x + 2, b.y + 2 + bob, 4, 4, '#fff3b0');
      }
    }
    const st = world.need<{ state: { facing: number; anim: number } }>(player, 'script').state;
    r.rect(px, py, pb.w, pb.h, '#ff6b35');
    r.rect(px + (st.facing > 0 ? 6 : 2), py + 3, 2, 2, '#fff');
    if (!pb.grounded) r.rect(px + 2, py + pb.h - 2, pb.w - 4, 2, '#ffa07a');
    else if (Math.floor(st.anim / 6) % 2 === 1) r.rect(px, py + pb.h - 2, pb.w, 2, '#c94f25');

    // HUD
    r.screenSpace();
    const g = world.need<GameState>(world.query('game')[0], 'game');
    r.rect(0, 0, VIEW.w, 18, 'rgba(0,0,0,0.45)');
    r.text(`coins ${g.coins}/${g.total}   deaths ${g.deaths}`, 8, 3, { size: 12, color: '#fff' });
    r.text('← → move · space jump · hold R rewind · F5 save · F9 load · ` debug', VIEW.w - 8, 3, { size: 10, color: '#cfd8ff', align: 'right' });
    if (g.won) {
      r.rect(VIEW.w / 2 - 110, VIEW.h / 2 - 30, 220, 60, 'rgba(0,0,0,0.7)');
      r.text('You made it!', VIEW.w / 2, VIEW.h / 2 - 20, { size: 20, color: '#f2c94c', align: 'center' });
      r.text(`${g.coins}/${g.total} coins · ${g.deaths} deaths · ${(g.wonAt / 60).toFixed(1)}s`, VIEW.w / 2, VIEW.h / 2 + 8, { size: 12, color: '#fff', align: 'center' });
    }
  },
  afterTick(scene, s) {
    for (const ev of scene.timeline.events.all()) {
      if (ev.type === 'jump') s.audio.play('jump', { volume: 0.4 });
      if (ev.type === 'coin') s.audio.play('coin');
      if (ev.type === 'die') s.audio.play('hit');
      if (ev.type === 'win') s.audio.play('win');
    }
  },
};

/** Draws the debug overlay for a scene; separate so headless can call it. */
export function overlay(r: Renderer, scene: { timeline: { tick: number }; world: World }, extra: string[]): void {
  drawOverlay(r, { timeline: scene.timeline as never, world: scene.world, extra });
}
