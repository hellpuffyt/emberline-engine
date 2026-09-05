/** Small deterministic math helpers. No floats leave this module in a form
 * that depends on platform: only +,-,*,/ and comparisons, evaluated in the
 * same order every time, so simulations replay bit-for-bit. */

export interface Vec2 {
  x: number;
  y: number;
}

export const v2 = (x = 0, y = 0): Vec2 => ({ x, y });
export const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, y: a.y + b.y });
export const sub = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, y: a.y - b.y });
export const scale = (a: Vec2, s: number): Vec2 => ({ x: a.x * s, y: a.y * s });
export const clamp = (n: number, lo: number, hi: number): number => (n < lo ? lo : n > hi ? hi : n);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

export interface AABB {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function overlaps(a: AABB, b: AABB): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

/** mulberry32: tiny, fast, seedable, and its state is one 32-bit integer
 * so it snapshots and restores trivially. */
export class Rng {
  private s: number;
  constructor(seed: number) {
    this.s = seed >>> 0;
  }
  /** Uniform in [0, 1). */
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  /** Integer in [lo, hi]. */
  int(lo: number, hi: number): number {
    return lo + Math.floor(this.next() * (hi - lo + 1));
  }
  state(): number {
    return this.s;
  }
  restore(s: number): void {
    this.s = s >>> 0;
  }
}

/** FNV-1a over a canonical JSON encoding (keys sorted) — a cheap, stable
 * fingerprint for "are these two world states identical?". */
export function hashState(value: unknown): number {
  const text = canonical(value);
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'undefined';
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value instanceof Map) return canonical([...value.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)));
  if (value instanceof Set) return canonical([...value].sort());
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonical(obj[k])).join(',') + '}';
}
