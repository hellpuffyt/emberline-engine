/** Scripting: behaviours are named functions attached to entities through
 * a `script` component that holds only JSON state. Because the code lives
 * in a registry and the state lives in the world, scripted entities
 * snapshot, rewind and save like everything else. */

import type { Entity, System, TickContext, World } from './ecs.js';

export interface ScriptComponent extends Record<string, unknown> {
  /** Registered behaviour name. */
  name: string;
  /** Free-form persistent state owned by the behaviour. */
  state: Record<string, unknown>;
}

export type Behaviour = (e: Entity, state: Record<string, unknown>, world: World, ctx: TickContext) => void;

export class Behaviours {
  private table = new Map<string, Behaviour>();

  register(name: string, fn: Behaviour): this {
    this.table.set(name, fn);
    return this;
  }

  has(name: string): boolean {
    return this.table.has(name);
  }

  /** A system that runs every scripted entity's behaviour, in entity order. */
  system(): System {
    return {
      name: 'scripts',
      update: (world, ctx) => {
        for (const e of world.query('script')) {
          const s = world.need<ScriptComponent>(e, 'script');
          const fn = this.table.get(s.name);
          if (!fn) throw new Error(`entity ${e} uses unregistered behaviour "${s.name}"`);
          fn(e, s.state, world, ctx);
        }
      },
    };
  }
}

/** Helper to attach a behaviour with initial state. */
export function script(name: string, state: Record<string, unknown> = {}): ScriptComponent {
  return { name, state };
}
