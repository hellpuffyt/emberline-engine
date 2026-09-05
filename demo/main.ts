/** Browser entry: wires the canvas, keyboard, audio and asset loader to the
 * Ember Run scene, and adds rewind (hold R), save/load (F5/F9), debug (`). */

import { Assets, browserBackend, FrameStats, GameLoop, Keyboard, SceneManager, WebAudio, saveGame, loadGame, Scene, type Manifest, type InputFrame } from '../src/index.js';
import { CanvasRenderer } from '../src/canvas.js';
import { level, VIEW, overlay } from './platformer.js';

async function main(): Promise<void> {
  const canvas = document.getElementById('game') as HTMLCanvasElement;
  const status = document.getElementById('status')!;
  const renderer = new CanvasRenderer(canvas, VIEW.w, VIEW.h);
  let manifest: Manifest = { images: {}, sounds: {}, data: {} };
  try {
    manifest = (await fetch('assets/manifest.json').then((r) => r.json())) as Manifest;
  } catch {
    /* no packed assets: the scene falls back to vector coins */
  }
  const assets = new Assets(manifest, browserBackend, 'assets/');
  status.textContent = 'loading…';
  await assets.load((n, t) => (status.textContent = `loading ${n}/${t}`));
  const audio = new WebAudio((name) => assets.sound(name));
  const scenes = new SceneManager({ renderer, audio, assets });
  scenes.push(level);

  const keyboard = new Keyboard(window);
  keyboard.captured.add('KeyR');
  const stats = new FrameStats();
  let debug = false;
  let rewinding = false;
  let message = '';
  let messageUntil = 0;
  const say = (m: string): void => {
    message = m;
    messageUntil = performance.now() + 1500;
  };

  window.addEventListener('keydown', (ev) => {
    const scene = scenes.current!;
    if (ev.code === 'Backquote') debug = !debug;
    if (ev.code === 'F5') {
      ev.preventDefault();
      localStorage.setItem('emberline-save', saveGame(scene.def.name, scene.timeline));
      say('saved');
    }
    if (ev.code === 'F9') {
      ev.preventDefault();
      const json = localStorage.getItem('emberline-save');
      if (!json) return say('no save');
      try {
        const { timeline } = loadGame(json, level.systems, level.timeline);
        const restored = Object.create(Scene.prototype) as Scene;
        Object.assign(restored, { def: level, services: scenes.services, world: timeline.world, timeline });
        scenes.adopt(restored);
        say(`loaded tick ${timeline.tick}`);
      } catch (e) {
        say(String(e));
      }
    }
  });

  const nextInput = (): InputFrame => {
    const f = keyboard.frame();
    rewinding = f.keys.includes('KeyR');
    return { keys: f.keys.filter((k) => k !== 'KeyR') };
  };

  const loop = new GameLoop(
    scenes.current!.timeline,
    nextInput,
    (alpha) => {
      const scene = scenes.current!;
      stats.mark(performance.now());
      scene.render(alpha);
      renderer.screenSpace();
      if (rewinding) {
        renderer.rect(0, VIEW.h - 22, VIEW.w, 22, 'rgba(120,40,160,0.7)');
        renderer.text(`◀◀ rewinding  tick ${scene.timeline.tick}  (history to ${scene.timeline.oldestTick})`, VIEW.w / 2, VIEW.h - 18, { size: 12, color: '#fff', align: 'center' });
      }
      if (performance.now() < messageUntil) renderer.text(message, VIEW.w / 2, VIEW.h - 40, { size: 14, color: '#ffd166', align: 'center' });
      if (debug) overlay(renderer, scene, [`hz ${scene.timeline.hz}  keyframe every ${(scene.def.timeline?.keyframeEvery ?? 60)}`]);
    },
  );

  // Rewind replaces simulation while R is held: 3 ticks back per frame.
  const origAdvance = loop.advance.bind(loop);
  loop.advance = (ms: number): number => {
    const scene = scenes.current!;
    // The loop was bound to the initial timeline; follow scene swaps (load).
    (loop as { timeline: unknown }).timeline = scene.timeline;
    nextInput();
    if (rewinding) {
      scene.timeline.rewind(3);
      stats.mark(performance.now());
      scene.render(0);
      renderer.screenSpace();
      renderer.rect(0, VIEW.h - 22, VIEW.w, 22, 'rgba(120,40,160,0.7)');
      renderer.text(`◀◀ rewinding  tick ${scene.timeline.tick}`, VIEW.w / 2, VIEW.h - 18, { size: 12, color: '#fff', align: 'center' });
      return 0;
    }
    return origAdvance(ms);
  };
  status.textContent = '';
  loop.start();
}

main().catch((e) => {
  document.getElementById('status')!.textContent = String(e);
  console.error(e);
});
