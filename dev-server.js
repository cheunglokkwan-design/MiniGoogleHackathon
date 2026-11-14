// Zero-dependency local server: serves the static site and /api/analyse.
// Usage: GEMINI_API_KEY=... npm run dev   (or put it in .env.local)
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';

for (const f of ['.env.local', '.env']) {
  if (!existsSync(f)) continue;
  for (const line of readFileSync(f, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}

const { default: analyse } = await import('./api/analyse.js');
const TYPES = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };
const PORT = process.env.PORT || 3000;

http.createServer(async (req, res) => {
  if (req.url.startsWith('/api/analyse')) {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    req.body = raw;
    res.status = (c) => { res.statusCode = c; return res; };
    res.json = (o) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(o)); };
    try { await analyse(req, res); } catch (e) { console.error(e); res.statusCode = 500; res.end('{"error":"internal"}'); }
    return;
  }
  const path = normalize(req.url.split('?')[0] === '/' ? '/index.html' : req.url.split('?')[0]).replace(/^(\.\.[/\\])+/, '');
  if (/^\/(api|test|node_modules|\.)/.test(path) || path.includes('.env')) { res.statusCode = 404; return res.end(); }
  try {
    const data = await readFile(join(process.cwd(), path));
    res.setHeader('Content-Type', TYPES[extname(path)] || 'application/octet-stream');
    res.end(data);
  } catch { res.statusCode = 404; res.end('Not found'); }
}).listen(PORT, () => console.log(`ScamShield → http://localhost:${PORT}${process.env.GEMINI_API_KEY ? '' : '  (no GEMINI_API_KEY: rule engine only)'}`));
