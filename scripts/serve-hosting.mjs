// خادم محلي صغير لمجلد hosting/ يحاكي firebase.json: cleanUrls، التحويلات، إعادة كتابة اللوحة، الترويسات (ومنها CSP)، وصفحة 404.
// الاستعمال: bash scripts/build-hosting.sh && node scripts/serve-hosting.mjs 4810
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cfg = JSON.parse(fs.readFileSync(path.join(root, 'firebase.json'), 'utf8')).hosting;
const PUB = path.join(root, cfg.public);
const port = Number(process.argv[2] || 4810);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml', '.webp': 'image/webp', '.ico': 'image/x-icon',
};
// صيغة أنماط Firebase: ** أي شيء، * داخل جزء واحد، @(a|b) بدائل
const glob = (g) => {
  let r = '';
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === '*' && g[i + 1] === '*') { r += '.*'; i++; }
    else if (c === '*') r += '[^/]*';
    else if (c === '@' && g[i + 1] === '(') { r += '('; i++; }
    else if ('()|'.includes(c)) r += c;
    else r += c.replace(/[.+?^${}[\]\\]/g, '\\$&');
  }
  return new RegExp(`^${r}$`);
};
const isFile = (p) => fs.existsSync(p) && fs.statSync(p).isFile();

function headersFor(urlPath) {
  const out = {};
  for (const rule of cfg.headers || []) if (glob(rule.source).test(urlPath)) for (const h of rule.headers) out[h.key] = h.value;
  return out;
}

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  let p = decodeURIComponent(url.pathname);
  for (const r of cfg.redirects || []) {
    if (glob(r.source).test(p)) { res.writeHead(r.type || 301, { Location: r.destination }); return res.end(); }
  }
  if (cfg.cleanUrls && p.endsWith('.html')) { res.writeHead(301, { Location: p.slice(0, -5).replace(/\/index$/, '/') }); return res.end(); }
  let file = path.join(PUB, p);
  if (!file.startsWith(PUB)) { res.writeHead(400); return res.end(); }
  let status = 200;
  if (!isFile(file)) {
    if (isFile(`${file}.html`)) file = `${file}.html`;
    else if (isFile(path.join(file, 'index.html'))) file = path.join(file, 'index.html');
    else {
      const rw = (cfg.rewrites || []).find((r) => glob(r.source).test(p));
      if (rw) file = path.join(PUB, rw.destination);
      else { file = path.join(PUB, '404.html'); status = 404; }
    }
  }
  if (!isFile(file)) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('404'); }
  const h = { ...headersFor(p), 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' };
  res.writeHead(status, h);
  fs.createReadStream(file).pipe(res);
}).listen(port, () => console.log(`hosting/ على http://localhost:${port}`));
