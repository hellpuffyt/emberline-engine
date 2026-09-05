// Asset packer: walks a directory, reads PNG headers, writes manifest.json.
//   node tools/pack.mjs demo/assets demo/assets/manifest.json
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { packManifest } from '../dist/src/assets.js';

const [dir, out] = process.argv.slice(2);
if (!dir || !out) {
  console.error('usage: pack.mjs <assets-dir> <manifest.json>');
  process.exit(2);
}
const files = [];
const walk = (d) => {
  for (const name of readdirSync(d).sort()) {
    const p = join(d, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (!p.endsWith('manifest.json')) files.push({ path: relative(dir, p).replace(/\\/g, '/'), bytes: new Uint8Array(readFileSync(p)) });
  }
};
walk(dir);
const manifest = packManifest(files);
writeFileSync(out, JSON.stringify(manifest, null, 2) + '\n');
const n = (o) => Object.keys(o).length;
console.log(`wrote ${out}: ${n(manifest.images)} images, ${n(manifest.sounds)} sounds, ${n(manifest.data)} data files`);
