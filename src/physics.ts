/** Fixed-step 2D AABB physics: gravity, velocity integration, axis-separated
 * collision resolution against static bodies, grounded detection, trigger
 * overlaps. Deterministic: entities are processed in id order and every
 * operation is plain arithmetic. */

import type { System, World } from './ecs.js';
import { overlaps } from './math.js';

export interface Body extends Record<string, unknown> {
  x: number;
  y: number;
  w: number;
  h: number;
  vx: number;
  vy: number;
  /** Static bodies never move and are what dynamic bodies collide with. */
  static?: boolean;
  /** Set by the system each tick: standing on something. */
  grounded?: boolean;
  /** 0 = stop on impact, 1 = perfect bounce. */
  bounce?: number;
  /** Ignore collisions entirely (still moves). */
  ghost?: boolean;
}

export interface Trigger extends Record<string, unknown> {
  /** Free-form tag reported in trigger events, e.g. "coin", "hazard". */
  tag: string;
}

export interface PhysicsOptions {
  gravity?: number;
  maxFall?: number;
  /** World bounds; bodies are clamped inside if given. */
  bounds?: { x: number; y: number; w: number; h: number };
}

/** Emits `collision` {a, b, side} for dynamic-vs-static contacts and
 * `trigger` {a, b, tag} for dynamic bodies overlapping Trigger entities. */
export function physicsSystem(opts: PhysicsOptions = {}): System {
  const gravity = opts.gravity ?? 1800;
  const maxFall = opts.maxFall ?? 1200;
  return {
    name: 'physics',
    update(world: World, ctx) {
      const all = world.query('body');
      // Triggers are static for bookkeeping but never block movement.
      const statics = all.filter((e) => world.need<Body>(e, 'body').static && !world.has(e, 'trigger'));
      const triggers = world.query('body', 'trigger');
      for (const e of all) {
        const b = world.need<Body>(e, 'body');
        if (b.static) continue;
        b.vy = Math.min(b.vy + gravity * ctx.dt, maxFall);
        b.grounded = false;

        // X axis
        b.x += b.vx * ctx.dt;
        if (!b.ghost) {
          for (const s of statics) {
            const o = world.need<Body>(s, 'body');
            if (!overlaps(b, o)) continue;
            if (b.vx > 0) {
              b.x = o.x - b.w;
              ctx.events.emit('collision', { a: e, b: s, side: 'right' });
            } else if (b.vx < 0) {
              b.x = o.x + o.w;
              ctx.events.emit('collision', { a: e, b: s, side: 'left' });
            }
            b.vx = b.bounce ? -b.vx * b.bounce : 0;
          }
        }
        // Y axis
        b.y += b.vy * ctx.dt;
        if (!b.ghost) {
          for (const s of statics) {
            const o = world.need<Body>(s, 'body');
            if (!overlaps(b, o)) continue;
            if (b.vy > 0) {
              b.y = o.y - b.h;
              b.grounded = true;
              ctx.events.emit('collision', { a: e, b: s, side: 'bottom' });
            } else if (b.vy < 0) {
              b.y = o.y + o.h;
              ctx.events.emit('collision', { a: e, b: s, side: 'top' });
            }
            b.vy = b.bounce ? -b.vy * b.bounce : 0;
            if (b.grounded && Math.abs(b.vy) < 1) b.vy = 0;
          }
        }
        if (opts.bounds) {
          const w = opts.bounds;
          if (b.x < w.x) {
            b.x = w.x;
            b.vx = 0;
          }
          if (b.x + b.w > w.x + w.w) {
            b.x = w.x + w.w - b.w;
            b.vx = 0;
          }
          if (b.y < w.y) {
            b.y = w.y;
            b.vy = 0;
          }
          if (b.y + b.h > w.y + w.h) {
            b.y = w.y + w.h - b.h;
            b.vy = 0;
            b.grounded = true;
          }
        }
        for (const t of triggers) {
          if (t === e) continue;
          if (overlaps(b, world.need<Body>(t, 'body'))) {
            ctx.events.emit('trigger', { a: e, b: t, tag: world.need<Trigger>(t, 'trigger').tag });
          }
        }
      }
    },
  };
}
