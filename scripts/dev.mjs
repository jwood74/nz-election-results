import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import national from '../netlify/functions/national.mjs';
import electorates from '../netlify/functions/electorates.mjs';

const root = resolve('public');
const routes = { '/api/national': national, '/api/electorates': electorates };
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript' };
createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (routes[url.pathname]) {
      const response = await routes[url.pathname](new Request(url, { method: req.method }));
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(await response.text());
      return;
    }
    const path = resolve(root, `.${decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)}`);
    if (!path.startsWith(`${root}/`)) { res.writeHead(403).end(); return; }
    const content = await readFile(path);
    res.writeHead(200, { 'Content-Type': types[extname(path)] || 'application/octet-stream' }).end(content);
  } catch { res.writeHead(404).end('Not found'); }
}).listen(8888, '127.0.0.1', () => console.log('Election dashboard: http://127.0.0.1:8888'));
