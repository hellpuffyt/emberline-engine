/** The Timeline is Emberline's core idea: the simulation is a pure function
 * of (initial state, seed, input frames). It records every input frame,
 * keeps periodic keyframes, and can rewind to any tick by restoring the
 * nearest keyframe and replaying inputs. Save files are the same data. */

import { EventBus, type System, type TickContext, type World, type WorldState } from './ecs.js';
import { EMPTY_FRAME, type InputFrame } from './input.js';
import { Rng, hashState } from './math.js';

export interface TimelineOptions {
  hz?: number;
  keyframeEvery?: number;
  seed?: number;
  /** Bound on kept history (ticks). Older keyframes/inputs are dropped. */
  maxHistory?: number;
}

export interface Keyframe {
  tick: number;
  world: WorldState;
  rng: number;
}

export interface TimelineState {
  hz: number;
  seed: number;
  keyframe: Keyframe;
  inputs: InputFrame[]; // inputs[i] is the frame applied at keyframe.tick + i
}

export class Timeline {
  readonly hz: number;
  readonly dt: number;
  readonly seed: number;
  private keyframeEvery: number;
  private maxHistory: number;
  private _tick = 0;
  private inputs: InputFrame[] = [];
  private inputsBase = 0; // tick of inputs[0]
  private keyframes: Keyframe[] = [];
  private rng: Rng;
  private prevInput: InputFrame = EMPTY_FRAME;
  readonly events = new EventBus();
  /** Systems run in this order every tick. */
  systems: System[];

  constructor(
    readonly world: World,
    systems: System[],
    opts: TimelineOptions = {},
  ) {
    this.hz = opts.hz ?? 60;
    this.dt = 1 / this.hz;
    this.seed = opts.seed ?? 1;
    this.keyframeEvery = opts.keyframeEvery ?? 60;
    this.maxHistory = opts.maxHistory ?? 60 * 60 * 5;
    this.systems = systems;
    this.rng = new Rng(this.seed);
    this.keyframes.push(this.keyframeNow());
  }

  get tick(): number {
    return this._tick;
  }

  /** Advances one fixed step with the given input. */
  step(input: InputFrame): void {
    this.inputs.push(input);
    this.simulate(input);
    if (this._tick % this.keyframeEvery === 0) this.keyframes.push(this.keyframeNow());
    this.trim();
  }

  private simulate(input: InputFrame): void {
    const ctx: TickContext = {
      tick: this._tick,
      dt: this.dt,
      input,
      prevInput: this.prevInput,
      rng: this.rng,
      events: this.events,
    };
    this.events.clear();
    for (const s of this.systems) s.update(this.world, ctx);
    this.prevInput = input;
    this._tick++;
  }

  private keyframeNow(): Keyframe {
    return { tick: this._tick, world: this.world.snapshot(), rng: this.rng.state() };
  }

  private trim(): void {
    const oldest = this._tick - this.maxHistory;
    if (oldest <= this.inputsBase) return;
    // Keep the newest keyframe at or before `oldest` as the new base.
    let base = 0;
    for (let i = 0; i < this.keyframes.length; i++) if (this.keyframes[i].tick <= oldest) base = i;
    const baseTick = this.keyframes[base].tick;
    this.keyframes.splice(0, base);
    this.inputs.splice(0, baseTick - this.inputsBase);
    this.inputsBase = baseTick;
  }

  /** Earliest tick that can be rewound to. */
  get oldestTick(): number {
    return this.keyframes[0].tick;
  }

  /** Rewinds `ticks` steps (clamped to history) and forgets everything
   * after the new position, so play continues on a new branch. */
  rewind(ticks: number): void {
    this.seekTo(Math.max(this.oldestTick, this._tick - ticks), true);
  }

  /** Jumps to any recorded tick without discarding history (scrubbing). */
  seek(tick: number): void {
    this.seekTo(Math.min(Math.max(this.oldestTick, tick), this.inputsBase + this.inputs.length), false);
  }

  private seekTo(target: number, truncate: boolean): void {
    let kf = this.keyframes[0];
    for (const k of this.keyframes) if (k.tick <= target) kf = k;
    this.world.restore(kf.world);
    this.rng.restore(kf.rng);
    this._tick = kf.tick;
    this.prevInput = kf.tick > this.inputsBase ? this.inputs[kf.tick - this.inputsBase - 1] : EMPTY_FRAME;
    while (this._tick < target) this.simulate(this.inputs[this._tick - this.inputsBase]);
    if (truncate) {
      this.inputs.length = target - this.inputsBase;
      this.keyframes = this.keyframes.filter((k) => k.tick <= target);
    }
  }

  /** Input recorded at a tick (for scrubbers/inspectors). */
  inputAt(tick: number): InputFrame | undefined {
    return this.inputs[tick - this.inputsBase];
  }

  /** Fingerprint of the complete simulation state. */
  hash(): number {
    return hashState({ tick: this._tick, rng: this.rng.state(), world: this.world.snapshot() });
  }

  /** Everything needed to reproduce the current state from the oldest
   * keyframe: a save file. */
  serialize(): TimelineState {
    return {
      hz: this.hz,
      seed: this.seed,
      keyframe: structuredClone(this.keyframes[0]),
      inputs: structuredClone(this.inputs.slice(0, this._tick - this.inputsBase)),
    };
  }

  /** Rebuilds a timeline by replaying a saved state. */
  static deserialize(state: TimelineState, world: World, systems: System[], opts: TimelineOptions = {}): Timeline {
    const t = new Timeline(world, systems, { ...opts, hz: state.hz, seed: state.seed });
    t.world.restore(state.keyframe.world);
    t.rng.restore(state.keyframe.rng);
    t._tick = state.keyframe.tick;
    t.inputsBase = state.keyframe.tick;
    t.keyframes = [structuredClone(state.keyframe)];
    for (const f of state.inputs) t.step(f);
    return t;
  }
}

/** Fixed-timestep accumulator loop with render interpolation. Drive it from
 * requestAnimationFrame in a browser or call `advance(ms)` directly. */
export class GameLoop {
  private acc = 0;
  private last?: number;
  private raf?: number;
  /** Cap simulated steps per frame to avoid a spiral of death after a stall. */
  maxSteps = 8;
  running = false;

  constructor(
    readonly timeline: Timeline,
    private readonly nextInput: () => InputFrame,
    private readonly render: (alpha: number) => void,
  ) {}

  /** Simulates as many fixed steps as `elapsedMs` covers, then renders. */
  advance(elapsedMs: number): number {
    this.acc += Math.min(elapsedMs, 250);
    const stepMs = 1000 / this.timeline.hz;
    let steps = 0;
    while (this.acc >= stepMs && steps < this.maxSteps) {
      this.timeline.step(this.nextInput());
      this.acc -= stepMs;
      steps++;
    }
    if (steps === this.maxSteps) this.acc = 0;
    this.render(this.acc / stepMs);
    return steps;
  }

  start(raf: (cb: (t: number) => void) => number = globalThis.requestAnimationFrame): void {
    this.running = true;
    const frame = (t: number): void => {
      if (!this.running) return;
      const elapsed = this.last === undefined ? 1000 / this.timeline.hz : t - this.last;
      this.last = t;
      this.advance(elapsed);
      this.raf = raf(frame);
    };
    this.raf = raf(frame);
  }

  stop(): void {
    this.running = false;
    this.last = undefined;
    if (this.raf !== undefined && typeof globalThis.cancelAnimationFrame === 'function') {
      globalThis.cancelAnimationFrame(this.raf);
    }
  }
}
