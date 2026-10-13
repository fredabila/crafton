/* Local server that mimics Vercel: static files from public/ with clean URLs, the same
 * rewrites as vercel.json, and the API handler. Usage: npm run dev (PORT defaults to 3000). */
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { handle } from '../server/app.js';

const PUBLIC = path.resolve('public');
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif', '.json': 'application/json', '.ico': 'image/x-icon', '.txt': 'text/plain' };
const dynamic = (p) => p.startsWith('/api/') || p.startsWith('/products/') || p === '/sitemap.xml' || p === '/robots.txt';

async function serveStatic(pathname, res) {
  let rel = decodeURIComponent(pathname);
  if (rel.endsWith('.html')) { res.writeHead(308, { location: rel.replace(/(index)?\.html$/, '') || '/' }); return res.end(); }
  if (rel.endsWith('/')) rel += 'index';
  const candidates = path.extname(rel) ? [rel] : [`${rel}.html`, `${rel}/index.html`];
  for (const c of candidates) {
    const file = path.join(PUBLIC, c);
    if (!file.startsWith(PUBLIC)) break;
    try {
      const data = await fs.readFile(file);
      res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
      return res.end(data);
    } catch { /* try next */ }
  }
  res.writeHead(404, { 'content-type': 'text/html' });
  res.end(await fs.readFile(path.join(PUBLIC, '404.html')).catch(() => 'Not found'));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (!dynamic(url.pathname)) return serveStatic(url.pathname, res);
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = chunks.length && !['GET', 'HEAD'].includes(req.method) ? Buffer.concat(chunks) : undefined;
  const response = await handle(new Request(url, { method: req.method, headers: req.headers, body }));
  const headers = {};
  response.headers.forEach((v, k) => { headers[k] = v; });
  res.writeHead(response.status, headers);
  res.end(Buffer.from(await response.arrayBuffer()));
});

const port = Number(process.env.PORT) || 3000;
server.listen(port, () => console.log(`Craf7ton running at http://localhost:${port}  (admin: /admin)`));
