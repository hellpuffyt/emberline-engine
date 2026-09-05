// Project lint without a dependency: engine sources must be free of
// nondeterminism (Date.now, Math.random, performance.now) and the DOM must
// only be touched in the files that own it.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const banned = [/Math\.random/, /Date\.now/, /performance\.now/, /new Date\(/];
const domFiles = new Set(['canvas.ts', 'assets.ts', 'audio.ts', 'input.ts', 'timeline.ts']);
let bad = 0;
for (const name of readdirSync('src')) {
  const text = readFileSync(join('src', name), 'utf8');
  for (const re of banned) {
    if (re.test(text) && !(name === 'save.ts' && re.source.includes('Date'))) {
      console.error(`${name}: uses ${re.source} — engine code must be deterministic`);
      bad++;
    }
  }
  if (!domFiles.has(name) && /\b(document|window|HTMLCanvasElement|requestAnimationFrame)\b/.test(text)) {
    console.error(`${name}: touches the DOM outside canvas/assets/audio/input/timeline`);
    bad++;
  }
}
if (bad) process.exit(1);
console.log('lint ok');
