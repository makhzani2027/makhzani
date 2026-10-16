// يولّد كل صور الهوية (PNG) من ملفات SVG في brand/logo — شغّله: node scripts/render-brand.cjs
// يحتاج Playwright + Chromium (موجودان في بيئة السحابة). الناتج في brand/icons/
const fs = require('fs');
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }

const root = path.join(__dirname, '..');
const out = path.join(root, 'brand/icons');
fs.mkdirSync(out, { recursive: true });

const GLYPH = 'M56 17H98L82.5 37.7C82.5 80 62 101.5 20 103C54 93.5 71.5 75 71.5 37.7Z';
const HOLE = 'M84.5 27a7.5 7.5 0 1 0 -15 0a7.5 7.5 0 1 0 15 0Z';
const C = { ink: '#17140F', paper: '#F6F3EC', clay: '#B4461B', clayLight: '#E0703F', cream: '#FFF8F1', night: '#0F0D0A', dayInk: '#F4EFE6', ember: '#F2875A' };
const glyph = (fg, dot, scale = 1, cx = 60, cy = 60) => {
  // الرمز مصمم في مربع ١٢٠؛ scale يصغّره حول المركز (لمنطقة الأمان في أيقونة أندرويد)
  // dot = لون ثقب البطاقة؛ null = ثقب مفرغ (للأيقونات أحادية اللون)
  const t = `translate(${cx - 60 * scale} ${cy - 60 * scale}) scale(${scale})`;
  if (!dot) return `<g transform="${t}"><path d="${GLYPH} ${HOLE}" fill-rule="evenodd" fill="${fg}" stroke="${fg}" stroke-width="3" stroke-linejoin="round"/></g>`;
  return `<g transform="${t}"><path d="${GLYPH}" fill="${fg}" stroke="${fg}" stroke-width="3" stroke-linejoin="round"/><circle cx="77" cy="27" r="6" fill="${dot}"/></g>`;
};
const svg = (body, bg = null, rx = 0) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" width="100%" height="100%">${bg ? `<rect width="120" height="120" rx="${rx}" fill="${bg}"/>` : ''}${body}</svg>`;

const jobs = [
  // تطبيق المتجر (أندرويد/Play): مربع كامل، أندرويد يقص الزوايا بنفسه
  ['app-icon-1024.png', 1024, svg(glyph(C.cream, C.ink, 0.86), C.clay)],
  ['android-icon-background.png', 1024, svg('', C.clay)],
  ['android-icon-foreground.png', 1024, svg(glyph(C.cream, C.ink, 0.56))],
  ['android-icon-monochrome.png', 1024, svg(glyph('#FFFFFF', null, 0.56))],
  ['notification-icon-96.png', 96, svg(glyph('#FFFFFF', null, 0.92))],
  ['splash-icon.png', 512, svg(glyph(C.ink, C.clay, 0.9))],
  ['splash-icon-dark.png', 512, svg(glyph(C.dayInk, C.ember, 0.9))],
  // الويب (الموقع ولوحة التحكم)
  ['favicon-64.png', 64, svg(glyph(C.paper, C.clayLight, 0.86), C.ink, 30)],
  ['icon-192.png', 192, svg(glyph(C.paper, C.clayLight, 0.8), C.ink, 0)],
  ['icon-512.png', 512, svg(glyph(C.paper, C.clayLight, 0.8), C.ink, 0)],
  ['apple-touch-icon-180.png', 180, svg(glyph(C.paper, C.clayLight, 0.8), C.ink, 0)],
  ['store-icon-512.png', 512, svg(glyph(C.cream, C.ink, 0.86), C.clay, 0)],
];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  for (const [name, size, markup] of jobs) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<html><body style="margin:0;background:transparent">${markup}</body></html>`);
    await page.screenshot({ path: path.join(out, name), omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
    console.log('✓', name);
  }
  await browser.close();
})();
