// يولّد صورة المشاركة apps/site/og.png (١٢٠٠×٦٣٠) بخط ثمانية والشعار من brand/logo/mark.svg — شغّله: node scripts/render-og.cjs
// يحتاج Playwright + Chromium (موجودان في بيئة السحابة). الناتج يُحفظ في المستودع فلا يحتاجه البناء.
const fs = require('fs');
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }

const root = path.join(__dirname, '..');
const font = (dir, name) => `file://${path.join(root, 'assets/fonts/thmanyah', dir, 'woff2', `${name}.woff2`)}`;
const mark = fs.readFileSync(path.join(root, 'brand/logo/mark.svg'), 'utf8');
const GLYPH = mark.match(/<path[^>]* d="([^"]+)"/)[1];
const pattern = fs.readFileSync(path.join(root, 'apps/site/pattern.svg'), 'utf8');
const C = { paper: '#EDEEEC', ink: '#121513', ink2: '#4A514B', brick: '#C2410E', cream: '#FFF7F0', line: '#C3C8C2' };

const html = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><style>
@font-face{font-family:D;src:url('${font('serif-display', 'thmanyahserifdisplay-Black')}')}
@font-face{font-family:S;src:url('${font('sans', 'thmanyahsans-Medium')}')}
@font-face{font-family:SB;src:url('${font('sans', 'thmanyahsans-Bold')}')}
*{margin:0;box-sizing:border-box}
body{width:1200px;height:630px;background:${C.paper};color:${C.ink};position:relative;overflow:hidden;font-family:S}
.pat{position:absolute;inset:0;opacity:.06;background:${C.ink};-webkit-mask:url("data:image/svg+xml;utf8,${encodeURIComponent(pattern)}") 0 0/168px repeat}
.slab{position:absolute;inset-block:0;left:0;width:440px;background:${C.brick};display:grid;place-items:center}
.slab svg{width:300px;height:300px}
.copy{position:absolute;right:76px;top:78px;width:660px}
.brand{display:flex;align-items:center;gap:18px;font:56px/1.3 D;padding-bottom:6px}
.brand svg{width:64px;height:64px}
h1{font:124px/1.2 D;margin:18px 0 4px;padding-bottom:22px;white-space:nowrap}
h1 em{font-style:normal;color:${C.brick}}
p{font-size:29px;line-height:1.6;color:${C.ink2}}
.chips{display:flex;gap:12px;margin-top:30px}
.chips span{font:24px/1 SB;border:2px solid ${C.line};border-radius:99px;padding:12px 22px 16px}
</style></head><body>
<div class="pat"></div>
<div class="slab"><svg viewBox="0 0 120 120"><path d="${GLYPH}" fill="${C.cream}" stroke="${C.cream}" stroke-width="3" stroke-linejoin="round"/><circle cx="77" cy="27" r="6" fill="${C.brick}"/></svg></div>
<div class="copy">
  <div class="brand"><svg viewBox="0 0 120 120"><path d="${GLYPH}" fill="${C.ink}" stroke="${C.ink}" stroke-width="3" stroke-linejoin="round"/><circle cx="77" cy="27" r="6" fill="${C.brick}"/></svg>رَقيم</div>
  <h1>تسوّق <em>بثقة.</em></h1>
  <p>منتجات أصلية بضمان، وتوصيل لكل محافظات العراق.</p>
  <div class="chips"><span>الدفع عند الاستلام</span><span>إرجاع خلال ٧ أيام</span></div>
</div>
</body></html>`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
  const tmp = path.join(require('os').tmpdir(), `raqeem-og-${process.pid}.html`);
  fs.writeFileSync(tmp, html);
  await page.goto(`file://${tmp}`);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(200);
  const out = path.join(root, 'apps/site/og.png');
  await page.screenshot({ path: out });
  fs.unlinkSync(tmp);
  await browser.close();
  console.log(`✓ ${path.relative(root, out)}`);
})();
