// الجولة الآلية (الفاحص ٣): يفتح كل صفحة في برنامج الحاسوب على قاعدة بيانات حقيقية ويسجّل كل خطأ.
//   node e2e/crawl.mjs  (بعد flow.mjs: الحساب «مركز الحلول الكهربائية» بكلمة السر سر1234)
// يسجّل لكل صفحة: أخطاء JavaScript، أخطاء الطرفية، الطلبات الفاشلة (4xx/5xx) للخادم المحلي، والطلبات للإنترنت.
// النتيجة: $SHOTS/crawl-report.json + صورة لكل صفحة. يفشل إن وُجد أي خطأ.
import { chromium } from 'playwright';
import fs from 'node:fs';

const BASE = process.env.BASE ?? 'http://127.0.0.1:47831';
const SHOTS = process.env.SHOTS ?? 'e2e-shots';
const NAME = process.env.ACCOUNT ?? 'مركز الحلول الكهربائية';
const PASSWORD = process.env.PASSWORD ?? 'سر1234';
fs.mkdirSync(`${SHOTS}/crawl`, { recursive: true });

// صفحات لا تظهر في القائمة الجانبية لكن يصلها المستخدم
const EXTRA = ['/account', '/products/new'];
// طلبات للإنترنت مسموحة (لا تُعد خطأً): لا شيء — البرنامج يجب أن يعمل بلا إنترنت
const isLocal = (u) => u.startsWith(BASE) || u.startsWith('data:') || u.startsWith('blob:') || u.startsWith('about:');

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1360, height: 860 }, locale: 'ar' });
const page = await ctx.newPage();
let cur = '(login)';
const report = {};
const add = (kind, msg) => { (report[cur] ??= { errors: [] }).errors.push(`${kind}: ${String(msg).slice(0, 400)}`); };
page.on('pageerror', (e) => add('js', e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/favicon|ERR_INTERNET_DISCONNECTED/.test(m.text())) add('console', m.text()); });
page.on('response', async (r) => {
  const u = r.url();
  if (!u.startsWith(BASE) || r.status() < 400) return;
  // 401/403 من رفض مقصود (صلاحية) نسجّله أيضاً: صاحب الحساب يملك كل الصلاحيات
  let body = '';
  try { body = (await r.text()).slice(0, 200); } catch { /* */ }
  add(`http ${r.status()}`, `${r.request().method()} ${u.replace(BASE, '')} ${body}`);
});
page.on('request', (r) => { if (!isLocal(r.url())) add('internet', r.url()); });

try {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  if (!(await page.locator('.side-brand').count())) {
    await page.getByText(NAME).first().click();
    await page.locator('input[type=password]').fill(PASSWORD);
    await page.getByRole('button', { name: 'دخول' }).click();
  }
  await page.locator('.side-brand').waitFor({ timeout: 60_000 });
  await page.waitForTimeout(1000);
  const links = await page.$$eval('nav.side a[href]', (as) => as.map((a) => new URL(a.href).pathname));
  const paths = [...new Set([...links, ...EXTRA])];
  console.log(`صفحات: ${paths.length}`);
  for (const p of paths) {
    cur = p;
    report[p] ??= { errors: [] };
    try {
      await page.goto(`${BASE}${p}`, { waitUntil: 'networkidle', timeout: 30_000 });
      await page.waitForTimeout(800);
      const boundary = await page.locator('text=حدث خطأ غير متوقع').count();
      if (boundary) add('ui', 'شاشة «حدث خطأ غير متوقع»');
      const name = p.replace(/[^a-z0-9]+/gi, '_') || 'home';
      await page.screenshot({ path: `${SHOTS}/crawl/${name}.png` });
    } catch (e) {
      add('nav', e.message);
    }
    console.log(`${report[p].errors.length ? 'FAIL' : 'PASS'}: ${p}${report[p].errors.length ? `\n   ${report[p].errors.join('\n   ')}` : ''}`);
  }
} catch (e) {
  add('crawl', e.message);
  await page.screenshot({ path: `${SHOTS}/crawl/error.png` }).catch(() => {});
}
await browser.close();
fs.writeFileSync(`${SHOTS}/crawl-report.json`, JSON.stringify(report, null, 2));
const bad = Object.entries(report).filter(([, v]) => v.errors.length);
console.log(bad.length ? `\n${bad.length} صفحة فيها أخطاء` : '\nكل الصفحات بلا أخطاء');
process.exit(bad.length ? 1 : 0);
