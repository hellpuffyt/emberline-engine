/** Save files are Timeline states: one keyframe plus the input log since.
 * Loading replays the inputs through the same systems, so a save is also a
 * complete, verifiable record of how the player got there. */

import type { System } from './ecs.js';
import { World } from './ecs.js';
import { Timeline, type TimelineOptions, type TimelineState } from './timeline.js';

export interface SaveFile {
  format: 'emberline-save';
  version: 1;
  scene: string;
  savedAt: string;
  hash: number;
  timeline: TimelineState;
  meta?: Record<string, unknown>;
}

export function saveGame(scene: string, timeline: Timeline, meta?: Record<string, unknown>): string {
  const file: SaveFile = {
    format: 'emberline-save',
    version: 1,
    scene,
    savedAt: new Date().toISOString(),
    hash: timeline.hash(),
    timeline: timeline.serialize(),
    ...(meta ? { meta } : {}),
  };
  return JSON.stringify(file);
}

export function parseSave(json: string): SaveFile {
  let file: SaveFile;
  try {
    file = JSON.parse(json) as SaveFile;
  } catch {
    throw new Error('save file is not valid JSON');
  }
  if (file?.format !== 'emberline-save' || file.version !== 1 || !file.timeline?.keyframe) {
    throw new Error('not an Emberline save file');
  }
  return file;
}

/** Rebuilds the world by replaying; throws if the replay does not reach the
 * recorded hash (systems changed, or the file was edited). */
export function loadGame(json: string, systems: System[], opts?: TimelineOptions): { file: SaveFile; world: World; timeline: Timeline } {
  const file = parseSave(json);
  const world = new World();
  const timeline = Timeline.deserialize(file.timeline, world, systems, opts);
  if (timeline.hash() !== file.hash) {
    throw new Error(`save replay diverged: expected hash ${file.hash}, got ${timeline.hash()}`);
  }
  return { file, world, timeline };
}
