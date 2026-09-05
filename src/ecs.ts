/** Entity-component storage with deterministic iteration and cheap
 * snapshots. Components are plain JSON-able objects — that constraint is
 * what makes snapshot/restore, rewind and save files trivial. */

import type { InputFrame } from './input.js';
import { Rng } from './math.js';

export type Entity = number;

export interface WorldState {
  next: number;
  entities: Array<[Entity, Record<string, unknown>]>;
}

export interface GameEvent {
  type: string;
  [k: string]: unknown;
}

/** Per-tick event bus. Events emitted during a tick are visible to later
 * systems in the same tick and cleared at the end of it. */
export class EventBus {
  private queue: GameEvent[] = [];
  emit(type: string, payload: Record<string, unknown> = {}): void {
    this.queue.push({ type, ...payload });
  }
  of(type: string): GameEvent[] {
    return this.queue.filter((e) => e.type === type);
  }
  all(): readonly GameEvent[] {
    return this.queue;
  }
  clear(): void {
    this.queue.length = 0;
  }
}

export interface TickContext {
  tick: number;
  /** Fixed step in seconds. */
  dt: number;
  input: InputFrame;
  prevInput: InputFrame;
  rng: Rng;
  events: EventBus;
}

export interface System {
  name: string;
  update(world: World, ctx: TickContext): void;
}

export class World {
  private next = 1;
  private stores = new Map<string, Map<Entity, Record<string, unknown>>>();
  private alive = new Set<Entity>();

  create(components: Record<string, Record<string, unknown>> = {}): Entity {
    const e = this.next++;
    this.alive.add(e);
    for (const [type, value] of Object.entries(components)) this.set(e, type, value);
    return e;
  }

  destroy(e: Entity): void {
    if (!this.alive.delete(e)) return;
    for (const store of this.stores.values()) store.delete(e);
  }

  exists(e: Entity): boolean {
    return this.alive.has(e);
  }

  has(e: Entity, type: string): boolean {
    return this.stores.get(type)?.has(e) ?? false;
  }

  get<T extends Record<string, unknown>>(e: Entity, type: string): T | undefined {
    return this.stores.get(type)?.get(e) as T | undefined;
  }

  /** Like get, but throws when missing — for systems that queried for it. */
  need<T extends Record<string, unknown>>(e: Entity, type: string): T {
    const c = this.get<T>(e, type);
    if (!c) throw new Error(`entity ${e} has no ${type}`);
    return c;
  }

  set(e: Entity, type: string, value: Record<string, unknown>): void {
    if (!this.alive.has(e)) throw new Error(`entity ${e} does not exist`);
    let store = this.stores.get(type);
    if (!store) {
      store = new Map();
      this.stores.set(type, store);
    }
    store.set(e, value);
  }

  remove(e: Entity, type: string): void {
    this.stores.get(type)?.delete(e);
  }

  /** Entities having every listed component, ascending by id. */
  query(...types: string[]): Entity[] {
    if (types.length === 0) return [...this.alive].sort((a, b) => a - b);
    let smallest: Map<Entity, unknown> | undefined;
    for (const t of types) {
      const s = this.stores.get(t);
      if (!s) return [];
      if (!smallest || s.size < smallest.size) smallest = s;
    }
    const out: Entity[] = [];
    for (const e of smallest!.keys()) {
      if (types.every((t) => this.stores.get(t)!.has(e))) out.push(e);
    }
    return out.sort((a, b) => a - b);
  }

  count(): number {
    return this.alive.size;
  }

  /** Deep copy of everything. Cost is proportional to world size; the
   * Timeline calls this only at keyframes. */
  snapshot(): WorldState {
    const entities: WorldState['entities'] = [];
    for (const e of [...this.alive].sort((a, b) => a - b)) {
      const comps: Record<string, unknown> = {};
      for (const [type, store] of this.stores) {
        const c = store.get(e);
        if (c !== undefined) comps[type] = structuredClone(c);
      }
      entities.push([e, comps]);
    }
    return { next: this.next, entities };
  }

  restore(state: WorldState): void {
    this.stores.clear();
    this.alive.clear();
    this.next = state.next;
    for (const [e, comps] of state.entities) {
      this.alive.add(e);
      for (const [type, c] of Object.entries(comps)) {
        this.set(e, type, structuredClone(c as Record<string, unknown>));
      }
    }
  }

  /** Every component of an entity (for inspectors and tests). */
  components(e: Entity): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [type, store] of this.stores) {
      const c = store.get(e);
      if (c !== undefined) out[type] = c;
    }
    return out;
  }
}
