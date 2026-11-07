// بوابة محلية على 127.0.0.1 تقدّم للوحة نفس واجهات Supabase التي تستعملها أونلاين:
//   /rest/v1/*      ← PostgREST للحساب المفتوح (البيانات والدوال)
//   /auth/v1/*      ← جلسة الحساب المحلي (تحديث الرمز، المستخدم، الخروج)
//   /storage/v1/*   ← الصور في مجلد media/ للحساب
//   /functions/v1/* ← غير متاحة بلا إنترنت
//   /local/*        ← إدارة الحسابات (قائمة، إنشاء، فتح، إغلاق، نسخ احتياطي، المجلد)
//   /               ← لوحة التحكم نفسها (مبنية لوضع الحاسوب)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { verifyJwt } from './jwt.mjs';

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json', '.txt': 'text/plain; charset=utf-8' };
const MAX_BODY = 25 * 1024 * 1024;

const send = (res, status, body, headers = {}) => {
  const isBuf = Buffer.isBuffer(body);
  const data = isBuf ? body : typeof body === 'string' ? body : JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': isBuf ? 'application/octet-stream' : typeof body === 'string' ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8', ...headers });
  res.end(data);
};
const readBody = (req) => new Promise((resolve, reject) => {
  const chunks = []; let n = 0;
  req.on('data', (c) => { n += c.length; if (n > MAX_BODY) { reject(new Error('الملف أكبر من المسموح.')); req.destroy(); } else chunks.push(c); });
  req.on('end', () => resolve(Buffer.concat(chunks)));
  req.on('error', reject);
});
const json = async (req) => { const b = await readBody(req); try { return b.length ? JSON.parse(b.toString('utf8')) : {}; } catch { return {}; } };
const safeRel = (p) => {
  const parts = decodeURIComponent(p).split('/').filter(Boolean);
  if (!parts.length || parts.some((x) => x === '..' || x === '.' || !/^[\w.\-]+$/.test(x))) return null;
  return parts.join('/');
};

/**
 * @param {import('./backend.mjs').Backend} backend
 * @param {{ adminDir: string, port: number, host?: string, desktop?: { chooseFolder?: () => Promise<string|null>, openPath?: (p: string) => void } }} o
 */
export function createGateway(backend, o) {
  const adminDir = o.adminDir;
  const authed = (req) => {
    const h = req.headers.authorization || '';
    const p = verifyJwt(h.replace(/^Bearer\s+/i, ''), backend.secret);
    return p && p.role === 'authenticated' && backend.cur && p.acc === backend.cur.account.id ? p : null;
  };

  const server = http.createServer(async (req, res) => {
    // محلي فقط: لا طلبات من مواقع أخرى
    const origin = req.headers.origin;
    if (origin && origin !== `http://127.0.0.1:${o.port}` && origin !== `http://localhost:${o.port}`) return send(res, 403, { error: 'forbidden' });
    const url = new URL(req.url, `http://127.0.0.1:${o.port}`);
    const p = url.pathname;
    try {
      // ---------------------------------------------------------------- البيانات
      if (p.startsWith('/rest/v1')) {
        if (!backend.cur?.restPort) return send(res, 503, { message: 'افتح حساب الشركة أولاً.' });
        // جلسة حساب آخر على نفس الحاسوب لا تصل لبيانات الحساب المفتوح
        const tok = verifyJwt((req.headers.authorization || '').replace(/^Bearer\s+/i, ''), backend.secret);
        if (tok && tok.role === 'authenticated' && tok.acc !== backend.cur.account.id) return send(res, 401, { message: 'انتهت الجلسة، افتح الحساب من جديد.', code: 'PGRST301' });
        return proxy(req, res, backend.cur.restPort, p.slice('/rest/v1'.length) + url.search);
      }
      // ---------------------------------------------------------------- الجلسة
      if (p === '/auth/v1/token') {
        const b = await json(req);
        if (url.searchParams.get('grant_type') === 'refresh_token') {
          const t = verifyJwt(b.refresh_token, backend.secret);
          if (!t || t.typ !== 'refresh' || !backend.cur || t.acc !== backend.cur.account.id) return send(res, 400, { error: 'invalid_grant', error_description: 'انتهت الجلسة، افتح الحساب من جديد.' });
          return send(res, 200, backend.session());
        }
        return send(res, 400, { error: 'unsupported_grant_type', error_description: 'افتح الحساب من شاشة الحسابات.' });
      }
      if (p === '/auth/v1/user') {
        if (!authed(req)) return send(res, 401, { message: 'سجّل الدخول.' });
        if (req.method === 'PUT') return send(res, 400, { message: 'غيّر كلمة السر من شاشة الحسابات.' });
        return send(res, 200, backend.user());
      }
      if (p === '/auth/v1/logout') return send(res, 204, '');
      if (p.startsWith('/auth/v1/factors')) return send(res, 200, []);
      if (p.startsWith('/auth/v1/')) return send(res, 200, {});

      // ---------------------------------------------------------------- الصور
      if (p.startsWith('/storage/v1/object/public/media/')) {
        if (!backend.cur) return send(res, 404, 'not found');
        const rel = safeRel(p.slice('/storage/v1/object/public/media/'.length));
        if (!rel) return send(res, 400, 'bad path');
        const dir = backend.accountDir(backend.cur.account.id);
        let file = rel.startsWith('local/') ? path.join(dir, rel.slice(6)) : path.join(dir, 'media', rel);
        if (!fs.existsSync(file)) {
          // صورة بمقاس غير مرفوع (-sm/-md/-lg): نقدّم المتوفر
          const base = file.replace(/-(sm|md|lg)\.webp$/, '');
          file = ['-md.webp', '-lg.webp', '-sm.webp'].map((s) => base + s).find((f) => fs.existsSync(f)) ?? '';
        }
        if (!file || !fs.existsSync(file)) return send(res, 404, 'not found');
        res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream', 'Cache-Control': 'private, max-age=86400' });
        return fs.createReadStream(file).pipe(res);
      }
      if (p.startsWith('/storage/v1/object/media')) {
        if (!authed(req)) return send(res, 401, { message: 'سجّل الدخول.' });
        const dir = path.join(backend.accountDir(backend.cur.account.id), 'media');
        if (req.method === 'DELETE') {
          const b = await json(req);
          for (const k of b.prefixes ?? []) { const rel = safeRel(k); if (rel) fs.rmSync(path.join(dir, rel), { force: true }); }
          return send(res, 200, []);
        }
        if (req.method === 'POST' || req.method === 'PUT') {
          const rel = safeRel(p.slice('/storage/v1/object/media/'.length));
          if (!rel) return send(res, 400, { message: 'مسار غير صالح.' });
          const body = await readBody(req);
          const file = path.join(dir, rel);
          fs.mkdirSync(path.dirname(file), { recursive: true });
          fs.writeFileSync(file, body);
          return send(res, 200, { Key: `media/${rel}`, Id: rel });
        }
        return send(res, 405, { message: 'method' });
      }
      if (p.startsWith('/storage/v1/')) return send(res, 404, { message: 'not found' });
      if (p.startsWith('/functions/v1/')) return send(res, 503, { error: 'هذه الميزة تحتاج الإنترنت، وغير متاحة في نسخة الحاسوب.' });
      if (p.startsWith('/realtime/')) return send(res, 404, '');

      // ---------------------------------------------------------------- الحسابات
      if (p === '/local/config.js') {
        res.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
        return res.end(`window.__RAQEEM_LOCAL__=${JSON.stringify({ anonKey: backend.anonKey(), version: o.version ?? '1.0.0' })};`);
      }
      if (p === '/local/state') {
        return send(res, 200, { root: backend.root, accounts: backend.listAccounts(), open: backend.cur ? { id: backend.cur.account.id, name: backend.cur.account.name } : null });
      }
      if (p.startsWith('/local/logo/')) {
        const id = p.slice('/local/logo/'.length);
        const f = backend.logoPath(id);
        if (!f) return send(res, 404, '');
        res.writeHead(200, { 'Content-Type': TYPES[path.extname(f).toLowerCase()] ?? 'image/png' });
        return fs.createReadStream(f).pipe(res);
      }
      if (req.method === 'POST' && p === '/local/create') {
        const b = await json(req);
        const r = await backend.createAccount({ name: b.name, password: b.password, logo: b.logo });
        return send(res, 200, r);
      }
      if (req.method === 'POST' && p === '/local/open') {
        const b = await json(req);
        return send(res, 200, await backend.openAccount(b.id, b.password));
      }
      if (req.method === 'POST' && p === '/local/close') {
        await backend.closeAccount();
        return send(res, 200, { ok: true });
      }
      if (req.method === 'POST' && p === '/local/password') {
        const b = await json(req);
        await backend.changePassword(b.id, b.old_password, b.new_password);
        return send(res, 200, { ok: true });
      }
      if (req.method === 'POST' && p === '/local/backup') {
        if (!authed(req)) return send(res, 401, { error: 'سجّل الدخول.' });
        const file = await backend.backup();
        return send(res, 200, { file });
      }
      if (req.method === 'POST' && p === '/local/open-folder') {
        const which = (await json(req)).which;
        const target = backend.cur && which === 'backups' ? path.join(backend.accountDir(backend.cur.account.id), 'backups') : backend.root;
        o.desktop?.openPath?.(target);
        return send(res, 200, { path: target });
      }
      if (req.method === 'POST' && p === '/local/choose-root') {
        const dir = await o.desktop?.chooseFolder?.();
        if (dir) backend.setRoot(path.join(dir, path.basename(dir).toLowerCase() === 'raqeem' ? '' : 'Raqeem'));
        o.desktop?.saveRoot?.(backend.root);
        return send(res, 200, { root: backend.root });
      }

      // ---------------------------------------------------------------- لوحة التحكم
      if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, '');
      let rel = safeRel(p === '/' ? 'index.html' : p.slice(1)) ?? 'index.html';
      let file = path.join(adminDir, rel);
      if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) { rel = 'index.html'; file = path.join(adminDir, 'index.html'); }
      if (rel === 'index.html') {
        const html = fs.readFileSync(file, 'utf8').replace('<head>', '<head><script src="/local/config.js"></script>');
        res.writeHead(200, { 'Content-Type': TYPES['.html'], 'Cache-Control': 'no-store' });
        return res.end(html);
      }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file).toLowerCase()] ?? 'application/octet-stream', 'Cache-Control': rel.startsWith('assets/') ? 'max-age=31536000, immutable' : 'no-cache' });
      return fs.createReadStream(file).pipe(res);
    } catch (e) {
      const msg = (e && e.message) || (typeof e === 'string' ? e : 'حدث خطأ غير متوقع، حاول مجدداً.');
      backend.log(`gateway: ${p}: ${msg}`);
      if (!res.headersSent) return send(res, 400, { error: msg, message: msg });
    }
  });

  return {
    server,
    listen: () => new Promise((resolve, reject) => { server.once('error', reject); server.listen(o.port, o.host ?? '127.0.0.1', () => resolve(o.port)); }),
    close: () => new Promise((r) => server.close(() => r())),
  };
}

function proxy(req, res, port, pathAndQuery) {
  const headers = { ...req.headers, host: `127.0.0.1:${port}` };
  delete headers.origin;
  delete headers.apikey;
  const up = http.request({ host: '127.0.0.1', port, method: req.method, path: pathAndQuery || '/', headers }, (r) => {
    res.writeHead(r.statusCode ?? 502, r.headers);
    r.pipe(res);
  });
  up.on('error', () => send(res, 502, { message: 'واجهة البيانات غير متاحة.' }));
  req.pipe(up);
}
