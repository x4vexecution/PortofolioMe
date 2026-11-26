'use strict';
// Zero-dependency local dev server. Mirrors vercel.json (rewrites/redirects) and mounts /api/rooms.
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '127.0.0.1';

// tiny .env loader (no dotenv dependency)
try {
  fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/).forEach(line => {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  });
} catch (_) {}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.gif': 'image/gif', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json', '.wasm': 'application/wasm', '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4', '.webm': 'video/webm'
};

let vercel = { rewrites: [], redirects: [] };
try { vercel = Object.assign(vercel, JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'))); } catch (_) {}

const BLOCKED = /^\/(?:\.|node_modules\/|server\.js$|package(?:-lock)?\.json$|api\/|config\/|legacy\/)/;

function send(res, status, body, headers) {
  res.writeHead(status, Object.assign({ 'Cache-Control': 'no-store' }, headers));
  res.end(body);
}

let apiWarned = false;
async function handleApi(req, res, pathname) {
  const name = pathname.replace(/^\/api\//, '').replace(/\/$/, '');
  const file = path.join(ROOT, 'api', name + '.js');
  if (!/^[\w-]+$/.test(name) || !fs.existsSync(file)) return send(res, 404, JSON.stringify({ error: 'Not found' }), { 'Content-Type': 'application/json' });
  const jsonErr = (code, msg) => send(res, code, JSON.stringify({ error: msg }), { 'Content-Type': 'application/json' });
  if (name === 'rooms' && !(process.env.REDIS_HOST && process.env.REDIS_PORT && process.env.REDIS_PASSWORD)) {
    if (!apiWarned) { apiWarned = true; console.warn('[api] REDIS_HOST/REDIS_PORT/REDIS_PASSWORD not set -> online game rooms disabled (everything else works). Copy .env.example to .env to enable.'); }
    return jsonErr(503, 'Online rooms are disabled: Redis is not configured.');
  }
  let handler;
  try { handler = require(file); } catch (e) {
    if (!apiWarned) { apiWarned = true; console.warn('[api] cannot load ' + name + ': ' + e.message + ' (run "npm install")'); }
    return jsonErr(503, 'API unavailable: ' + e.message);
  }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString('utf8');
  try { req.body = raw && /json/i.test(req.headers['content-type'] || '') ? JSON.parse(raw) : raw; }
  catch (_) { return jsonErr(400, 'Invalid JSON.'); }
  res.status = code => { res.statusCode = code; return res; };
  res.json = obj => { if (!res.getHeader('Content-Type')) res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(obj)); return res; };
  try { await handler(req, res); } catch (e) { console.error('[api] ' + e.message); if (!res.headersSent) jsonErr(500, 'Server error.'); }
}

function resolveFile(pathname) {
  let p;
  try { p = decodeURIComponent(pathname); } catch (_) { return null; }
  if (p.includes('\0')) return null;
  let file = path.normalize(path.join(ROOT, p));
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) return null;
  let st;
  try { st = fs.statSync(file); } catch (_) { st = null; }
  if (st && st.isDirectory()) { file = path.join(file, 'index.html'); try { st = fs.statSync(file); } catch (_) { st = null; } }
  return st && st.isFile() ? file : null;
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  let pathname = url.pathname;

  if (pathname.startsWith('/api/')) return handleApi(req, res, pathname);
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method Not Allowed', { Allow: 'GET, HEAD' });

  for (const r of vercel.redirects) if (r.source === pathname) return send(res, r.permanent ? 308 : 307, '', { Location: r.destination });
  for (const r of vercel.rewrites) if (r.source === pathname) { pathname = r.destination; break; }

  // directory without trailing slash -> add it (keeps relative/absolute asset URLs working)
  const dir = path.join(ROOT, pathname);
  if (!pathname.endsWith('/') && dir.startsWith(ROOT) && fs.existsSync(dir) && fs.statSync(dir).isDirectory())
    return send(res, 308, '', { Location: pathname + '/' + url.search });

  if (BLOCKED.test(pathname)) return send(res, 404, 'Not Found');
  const file = resolveFile(pathname);
  if (!file) {
    const nf = path.join(ROOT, 'card', '404.html');
    return send(res, 404, fs.existsSync(nf) && pathname.startsWith('/card/') ? fs.readFileSync(nf) : '404 Not Found', { 'Content-Type': 'text/html; charset=utf-8' });
  }
  const ext = path.extname(file).toLowerCase();
  const headers = { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-cache' };
  const stat = fs.statSync(file);
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
  if (range && (range[1] || range[2])) {
    let start = range[1] ? Number(range[1]) : stat.size - Number(range[2]);
    let end = range[1] && range[2] ? Number(range[2]) : stat.size - 1;
    end = Math.min(end, stat.size - 1);
    if (start > end || start < 0) return send(res, 416, '', { 'Content-Range': 'bytes */' + stat.size });
    res.writeHead(206, Object.assign(headers, { 'Content-Range': `bytes ${start}-${end}/${stat.size}`, 'Accept-Ranges': 'bytes', 'Content-Length': end - start + 1 }));
    return req.method === 'HEAD' ? res.end() : fs.createReadStream(file, { start, end }).pipe(res);
  }
  headers['Content-Length'] = stat.size; headers['Accept-Ranges'] = 'bytes';
  res.writeHead(200, headers);
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(file).on('error', () => res.destroy()).pipe(res);
});

server.on('error', e => {
  if (e.code === 'EADDRINUSE') console.error(`Port ${PORT} is in use. Try: PORT=${PORT + 1} npm run dev`);
  else console.error(e.message);
  process.exit(1);
});
server.listen(PORT, HOST, () => {
  console.log(`\n  Local:  http://localhost:${PORT}/\n  Card:   http://localhost:${PORT}/card/\n`);
});
