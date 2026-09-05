// Runs every compiled test file with Node's built-in runner. Portable across
// Node 20–24 and shells (no glob expansion, no directory-argument quirks).
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
const files = readdirSync('dist/test').filter((f) => f.endsWith('.test.js')).map((f) => `dist/test/${f}`);
const r = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' });
process.exit(r.status ?? 1);
