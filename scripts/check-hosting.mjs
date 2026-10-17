// يفحص مجلد hosting/ بعد التجميع: كل رابط داخلي (href/src) يشير لملف موجود بقواعد Firebase (cleanUrls + إعادة توجيه اللوحة)،
// لا <script> مضمّن في لوحة التحكم (CSP)، ولا علامة بناء متبقية. يخرج بخطأ عند أي مشكلة.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(root, 'hosting');
const base = (process.env.ADMIN_BASE || '/dashboard/').replace(/\/?$/, '/');
const problems = [];

const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
const files = walk(OUT);
const exists = (p) => fs.existsSync(p) && fs.statSync(p).isFile();

function resolves(url, fromFile) {
  const clean = decodeURI(url.split(/[?#]/)[0]);
  if (!clean) return true; // رابط داخل الصفحة نفسها (#…)
  const abs = clean.startsWith('/') ? path.join(OUT, clean) : path.join(path.dirname(fromFile), clean);
  if (exists(abs) || exists(`${abs}.html`) || exists(path.join(abs, 'index.html'))) return true;
  // مسارات اللوحة الداخلية تُعاد كتابتها إلى index.html
  return clean.startsWith(base) && exists(path.join(OUT, base, 'index.html'));
}

for (const f of files.filter((x) => x.endsWith('.html'))) {
  const rel = path.relative(OUT, f);
  const s = fs.readFileSync(f, 'utf8');
  for (const [, attr, url] of s.matchAll(/\s(href|src)="([^"]+)"/g)) {
    if (/^(https?:|mailto:|tel:|data:|raqeem:|intent:|#|\/\/)/.test(url)) continue;
    if (!resolves(url, f)) problems.push(`${rel}: ${attr}="${url}" غير موجود`);
  }
  // معرّفات الروابط الداخلية (#id) في الصفحة نفسها
  const ids = new Set([...s.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
  for (const [, id] of s.matchAll(/\shref="#([^"]+)"/g)) if (!ids.has(id)) problems.push(`${rel}: الرابط #${id} بلا هدف`);
  if (/data-icon=|data-logo|data-wedge|<!--@|__ICONS__|\/\*@tokens\*\//.test(s)) problems.push(`${rel}: علامة بناء متبقية`);
  if (rel.startsWith(base.slice(1))) {
    for (const m of s.matchAll(/<script(\s[^>]*)?>([\s\S]*?)<\/script>/g)) {
      if (!/\ssrc=/.test(m[1] || '') && m[2].trim()) problems.push(`${rel}: <script> مضمّن ستمنعه CSP`);
    }
  }
}
for (const f of ['index.html', '404.html', 'privacy.html', 'terms.html', 'returns.html', 'licenses.html', 'download.json', 'robots.txt', 'sitemap.xml', 'og.png', 'p/index.html', `${base.slice(1)}index.html`]) {
  if (!exists(path.join(OUT, f))) problems.push(`ملف مطلوب مفقود: ${f}`);
}
for (const f of files.filter((x) => x.endsWith('.css') || x.endsWith('.js'))) {
  if (/__ICONS__|\/\*@tokens\*\//.test(fs.readFileSync(f, 'utf8'))) problems.push(`${path.relative(OUT, f)}: علامة بناء متبقية`);
}

if (problems.length) {
  console.error(problems.map((p) => `✗ ${p}`).join('\n'));
  process.exit(1);
}
console.log(`✓ فحص hosting/: ${files.length} ملفاً، كل الروابط الداخلية سليمة`);
