// The demo dev server: loopback only, contained to the repo, and not
// killable by a malformed URL.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { request } from 'node:http';

function get(port: number, path: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path }, (res) => {
      res.resume();
      resolve(res.statusCode ?? 0);
    });
    req.on('error', reject);
    req.end();
  });
}

test('demo server survives malformed percent-encoding and refuses traversal', async () => {
  const port = 18000 + Math.floor(Math.random() * 2000);
  const child = spawn(process.execPath, ['tools/serve.mjs', String(port)], { stdio: ['ignore', 'pipe', 'inherit'] });
  try {
    await new Promise<void>((resolve) => child.stdout.once('data', () => resolve()));
    assert.equal(await get(port, '/%E0%A4%A'), 400);
    assert.equal(await get(port, '/'), 302); // still alive, sent to /demo/index.html
    // The page loads assets relative to its own URL; they must exist there.
    assert.equal(await get(port, '/demo/index.html'), 200);
    assert.equal(await get(port, '/demo/assets/manifest.json'), 200);
    assert.notEqual(await get(port, '/../../../../etc/hosts'), 200);
  } finally {
    child.kill();
  }
});
