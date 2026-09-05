// Tiny static server for the demo (no dependencies): node tools/serve.mjs [port]
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';

const root = resolve('.');
const port = Number(process.argv[2] ?? 8000);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.wav': 'audio/wav', '.css': 'text/css', '.map': 'application/json' };

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  let path = decodeURIComponent(url.pathname);
  if (path === '/') path = '/demo/index.html';
  const file = normalize(join(root, path));
  if (!file.startsWith(root + sep)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const s = await stat(file);
    if (!s.isFile()) throw new Error('dir');
    res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404).end('not found');
  }
}).listen(port, () => console.log(`Emberline demo: http://localhost:${port}/`));
