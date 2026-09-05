/** Debug overlay and inspector: frame timing, tick, entity count, timeline
 * position, and a text dump of any entity. Draws in screen space through
 * the normal Renderer so it works on every backend. */

import type { Entity, World } from './ecs.js';
import { canonical } from './math.js';
import type { Renderer } from './render.js';
import type { Timeline } from './timeline.js';

export class FrameStats {
  private samples: number[] = [];
  private last?: number;
  fps = 0;
  frameMs = 0;

  /** Call once per rendered frame with a monotonic time in ms. */
  mark(now: number): void {
    if (this.last !== undefined) {
      const d = now - this.last;
      this.samples.push(d);
      if (this.samples.length > 60) this.samples.shift();
      const avg = this.samples.reduce((a, b) => a + b, 0) / this.samples.length;
      this.frameMs = avg;
      this.fps = avg > 0 ? 1000 / avg : 0;
    }
    this.last = now;
  }
}

export interface OverlayInfo {
  stats?: FrameStats;
  timeline: Timeline;
  world: World;
  extra?: string[];
}

export function drawOverlay(r: Renderer, info: OverlayInfo): void {
  r.screenSpace();
  const lines = [
    info.stats ? `${info.stats.fps.toFixed(0)} fps  ${info.stats.frameMs.toFixed(1)} ms` : 'headless',
    `tick ${info.timeline.tick}  (history from ${info.timeline.oldestTick})`,
    `entities ${info.world.count()}`,
    `hash ${info.timeline.hash().toString(16).padStart(8, '0')}`,
    ...(info.extra ?? []),
  ];
  const w = 260;
  r.rect(8, 8, w, 8 + lines.length * 16, 'rgba(0,0,0,0.6)');
  lines.forEach((l, i) => r.text(l, 14, 12 + i * 16, { size: 12, color: '#9f9', font: 'ui-monospace, monospace' }));
}

/** Multi-line dump of one entity's components. */
export function inspect(world: World, e: Entity): string[] {
  if (!world.exists(e)) return [`entity ${e}: (destroyed)`];
  const out = [`entity ${e}`];
  for (const [type, c] of Object.entries(world.components(e))) out.push(`  ${type}: ${canonical(c)}`);
  return out;
}
