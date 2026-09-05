/** Scenes own a world, its systems and its timeline; the Engine keeps a
 * stack of them (menu → level → pause overlay) and forwards ticks and
 * renders to the top. */

import { type System, World } from './ecs.js';
import type { InputFrame } from './input.js';
import type { Renderer } from './render.js';
import { Timeline, type TimelineOptions } from './timeline.js';
import type { Audio } from './audio.js';
import type { Assets } from './assets.js';

export interface EngineServices {
  renderer: Renderer;
  audio: Audio;
  assets: Assets;
}

export interface SceneDef {
  name: string;
  systems: System[];
  /** Populates the fresh world. */
  setup(world: World, services: EngineServices): void;
  /** Draws the world; `alpha` is the fraction of the next tick elapsed. */
  render(world: World, r: Renderer, alpha: number, services: EngineServices): void;
  /** Optional per-tick hook after systems (e.g. play sounds from events). */
  afterTick?(scene: Scene, services: EngineServices): void;
  timeline?: TimelineOptions;
}

export class Scene {
  readonly world = new World();
  readonly timeline: Timeline;
  constructor(
    readonly def: SceneDef,
    readonly services: EngineServices,
  ) {
    def.setup(this.world, services);
    this.timeline = new Timeline(this.world, def.systems, def.timeline);
  }
  step(input: InputFrame): void {
    this.timeline.step(input);
    this.def.afterTick?.(this, this.services);
  }
  render(alpha: number): void {
    this.def.render(this.world, this.services.renderer, alpha, this.services);
  }
}

export class SceneManager {
  private stack: Scene[] = [];
  constructor(readonly services: EngineServices) {}

  get current(): Scene | undefined {
    return this.stack[this.stack.length - 1];
  }
  get depth(): number {
    return this.stack.length;
  }
  push(def: SceneDef): Scene {
    const s = new Scene(def, this.services);
    this.stack.push(s);
    return s;
  }
  pop(): Scene | undefined {
    return this.stack.pop();
  }
  replace(def: SceneDef): Scene {
    this.stack.pop();
    return this.push(def);
  }
  /** Swaps the current scene for a restored one (load game). */
  adopt(scene: Scene): void {
    this.stack.pop();
    this.stack.push(scene);
  }
  step(input: InputFrame): void {
    this.current?.step(input);
  }
  render(alpha: number): void {
    this.current?.render(alpha);
  }
}
