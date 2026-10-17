// يجمّع الموقع التعريفي (apps/site) في hosting/ — يستدعيه scripts/build-hosting.sh.
//   node scripts/build-site.mjs site        ← الموقع: الألوان والأيقونات والشعار من packages/shared، الخطوط، كسر الكاش، download.json
//   node scripts/build-site.mjs dashboard   ← بعد نسخ لوحة التحكم: ينقل أي <script> مضمّن إلى ملف (CSP: script-src 'self')
// متغيرات اختيارية: SUPABASE_URL و SUPABASE_ANON_KEY (بيانات حية في الموقع)، DOWNLOAD_URL/DOWNLOAD_VERSION/DOWNLOAD_SIZE_MB، ADMIN_BASE
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(root, 'apps/site');
const OUT = path.join(root, 'hosting');
const shared = (f) => import(pathToFileURL(path.join(root, 'packages/shared/src', f)).href);
const fail = (msg) => { console.error(`✗ ${msg}`); process.exit(1); };

async function buildSite() {
  const { palette, tones, brand, fonts } = await shared('theme.ts');
  const { icons } = await shared('icons.ts');
  const { GOVERNORATES } = await shared('iraq.ts');

  // رمز الشعار من ملف الهوية نفسه (لا نسخة ثانية من المسار)
  const markSvg = fs.readFileSync(path.join(root, 'brand/logo/mark.svg'), 'utf8');
  const GLYPH = markSvg.match(/<path[^>]* d="([^"]+)"/)?.[1];
  const HOLE = markSvg.match(/<circle cx="([\d.]+)" cy="([\d.]+)" r="([\d.]+)"/);
  if (!GLYPH || !HOLE) fail('لم أجد مسار الرمز في brand/logo/mark.svg');

  fs.mkdirSync(OUT, { recursive: true });

  // ---------------------------------------------------------------- الألوان ← متغيرات CSS
  const kebab = (k) => k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
  const vars = (mode) => {
    const p = palette[mode];
    const t = tones[mode];
    const v = Object.entries(p).map(([k, c]) => `--${kebab(k)}:${c}`);
    v.push(`--ok:${t.success.ink}`, `--ok-bg:${t.success.bg}`, `--warn:${t.warning.ink}`, `--warn-bg:${t.warning.bg}`);
    v.push(`--danger:${t.danger.ink}`, `--danger-bg:${t.danger.bg}`, `--info:${t.info.ink}`, `--info-bg:${t.info.bg}`);
    // ثقب الرمز على كتلة البطل: آجُر فاتح على القار (فاتح)، وقار على الآجُر (غامق) — كأيقونتي الهوية
    v.push(`--hero-hole:${mode === 'light' ? brand.brickLight : brand.ink}`);
    // إطار الهاتف في الرسوم
    v.push(`--frame:${mode === 'light' ? brand.ink : '#050606'}`, `--frame-ring:${palette.dark.lineStrong}`);
    v.push(`--shadow:${mode === 'light' ? 'rgba(18,21,19,.32)' : 'rgba(0,0,0,.7)'}`);
    return v.join(';');
  };
  const tokens = `:root{${vars('light')}}\n@media (prefers-color-scheme: dark){:root{${vars('dark')}}}`;

  // ---------------------------------------------------------------- HTML
  const ICON_ATTRS = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"';
  const sha = (() => { try { return execSync('git rev-parse --short HEAD', { cwd: root }).toString().trim(); } catch { return String(Date.now()); } })();
  const sbUrl = (process.env.SUPABASE_URL || '').trim().replace(/\/+$/, '');
  const sbKey = (process.env.SUPABASE_ANON_KEY || '').trim();
  const env = sbUrl && sbKey ? `<script>window.RAQEEM_SUPABASE=${JSON.stringify({ url: sbUrl, anonKey: sbKey })}</script>` : '';
  const partial = (name) => fs.readFileSync(path.join(SRC, '_partials', `${name}.html`), 'utf8');
  const wedge = '<svg viewBox="0 0 70 64" aria-hidden="true"><path fill="currentColor" d="M70 5.5v53c0 3.6-3.4 5.8-6.5 4.3L3.2 35.2c-2.9-1.4-2.9-5.5 0-6.9L63.5 1.2C66.6-.3 70 1.9 70 5.5Z"/></svg>';
  const govs = GOVERNORATES.map((g) => `<li>${g.name}</li>`).join('');

  const html = (file) => {
    let s = fs.readFileSync(path.join(SRC, file), 'utf8');
    s = s.replace(/<!--@include (\w+)-->/g, (_, n) => partial(n));
    s = s.replace(/<svg([^>]*?) data-icon="(\w+)"([^>]*)><\/svg>/g, (_, a, name, b) => {
      if (!icons[name]) fail(`${file}: أيقونة غير معروفة «${name}» (packages/shared/src/icons.ts)`);
      return `<svg${a}${b} ${ICON_ATTRS}><path d="${icons[name]}"/></svg>`;
    });
    s = s.replace(/<svg([^>]*?) data-logo([^>]*)><\/svg>/g, (_, a, b) =>
      `<svg${a}${b} viewBox="0 0 120 120"><path class="m-glyph" d="${GLYPH}"/><circle class="m-hole" cx="${HOLE[1]}" cy="${HOLE[2]}" r="${HOLE[3]}"/></svg>`);
    s = s.replace(/<path class="m-glyph" data-glyph \/>/g, `<path class="m-glyph" d="${GLYPH}"/>`);
    s = s.replace(/<svg data-wedge aria-hidden="true"><\/svg>/g, wedge);
    s = s.replace(/(<ul[^>]*data-governorates[^>]*>)<\/ul>/g, `$1${govs}</ul>`);
    // فهرس الصفحات القانونية من عناوين h2 نفسها
    s = s.replace(/<nav data-toc([^>]*)><\/nav>/, (_, a) => {
      const items = [...s.matchAll(/<h2 id="([\w-]+)">([\s\S]*?)<\/h2>/g)].map(([, id, t]) => `<a href="#${id}">${t.replace(/<[^>]+>/g, '')}</a>`);
      return `<nav${a}>${items.join('')}</nav>`;
    });
    s = s.replace('<!--@env-->', env);
    s = s.replace(/href="\/style\.css"/g, `href="/style.css?v=${sha}"`).replace(/src="\/main\.js"/g, `src="/main.js?v=${sha}"`);
    const left = s.match(/data-icon=|data-logo|data-glyph|data-wedge|<!--@/);
    if (left) fail(`${file}: علامة بناء لم تُستبدل (${left[0]})`);
    fs.writeFileSync(path.join(OUT, file), s);
  };

  for (const f of fs.readdirSync(SRC)) {
    const full = path.join(SRC, f);
    if (f.startsWith('_') || f === 'download-config.json' || fs.statSync(full).isDirectory()) continue;
    if (f.endsWith('.html')) html(f);
    else if (f === 'style.css') fs.writeFileSync(path.join(OUT, f), fs.readFileSync(full, 'utf8').replace('/*@tokens*/', tokens));
    else if (f === 'main.js') {
      // أيقونات الأقسام الحية فقط (لا كل المجموعة) حتى يبقى الملف صغيراً
      const pick = ['tag', 'phone', 'activity', 'home', 'box', 'boxes', 'package', 'heart', 'clock', 'gift', 'bag', 'zap', 'shield', 'tags', 'store', 'cart',
        'camera', 'image', 'star', 'truck', 'card', 'globe', 'sun', 'moon', 'layers', 'printer', 'scale', 'user', 'users', 'settings', 'percent', 'wallet',
        'cash', 'coins', 'mapPin', 'request', 'ticket', 'bell', 'megaphone', 'mail', 'chat', 'key', 'lock', 'eye', 'grid', 'shelf', 'warehouse', 'barcode'];
      const sub = Object.fromEntries(pick.filter((k) => icons[k]).map((k) => [k, icons[k]]));
      const js = fs.readFileSync(full, 'utf8');
      if (!js.includes('__ICONS__')) fail('main.js: العلامة __ICONS__ مفقودة');
      fs.writeFileSync(path.join(OUT, f), js.replace('__ICONS__', JSON.stringify(sub)));
    } else fs.copyFileSync(full, path.join(OUT, f));
  }

  // ---------------------------------------------------------------- الخطوط (الأوزان المستعملة فقط — ترخيص ثمانية يمنع إتاحة الملفات للتنزيل)
  fs.mkdirSync(path.join(OUT, 'fonts'), { recursive: true });
  const fontDir = path.join(root, 'assets/fonts/thmanyah');
  const families = fs.readdirSync(fontDir);
  const wanted = [...Object.values(fonts.sans), ...Object.values(fonts.display), ...Object.values(fonts.text), 'thmanyahseriftext-Bold'];
  for (const name of new Set(wanted)) {
    const fam = families.find((d) => fs.existsSync(path.join(fontDir, d, 'woff2', `${name}.woff2`)));
    if (!fam) fail(`الخط ${name}.woff2 غير موجود في assets/fonts/thmanyah/*/woff2`);
    fs.copyFileSync(path.join(fontDir, fam, 'woff2', `${name}.woff2`), path.join(OUT, 'fonts', `${name}.woff2`));
  }

  // ---------------------------------------------------------------- أيقونات المتصفح من brand/
  fs.mkdirSync(path.join(OUT, 'icons'), { recursive: true });
  const bi = (f) => path.join(root, 'brand/icons', f);
  fs.copyFileSync(bi('favicon-64.png'), path.join(OUT, 'favicon.png'));
  fs.copyFileSync(bi('apple-touch-icon-180.png'), path.join(OUT, 'apple-touch-icon.png'));
  fs.copyFileSync(bi('icon-192.png'), path.join(OUT, 'icons/icon-192.png'));
  fs.copyFileSync(bi('icon-512.png'), path.join(OUT, 'icons/icon-512.png'));
  fs.copyFileSync(path.join(root, 'brand/logo/icon-ink.svg'), path.join(OUT, 'favicon.svg'));

  // ---------------------------------------------------------------- download.json (زر تنزيل APK)
  const cfg = JSON.parse(fs.readFileSync(path.join(SRC, 'download-config.json'), 'utf8'));
  let url = (process.env.DOWNLOAD_URL || '').trim();
  const link = (cfg.link || '').trim();
  if (!url && /dropbox\.com/.test(link)) {
    const u = new URL(link);
    u.searchParams.set('dl', '1'); // تنزيل مباشر بلا صفحة وسيطة
    url = u.toString();
  } else if (!url && /^https:\/\//.test(link)) url = link;
  const dl = {
    url,
    version: String(process.env.DOWNLOAD_VERSION || cfg.version || ''),
    size_mb: String(process.env.DOWNLOAD_SIZE_MB || cfg.size_mb || ''),
    date: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(OUT, 'download.json'), JSON.stringify(dl));
  console.log(`✓ الموقع (v=${sha})${env ? ' + بيانات Supabase الحية' : ''} — download.json: ${dl.url || '(بلا رابط بعد)'}`);
}

// لوحة التحكم: CSP لا تسمح بـ<script> مضمّن، فننقله لملف بنفس الأصل (اسمه ببصمة محتواه فيُخزَّن بأمان)
function buildDashboard() {
  const base = process.env.ADMIN_BASE || '/dashboard/';
  const dir = path.join(OUT, base.replace(/^\/|\/$/g, ''));
  const file = path.join(dir, 'index.html');
  if (!fs.existsSync(file)) fail(`لم أجد ${file}`);
  let s = fs.readFileSync(file, 'utf8');
  let n = 0;
  s = s.replace(/<script>([\s\S]*?)<\/script>/g, (_, code) => {
    const h = crypto.createHash('sha256').update(code).digest('hex').slice(0, 10);
    fs.mkdirSync(path.join(dir, 'assets'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'assets', `boot-${h}.js`), code.trim() + '\n');
    n += 1;
    return `<script src="${base}assets/boot-${h}.js"></script>`;
  });
  fs.writeFileSync(file, s);
  console.log(`✓ لوحة التحكم: ${n} سكربت مضمّن نُقل إلى ملف`);
}

const mode = process.argv[2] || 'site';
if (mode === 'site') await buildSite();
else if (mode === 'dashboard') buildDashboard();
else fail(`وضع غير معروف: ${mode}`);
