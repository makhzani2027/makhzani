// خلفية «رقيم لسطح المكتب»: كل حساب شركة = مجلد خاص على الحاسوب فيه قاعدة بياناته وصوره ونسخه الاحتياطية.
//   <المجلد الرئيسي>/<معرّف الحساب>/account.json  ← الاسم، كلمة السر (scrypt)، الأسرار المحلية
//                                   /pg/            ← قاعدة البيانات (Postgres مضمّن، لا يحتاج تثبيتاً)
//                                   /media/         ← الصور
//                                   /backups/       ← نسخ احتياطية تلقائية
// نفس migrations النظام أونلاين (ومحاكاة Supabase نفسها التي تجري عليها الاختبارات)، فقواعد البيع والمخزون واحدة.
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import EmbeddedPostgres from 'embedded-postgres';
import { checkPassword, hashPassword, randomSecret, signJwt } from './jwt.mjs';

const require = createRequire(import.meta.url);
const SCHEMA_VERSION = 1;
// حسابات أُنشئت قبل تتبّع التحديثات: قاعدتها فيها الملفات حتى هذا الملف (أول إصدار للبرنامج)
const LEGACY_LAST_MIGRATION = '20261104000028_store_signup.sql';
export const STORE1 = '00000000-0000-4000-a000-000000000001';

export function freePort(preferred = 0) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once('error', () => { const s2 = net.createServer(); s2.listen(0, '127.0.0.1', () => { const p = s2.address().port; s2.close(() => resolve(p)); }); });
    srv.listen(preferred, '127.0.0.1', () => { const p = srv.address().port; srv.close(() => resolve(p)); });
  });
}

const slugId = (name) => {
  const base = String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24);
  return `${base || 'store'}-${crypto.randomBytes(3).toString('hex')}`;
};

export class Backend {
  /**
   * @param {{ root: string, resources: string, postgrest: string, secret: string, log?: (m: string) => void }} o
   *   root: مجلد البيانات الرئيسي، resources: فيه sql/ و admin/، postgrest: مسار برنامج PostgREST،
   *   secret: سر توقيع الجلسات المحلية (ثابت لهذا الحاسوب؛ كل حساب قاعدة منفصلة فلا يفتح توقيعه حساباً آخر)
   */
  constructor(o) {
    this.secret = o.secret;
    this.root = o.root;
    this.resources = o.resources;
    this.postgrestBin = o.postgrest;
    this.log = o.log ?? (() => {});
    this.cur = null; // الحساب المفتوح
    fs.mkdirSync(this.root, { recursive: true });
  }

  setRoot(root) {
    if (this.cur) throw new Error('أغلق الحساب المفتوح أولاً.');
    fs.mkdirSync(root, { recursive: true });
    this.root = root;
  }

  // ---------------------------------------------------------------- الحسابات
  listAccounts() {
    if (!fs.existsSync(this.root)) return [];
    return fs.readdirSync(this.root, { withFileTypes: true })
      .filter((d) => d.isDirectory() && fs.existsSync(path.join(this.root, d.name, 'account.json')))
      .map((d) => {
        const a = this.readAccount(d.name);
        return { id: a.id, name: a.name, logo: !!a.logo, created_at: a.created_at, last_opened_at: a.last_opened_at ?? null };
      })
      .sort((a, b) => String(b.last_opened_at ?? b.created_at).localeCompare(String(a.last_opened_at ?? a.created_at)));
  }

  accountDir(id) {
    if (!/^[a-z0-9-]{3,40}$/.test(id)) throw new Error('حساب غير صالح.');
    return path.join(this.root, id);
  }

  readAccount(id) {
    return JSON.parse(fs.readFileSync(path.join(this.accountDir(id), 'account.json'), 'utf8'));
  }

  writeAccount(a) {
    const file = path.join(this.accountDir(a.id), 'account.json');
    fs.writeFileSync(`${file}.tmp`, JSON.stringify(a, null, 2));
    fs.renameSync(`${file}.tmp`, file);
  }

  logoPath(id) {
    const dir = this.accountDir(id);
    const f = fs.readdirSync(dir).find((x) => /^logo\.(png|jpe?g|webp)$/i.test(x));
    return f ? path.join(dir, f) : null;
  }

  /** حساب شركة جديد: مجلد + قاعدة بيانات جاهزة بكل الجداول والإعدادات الافتراضية */
  async createAccount({ name, password, logo }) {
    const nm = String(name || '').trim();
    if (nm.length < 2 || nm.length > 80) throw new Error('اكتب اسم الشركة (حرفان على الأقل).');
    if (String(password || '').length < 4) throw new Error('كلمة السر ٤ أحرف على الأقل.');
    if (this.cur) await this.closeAccount();
    const id = slugId(nm);
    const dir = this.accountDir(id);
    fs.mkdirSync(path.join(dir, 'media'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'backups'), { recursive: true });
    const a = {
      id, name: nm, created_at: new Date().toISOString(), schema_version: 0,
      password: hashPassword(password), pg_password: randomSecret(16),
      owner_id: crypto.randomUUID(), logo: null,
    };
    if (logo?.data) {
      const ext = /png/.test(logo.type) ? 'png' : /webp/.test(logo.type) ? 'webp' : 'jpg';
      fs.writeFileSync(path.join(dir, `logo.${ext}`), Buffer.from(logo.data, 'base64'));
      a.logo = `logo.${ext}`;
    }
    this.writeAccount(a);
    try {
      await this.startDb(a, { init: true });
      await this.applySchema(a);
    } catch (e) {
      await this.stopDb().catch(() => {});
      fs.rmSync(dir, { recursive: true, force: true });
      throw e;
    }
    await this.stopDb();
    return { id, name: nm };
  }

  async openAccount(id, password) {
    const a = this.readAccount(id);
    if (!checkPassword(password, a.password)) throw new Error('كلمة السر غير صحيحة.');
    if (this.cur?.account.id !== id) {
      if (this.cur) await this.closeAccount();
      this.autoBackupBeforeOpen(a);
      await this.startDb(a, { init: false });
      try {
        if ((a.schema_version ?? 0) < SCHEMA_VERSION) await this.applySchema(a);
        else await this.upgradeSchema(a);
        await this.startRestRetry();
      } catch (e) {
        await this.stopRest().catch(() => {});
        await this.stopDb().catch(() => {});
        throw e;
      }
    }
    a.last_opened_at = new Date().toISOString();
    this.writeAccount(a);
    this.cur.account = a;
    return this.session();
  }

  async changePassword(id, oldPw, newPw) {
    const a = this.readAccount(id);
    if (!checkPassword(oldPw, a.password)) throw new Error('كلمة السر الحالية غير صحيحة.');
    if (String(newPw || '').length < 4) throw new Error('كلمة السر الجديدة ٤ أحرف على الأقل.');
    a.password = hashPassword(newPw);
    this.writeAccount(a);
  }

  async closeAccount() {
    if (!this.cur) return;
    await this.stopRest();
    await this.stopDb();
  }

  // ---------------------------------------------------------------- الجلسة (نفس صيغة Supabase Auth)
  session() {
    const a = this.cur.account;
    const now = Math.floor(Date.now() / 1000);
    const exp = now + 12 * 3600;
    const user = this.user();
    const access = signJwt({ sub: a.owner_id, role: 'authenticated', aud: 'authenticated', aal: 'aal1', email: user.email, acc: a.id, iat: now, exp }, this.secret);
    const refresh = signJwt({ sub: a.owner_id, typ: 'refresh', acc: a.id, iat: now, exp: now + 90 * 24 * 3600 }, this.secret);
    return { access_token: access, refresh_token: refresh, token_type: 'bearer', expires_in: exp - now, expires_at: exp, user };
  }

  user() {
    const a = this.cur.account;
    return {
      id: a.owner_id, aud: 'authenticated', role: 'authenticated', email: `owner@${a.id}.local`, email_confirmed_at: a.created_at,
      app_metadata: { provider: 'local' }, user_metadata: { full_name: a.name }, factors: [], created_at: a.created_at, updated_at: a.created_at,
    };
  }

  anonKey() {
    return signJwt({ role: 'anon', iat: 1700000000, exp: 4102444800 }, this.secret);
  }

  // ---------------------------------------------------------------- قاعدة البيانات
  async startDb(a, { init }) {
    const port = await freePort(0);
    const pg = new EmbeddedPostgres({
      databaseDir: path.join(this.accountDir(a.id), 'pg'),
      user: 'postgres', password: a.pg_password, port, persistent: true,
      initdbFlags: ['--encoding=UTF8', '--locale=C'],
      postgresFlags: ['-c', 'listen_addresses=127.0.0.1', '-c', 'max_connections=40'],
      onLog: (m) => this.log(String(m).trim()), onError: (m) => this.log(String(m).trim()),
    });
    // لينكس كمستخدم root فقط (الاختبارات): embedded-postgres يشغّل initdb بمستخدم آخر يحتاج الكتابة في مجلد الحساب
    if (init && typeof process.getuid === 'function' && process.getuid() === 0) fs.chmodSync(this.accountDir(a.id), 0o777);
    if (init) await pg.initialise();
    else await stopLeftover(path.join(this.accountDir(a.id), 'pg'), this.log);
    const dataDir = path.join(this.accountDir(a.id), 'pg');
    try {
      if (process.platform === 'win32') {
        // ويندوز: postgres.exe يرفض العمل مباشرة تحت حساب مدير الجهاز؛ pg_ctl يشغّله بصلاحيات مقيّدة (الطريقة الرسمية)
        await pgCtl(['start', '-w', '-t', '60', '-D', dataDir, '-l', path.join(this.accountDir(a.id), 'postgres.log'),
          '-o', `-p ${port} -c listen_addresses=127.0.0.1 -c max_connections=40`], this.log);
        this.cur = { account: a, pg: { stop: () => pgCtl(['stop', '-w', '-t', '30', '-m', 'fast', '-D', dataDir], this.log) }, pgPort: port, rest: null, restPort: null };
        return;
      }
      await pg.start();
    } catch (e) {
      const tail = readTail(path.join(this.accountDir(a.id), 'postgres.log'));
      this.log(`db start failed: ${e && e.message} ${tail}`);
      throw new Error(`تعذّر تشغيل قاعدة البيانات${e && e.message ? `: ${e.message}` : ''}. أغلق البرنامج وافتحه من جديد.`);
    }
    this.cur = { account: a, pg, pgPort: port, rest: null, restPort: null };
  }

  async stopDb() {
    if (!this.cur) return;
    try { await this.cur.pg.stop(); } finally { this.cur = null; }
  }

  async client() {
    const { Client } = require('pg');
    const c = new Client({ host: '127.0.0.1', port: this.cur.pgPort, user: 'postgres', password: this.cur.account.pg_password, database: 'postgres' });
    await c.connect();
    return c;
  }

  sqlFile(rel) { return fs.readFileSync(path.join(this.resources, 'sql', rel), 'utf8'); }

  /** محاكاة Supabase + كل migrations + البيانات الأولية، ثم مالك الحساب واسم الشركة وشعارها */
  async applySchema(a) {
    const c = await this.client();
    try {
      await c.query('set client_min_messages = warning');
      await c.query(this.sqlFile('stub.sql'));
      const dir = path.join(this.resources, 'sql', 'migrations');
      const files = this.migrationFiles();
      for (const f of files) {
        try { await c.query(fs.readFileSync(path.join(dir, f), 'utf8')); } catch (e) { throw new Error(`${f}: ${e.message}`); }
      }
      a.migrations = files;
      await c.query(this.sqlFile('seed.sql'));
      const email = `owner@${a.id}.local`;
      await c.query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, $3) on conflict (id) do nothing`,
        [a.owner_id, email, JSON.stringify({ full_name: a.name })]);
      await c.query('select public.make_owner($1, $2)', [email, a.name]);
      // اسم الشركة وشعارها في إعدادات المتجر (الفواتير والعروض والشريط الجانبي)
      await c.query(`update public.app_settings set value = value || jsonb_build_object('name', $1::text, 'logo_key', $2::text)
        where key = 'store' and store_id = $3`, [a.name, a.logo ? `local/${a.logo}` : null, STORE1]);
      await c.query(`update public.stores set name = $1, slug = 'local' where id = $2`, [a.name, STORE1]).catch(() => {});
      // بلا إنترنت: لا متجر إلكتروني ولا دفع إلكتروني
      await c.query(`update public.app_settings set value = value || '{"online_enabled": false}' where key = 'checkout'`);
      a.schema_version = SCHEMA_VERSION;
      this.writeAccount(a);
    } finally {
      await c.end();
    }
  }

  migrationFiles() {
    return fs.readdirSync(path.join(this.resources, 'sql', 'migrations')).filter((x) => x.endsWith('.sql')).sort();
  }

  /** تحديث البرنامج: يطبّق على قاعدة الحساب ملفات التحديث الجديدة فقط (كل ملف في معاملة) ويحفظ ما طُبّق */
  async upgradeSchema(a) {
    const files = this.migrationFiles();
    const done = new Set(Array.isArray(a.migrations) ? a.migrations : files.filter((f) => f <= LEGACY_LAST_MIGRATION));
    const pending = files.filter((f) => !done.has(f));
    if (!pending.length) { if (!Array.isArray(a.migrations)) { a.migrations = [...done]; this.writeAccount(a); } return; }
    const c = await this.client();
    try {
      await c.query('set client_min_messages = warning');
      for (const f of pending) {
        this.log(`upgrade: ${f}`);
        try {
          await c.query('begin');
          await c.query(fs.readFileSync(path.join(this.resources, 'sql', 'migrations', f), 'utf8'));
          await c.query('commit');
        } catch (e) {
          await c.query('rollback').catch(() => {});
          throw new Error(`تعذّر تحديث قاعدة البيانات (${f}): ${e.message}`);
        }
        done.add(f);
        a.migrations = [...done].sort();
        this.writeAccount(a);
      }
    } finally {
      await c.end();
    }
  }

  /** واجهة البيانات: محاولة ثانية بعد ثانيتين إن توقفت فور تشغيلها */
  async startRestRetry() {
    try { await this.startRest(); } catch (e) {
      this.log(`rest failed, retrying: ${e.message}`);
      await new Promise((r) => setTimeout(r, 2000));
      await this.startRest();
    }
  }

  // ---------------------------------------------------------------- PostgREST (واجهة البيانات)
  async startRest() {
    const port = await freePort(0);
    const a = this.cur.account;
    const conf = path.join(this.accountDir(a.id), 'postgrest.conf');
    fs.writeFileSync(conf, [
      `db-uri = "postgres://postgres:${a.pg_password}@127.0.0.1:${this.cur.pgPort}/postgres"`,
      'db-schemas = "public"',
      'db-anon-role = "anon"',
      `jwt-secret = "${this.secret}"`,
      'db-pool = 8',
      'db-max-rows = 1000',
      'server-host = "127.0.0.1"',
      `server-port = ${port}`,
      'db-plan-enabled = false',
    ].join('\n'));
    let failed = null;
    const out = [];
    const keep = (d) => { const t = String(d).trim(); if (!t) return; this.log(`rest: ${t}`); out.push(...t.split(/\r?\n/)); if (out.length > 8) out.splice(0, out.length - 8); };
    if (!fs.existsSync(this.postgrestBin)) throw new Error(`تعذّر تشغيل واجهة البيانات: الملف غير موجود (${this.postgrestBin}). أعد تثبيت البرنامج.`);
    const proc = spawn(this.postgrestBin, [conf], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, cwd: path.dirname(conf) });
    proc.on('error', (e) => { failed = e; });
    proc.stdout.on('data', keep);
    proc.stderr.on('data', keep);
    this.cur.rest = proc;
    this.cur.restPort = port;
    // انتظار الجاهزية
    for (let i = 0; i < 100; i++) {
      const ok = await fetch(`http://127.0.0.1:${port}/`).then((r) => r.status < 500).catch(() => false);
      if (ok) return;
      if (failed || proc.exitCode !== null) {
        this.cur.rest = null;
        await new Promise((r) => setTimeout(r, 200));
        const why = failed ? (failed.code ?? failed.message) : out.slice(-3).join(' | ') || `exit ${proc.exitCode}`;
        throw new Error(`تعذّر تشغيل واجهة البيانات (${why}).`);
      }
      await new Promise((r) => setTimeout(r, 150));
    }
    throw new Error('تأخر تشغيل واجهة البيانات.');
  }

  async stopRest() {
    const p = this.cur?.rest;
    if (!p) return;
    try { p.kill(); } catch { /* */ }
    await new Promise((r) => { if (p.exitCode !== null) r(); else { p.once('exit', r); setTimeout(r, 3000); } });
    this.cur.rest = null;
  }

  // ---------------------------------------------------------------- النسخ الاحتياطي
  /**
   * نسخة كاملة = نسخ مجلد قاعدة البيانات والصور والإعدادات والقاعدة متوقفة (نسخة متسقة جاهزة للاسترجاع كما هي).
   * تلقائياً مرة كل يوم عند فتح الحساب (قبل تشغيل القاعدة)، ويدوياً بزر «نسخة احتياطية الآن» (توقف القاعدة ثوانٍ).
   * تُحفظ آخر ٧ نسخ في backups/. الاسترجاع: أغلق البرنامج وانسخ محتوى النسخة مكان مجلد الحساب.
   */
  copyBackup(a) {
    const dir = this.accountDir(a.id);
    const stamp = new Date().toISOString().replace(/[:T]/g, '-').slice(0, 16);
    const out = path.join(dir, 'backups', `raqeem-${stamp}`);
    fs.mkdirSync(out, { recursive: true });
    fs.cpSync(path.join(dir, 'pg'), path.join(out, 'pg'), { recursive: true, filter: (src) => !/postmaster\.(pid|opts)$/.test(src) });
    if (fs.existsSync(path.join(dir, 'media'))) fs.cpSync(path.join(dir, 'media'), path.join(out, 'media'), { recursive: true });
    for (const f of fs.readdirSync(dir)) if (f === 'account.json' || /^logo\./.test(f)) fs.copyFileSync(path.join(dir, f), path.join(out, f));
    const all = fs.readdirSync(path.join(dir, 'backups')).filter((f) => f.startsWith('raqeem-')).sort();
    for (const f of all.slice(0, -7)) fs.rmSync(path.join(dir, 'backups', f), { recursive: true, force: true });
    return out;
  }

  /** «نسخة احتياطية الآن»: إيقاف قصير للقاعدة ثم نسخ ثم تشغيل */
  async backup() {
    if (!this.cur) throw new Error('افتح الحساب أولاً.');
    const a = this.cur.account;
    await this.stopRest();
    await this.stopDb();
    let out;
    try { out = this.copyBackup(a); } finally {
      await this.startDb(a, { init: false });
      await this.startRest();
      this.cur.account = a;
    }
    return out;
  }

  /** مرة يومياً عند الفتح والقاعدة متوقفة */
  autoBackupBeforeOpen(a) {
    const dir = path.join(this.accountDir(a.id), 'backups');
    fs.mkdirSync(dir, { recursive: true });
    const today = new Date().toISOString().slice(0, 10);
    if (fs.readdirSync(dir).some((f) => f.includes(today))) return;
    if (!fs.existsSync(path.join(this.accountDir(a.id), 'pg', 'PG_VERSION'))) return;
    try { this.copyBackup(a); } catch (e) { this.log(`auto backup: ${e.message}`); }
  }
}

/** مجلد برامج Postgres المضمّنة (initdb و pg_ctl و postgres) */
function pgBinDir() {
  const plat = { win32: 'windows-x64', linux: 'linux-x64', darwin: process.arch === 'arm64' ? 'darwin-arm64' : 'darwin-x64' }[process.platform];
  for (let d = path.dirname(fileURLToPath(import.meta.resolve('embedded-postgres'))); d !== path.dirname(d); d = path.dirname(d)) {
    if (path.basename(d) === 'node_modules') return path.join(d, '@embedded-postgres', plat, 'native', 'bin');
  }
  return '';
}

function pgCtl(args, log) {
  const exe = path.join(pgBinDir(), process.platform === 'win32' ? 'pg_ctl.exe' : 'pg_ctl');
  return new Promise((resolve, reject) => {
    const p = spawn(exe, args, { windowsHide: true });
    let out = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { out += d; });
    p.on('error', reject);
    p.on('exit', (code) => { log(`pg_ctl ${args[0]}: ${code} ${out.trim()}`); code === 0 ? resolve() : reject(new Error(out.trim() || `pg_ctl ${code}`)); });
  });
}

function readTail(file) {
  try { return fs.readFileSync(file, 'utf8').slice(-1500); } catch { return ''; }
}

/** قاعدة بقيت تعمل بعد إغلاق غير طبيعي للبرنامج: نوقفها قبل التشغيل (Postgres يتعافى من سجلّه تلقائياً) */
async function stopLeftover(dataDir, log) {
  const pidFile = path.join(dataDir, 'postmaster.pid');
  if (!fs.existsSync(pidFile)) return;
  const pid = Number(fs.readFileSync(pidFile, 'utf8').split('\n')[0]);
  const alive = (n) => { try { process.kill(n, 0); return true; } catch { return false; } };
  if (!pid || !alive(pid)) return;
  log(`stopping leftover postgres ${pid}`);
  if (process.platform === 'win32') {
    try { await pgCtl(['stop', '-w', '-t', '30', '-m', 'fast', '-D', dataDir], log); return; } catch { /* نكمل بالإيقاف القسري */ }
  }
  try { process.kill(pid, process.platform === 'win32' ? undefined : 'SIGINT'); } catch { /* */ }
  for (let i = 0; i < 60 && alive(pid); i++) await new Promise((r) => setTimeout(r, 250));
  if (alive(pid)) { try { process.kill(pid, 'SIGKILL'); } catch { /* */ } await new Promise((r) => setTimeout(r, 500)); }
}
