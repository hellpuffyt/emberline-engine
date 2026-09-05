/** Input as data. A frame is the complete input state for one simulation
 * tick — sorted, serialisable, comparable — which is what lets the Timeline
 * record and replay it. Sources (keyboard, gamepad, scripted) produce
 * frames; systems only ever see frames. */

export interface InputFrame {
  /** Keys held this tick, sorted (KeyboardEvent.code values, e.g. "ArrowLeft"). */
  keys: string[];
  /** Pointer position in world/canvas pixels and button state, if any. */
  pointer?: { x: number; y: number; down: boolean };
}

export const EMPTY_FRAME: InputFrame = { keys: [] };

export function held(frame: InputFrame, key: string): boolean {
  return frame.keys.includes(key);
}

/** True on the first tick a key is down. */
export function pressed(frame: InputFrame, prev: InputFrame, key: string): boolean {
  return held(frame, key) && !held(prev, key);
}

export function released(frame: InputFrame, prev: InputFrame, key: string): boolean {
  return !held(frame, key) && held(prev, key);
}

export function frameEquals(a: InputFrame, b: InputFrame): boolean {
  if (a.keys.length !== b.keys.length || a.keys.some((k, i) => k !== b.keys[i])) return false;
  if (!a.pointer !== !b.pointer) return false;
  if (a.pointer && b.pointer) {
    return a.pointer.x === b.pointer.x && a.pointer.y === b.pointer.y && a.pointer.down === b.pointer.down;
  }
  return true;
}

/** Minimal event-target shape so this file has no DOM type dependency. */
export interface KeyEventTarget {
  addEventListener(type: string, listener: (ev: { code: string; preventDefault(): void }) => void): void;
}

/** Keyboard source: attach to `window`, call `frame()` once per tick.
 * Keys pressed and released between two ticks still register for one tick
 * (the "sticky press" rule), so fast taps are never lost. */
export class Keyboard {
  private down = new Set<string>();
  private tapped = new Set<string>();
  readonly captured = new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space']);

  constructor(target: KeyEventTarget) {
    target.addEventListener('keydown', (ev) => {
      if (this.captured.has(ev.code)) ev.preventDefault();
      this.down.add(ev.code);
      this.tapped.add(ev.code);
    });
    target.addEventListener('keyup', (ev) => {
      this.down.delete(ev.code);
    });
    target.addEventListener('blur', () => this.down.clear());
  }

  frame(): InputFrame {
    const keys = [...new Set([...this.down, ...this.tapped])].sort();
    this.tapped.clear();
    return { keys };
  }
}

/** A scripted source for tests and demos: a list of (untilTick, keys). */
export class ScriptedInput {
  constructor(private script: Array<{ until: number; keys: string[] }>) {}
  frame(tick: number): InputFrame {
    for (const s of this.script) if (tick < s.until) return { keys: [...s.keys].sort() };
    return EMPTY_FRAME;
  }
}
