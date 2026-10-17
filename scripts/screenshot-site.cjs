// لقطات تحقق بصري للموقع ولوحة التحكم من hosting/ (بعد build-hosting.sh وتشغيل serve-hosting.mjs).
// node scripts/screenshot-site.cjs http://localhost:4810 <مجلد الناتج> [صفحات مفصولة بفاصلة]
// يطبع أخطاء الكونسول، والتمرير الأفقي على عرض الهاتف، وأي رابط داخلي يرجع 404.
const fs = require('fs');
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }

const base = process.argv[2] || 'http://localhost:4810';
const out = process.argv[3] || 'screenshots';
const pages = (process.argv[4] || '/,/privacy,/terms,/returns,/licenses,/nope,/dashboard/').split(',');
fs.mkdirSync(out, { recursive: true });

const views = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'mobile', width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
];

(async () => {
  const browser = await chromium.launch();
  let bad = 0;
  for (const scheme of ['light', 'dark']) {
    for (const v of views) {
      const ctx = await browser.newContext({ viewport: { width: v.width, height: v.height }, isMobile: v.isMobile, hasTouch: v.hasTouch, deviceScaleFactor: v.deviceScaleFactor || 1, colorScheme: scheme, locale: 'ar-IQ' });
      // بلا مقدمة متحركة في اللقطات (تُختبر وحدها)
      await ctx.addInitScript(() => { try { sessionStorage.setItem('rq.intro', '1'); } catch (e) {} });
      for (const p of pages) {
        const page = await ctx.newPage();
        const errors = [];
        page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
        page.on('pageerror', (e) => errors.push(String(e)));
        await page.goto(base + p, { waitUntil: 'networkidle' });
        // نمرّر الصفحة كلها حتى تظهر عناصر «الظهور عند التمرير»
        await page.evaluate(async () => {
          for (let y = 0; y < document.body.scrollHeight; y += 500) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 60)); }
          window.scrollTo(0, 0);
        });
        await page.waitForTimeout(900);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        const slug = p.replace(/\W+/g, '-').replace(/^-|-$/g, '') || 'home';
        const file = path.join(out, `${slug}-${v.name}-${scheme}.png`);
        await page.screenshot({ path: file, fullPage: true });
        if (overflow > 0) { bad++; console.log(`✗ ${p} ${v.name}: تمرير أفقي ${overflow}px`); }
        if (errors.length) { bad++; console.log(`✗ ${p} ${v.name} ${scheme}: ${errors.join(' | ')}`); }
        console.log(`  ${file}`);
        await page.close();
      }
      await ctx.close();
    }
  }
  // الروابط الداخلية في الصفحة الرئيسية
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(base + '/', { waitUntil: 'networkidle' });
  const hrefs = await page.evaluate(() => [...new Set([...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')))]);
  for (const h of hrefs.filter((x) => x.startsWith('/'))) {
    const r = await page.request.get(base + h.split('#')[0]);
    if (r.status() >= 400) { bad++; console.log(`✗ رابط ${h} ← ${r.status()}`); }
  }
  console.log(`روابط داخلية فُحصت: ${hrefs.filter((x) => x.startsWith('/')).length}`);
  await browser.close();
  process.exit(bad ? 1 : 0);
})();
