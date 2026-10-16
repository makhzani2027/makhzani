// يبني لوحة الهوية brand/brand-board.html (صفحة واحدة مستقلة: الخطوط مضمّنة base64 والأيقونات من shared)
// تشغيل: node --experimental-strip-types scripts/build-brand-board.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { icons } from '../packages/shared/src/icons.ts';
import { palette, tones } from '../packages/shared/src/theme.ts';

const root = new URL('..', import.meta.url).pathname;
const font = (p) => readFileSync(root + 'assets/fonts/thmanyah/' + p).toString('base64');
const faces = [
  ['RqSans', 'sans/woff2/thmanyahsans-Regular.woff2', 400],
  ['RqSans', 'sans/woff2/thmanyahsans-Bold.woff2', 700],
  ['RqDisplay', 'serif-display/woff2/thmanyahserifdisplay-Black.woff2', 900],
  ['RqReading', 'serif-text/woff2/thmanyahseriftext-Regular.woff2', 400],
].map(([f, p, w]) => `@font-face{font-family:'${f}';src:url(data:font/woff2;base64,${font(p)}) format('woff2');font-weight:${w};font-display:swap}`).join('\n');

const G = 'M56 17H98L82.5 37.7C82.5 80 62 101.5 20 103C54 93.5 71.5 75 71.5 37.7Z';
const ic = (n, s = 24) => `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${icons[n]}"/></svg>`;
const iconGrid = Object.keys(icons).map((n) => `<li title="${n}">${ic(n, 26)}<span>${n}</span></li>`).join('');
const L = palette.light, D = palette.dark;
const sw = (name, ar, l, d, note = '') => `<li class="sw"><span class="chip" style="--l:${l};--d:${d}"></span><b>${ar}</b><code>${l} · ${d}</code>${note ? `<small>${note}</small>` : ''}</li>`;

const html = `<title>رَقيم — الهوية</title>
<meta name="claude:viewport-fit-sides" content="cover">
<style>
${faces}
/* لوحة هوية رقيم: صفحة طويلة بأقسام، الرمز يقود — الحجر خلفية والآجُر لمسة واحدة */
:root{
  --bg:${L.bg};--card:${L.card};--sunken:${L.sunken};--ink:${L.ink};--ink2:${L.ink2};--ink3:${L.ink3};--line:${L.line};
  --accent:${L.accent};--accent-soft:${L.accentSoft};--accent-soft-ink:${L.accentSoftInk};--hero:${L.hero};--hero-ink:${L.heroInk};--hero-ink2:${L.heroInk2};
  --ok:${tones.light.success.ink};--ok-bg:${tones.light.success.bg};--warn:${tones.light.warning.ink};--warn-bg:${tones.light.warning.bg};
  --bad:${tones.light.danger.ink};--bad-bg:${tones.light.danger.bg};--info:${tones.light.info.ink};--info-bg:${tones.light.info.bg};
  --f-sans:'RqSans',system-ui,'Segoe UI',Tahoma,sans-serif;--f-display:'RqDisplay','RqSans',serif;--f-read:'RqReading','RqSans',serif;
}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){
  --bg:${D.bg};--card:${D.card};--sunken:${D.sunken};--ink:${D.ink};--ink2:${D.ink2};--ink3:${D.ink3};--line:${D.line};
  --accent:${D.accent};--accent-soft:${D.accentSoft};--accent-soft-ink:${D.accentSoftInk};--hero:${D.hero};--hero-ink:${D.heroInk};--hero-ink2:${D.heroInk2};
  --ok:${tones.dark.success.ink};--ok-bg:${tones.dark.success.bg};--warn:${tones.dark.warning.ink};--warn-bg:${tones.dark.warning.bg};
  --bad:${tones.dark.danger.ink};--bad-bg:${tones.dark.danger.bg};--info:${tones.dark.info.ink};--info-bg:${tones.dark.info.bg};color-scheme:dark}}
:root[data-theme="dark"]{
  --bg:${D.bg};--card:${D.card};--sunken:${D.sunken};--ink:${D.ink};--ink2:${D.ink2};--ink3:${D.ink3};--line:${D.line};
  --accent:${D.accent};--accent-soft:${D.accentSoft};--accent-soft-ink:${D.accentSoftInk};--hero:${D.hero};--hero-ink:${D.heroInk};--hero-ink2:${D.heroInk2};
  --ok:${tones.dark.success.ink};--ok-bg:${tones.dark.success.bg};--warn:${tones.dark.warning.ink};--warn-bg:${tones.dark.warning.bg};
  --bad:${tones.dark.danger.ink};--bad-bg:${tones.dark.danger.bg};--info:${tones.dark.info.ink};--info-bg:${tones.dark.info.bg};color-scheme:dark}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font-family:var(--f-sans);font-size:16px;line-height:1.75;direction:rtl;
  padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px))}
main{max-width:1120px;margin:0 auto;padding-block:28px 80px;display:flex;flex-direction:column;gap:72px}
h1,h2,h3{margin:0;font-family:var(--f-display);font-weight:900;line-height:1.45;padding-bottom:.14em;text-wrap:balance}
h2{font-size:clamp(28px,4vw,38px)} h3{font-family:var(--f-sans);font-weight:700;font-size:18px;padding:0}
p{margin:0;max-width:62ch} code{font-family:ui-monospace,Menlo,monospace;font-size:12.5px;direction:ltr;unicode-bidi:isolate;color:var(--ink3)}
.eyebrow{font-size:13px;font-weight:700;color:var(--accent);letter-spacing:.3px}
.lead{color:var(--ink2);font-size:18px}
section{display:flex;flex-direction:column;gap:22px}
.head{display:flex;flex-direction:column;gap:4px}
/* البطل */
.hero{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.1fr);gap:28px;align-items:center;background:var(--hero);color:var(--hero-ink);border-radius:32px;padding:clamp(24px,5vw,56px);overflow:hidden;position:relative}
.hero .mark{width:min(260px,60vw);height:auto;justify-self:center}
.hero h1{font-size:clamp(64px,11vw,128px);line-height:1.3}
.hero .tag{font-family:var(--f-display);font-size:clamp(22px,3vw,30px);color:#E8622A}
.hero p{color:var(--hero-ink2)}
.hero::after{content:"";position:absolute;inset:0;pointer-events:none;opacity:.05;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='96'%3E%3Cg fill='%23ffffff'%3E%3Cpath d='M10 10h22l-8 10.5V30h-6v-9.5z'/%3E%3Cpath d='M70 52h22l-8 10.5V72h-6v-9.5z'/%3E%3Cpath d='M64 14l18 6-18 6z'/%3E%3Cpath d='M8 58l18 6-18 6z'/%3E%3C/g%3E%3C/svg%3E")}
.g-wedge{stroke-dasharray:420;stroke-dashoffset:420;animation:draw 1.1s .25s cubic-bezier(.3,0,0,1) forwards}
.g-fill{opacity:0;animation:fill .4s 1.1s ease forwards}.g-hole{transform-origin:77px 27px;transform:scale(0);animation:punch .3s 1.35s cubic-bezier(.2,.8,.2,1) forwards}
@keyframes draw{to{stroke-dashoffset:0}}@keyframes fill{to{opacity:1}}@keyframes punch{to{transform:scale(1)}}
@media (prefers-reduced-motion:reduce){.g-wedge,.g-fill,.g-hole{animation:none;stroke-dashoffset:0;opacity:1;transform:none}}
/* الشبكات */
.grid3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}
.grid2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
.card{background:var(--card);border:1px solid var(--line);border-radius:22px;padding:22px;display:flex;flex-direction:column;gap:10px;min-width:0}
.step svg{width:100%;max-width:180px;height:auto;align-self:center}
.step .n{font-family:var(--f-display);font-size:30px;color:var(--accent);line-height:1}
.icons-row{display:flex;gap:18px;align-items:flex-end;flex-wrap:wrap}
.phone{background:#1b1e1c;border-radius:28px;padding:22px;display:grid;grid-template-columns:repeat(4,56px);gap:16px 18px;justify-content:center}
.phone span{display:flex;flex-direction:column;align-items:center;gap:6px;font-size:11px;color:#d9ddd8}
.phone i{width:56px;height:56px;border-radius:16px;background:#3a3f3b;display:block}
.sws{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px}
.sw{background:var(--card);border:1px solid var(--line);border-radius:18px;padding:12px;display:flex;flex-direction:column;gap:2px}
.sw .chip{height:72px;border-radius:12px;background:linear-gradient(90deg,var(--l) 0 50%,var(--d) 50% 100%);border:1px solid var(--line);margin-bottom:8px}
.sw small{color:var(--ink3);font-size:12.5px}
.spec{display:flex;flex-direction:column;gap:14px}
.spec .row{display:grid;grid-template-columns:120px minmax(0,1fr);gap:16px;align-items:baseline;border-bottom:1px dashed var(--line);padding-bottom:12px}
.spec .row > code{white-space:nowrap}.spec .row code + code{white-space:normal;overflow-wrap:anywhere}
.iconset{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(92px,1fr));gap:8px}
.iconset li{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:12px 4px 8px;display:flex;flex-direction:column;align-items:center;gap:6px;color:var(--ink)}
.iconset span{font-size:10.5px;color:var(--ink3);direction:ltr;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
/* عينات الواجهة */
.btn{height:44px;padding:0 18px;border-radius:12px;border:1px solid var(--line);background:var(--card);color:var(--ink);font:700 14px var(--f-sans);display:inline-flex;align-items:center;gap:8px}
.btn.primary{background:var(--accent);border-color:transparent;color:#fff}.btn.ink{background:var(--ink);color:var(--bg);border-color:transparent}
.badges{display:flex;gap:8px;flex-wrap:wrap}.badge{height:26px;padding:0 11px;border-radius:99px;font-size:12.5px;font-weight:700;display:inline-flex;align-items:center;gap:6px}
.badge::before{content:"";width:6px;height:6px;border-radius:50%;background:currentColor}
.b-ok{background:var(--ok-bg);color:var(--ok)}.b-warn{background:var(--warn-bg);color:var(--warn)}.b-bad{background:var(--bad-bg);color:var(--bad)}.b-info{background:var(--info-bg);color:var(--info)}.b-acc{background:var(--accent-soft);color:var(--accent-soft-ink)}
.product{background:var(--card);border:1px solid var(--line);border-radius:20px;overflow:hidden;max-width:240px}
.product .img{aspect-ratio:1;background:var(--accent-soft);color:var(--accent);display:flex;align-items:center;justify-content:center;position:relative}
.ptag{position:absolute;top:12px;inset-inline-start:12px;background:var(--accent);color:#fff;font-weight:700;font-size:12.5px;height:26px;padding:0 10px 0 12px;border-radius:7px;display:flex;align-items:center;gap:6px}
.ptag::before{content:"";width:5px;height:5px;border-radius:50%;background:var(--card)}
.product .body{padding:12px 14px;display:flex;flex-direction:column;gap:2px}
.price{font-family:var(--f-display);font-size:20px}.old{color:var(--ink3);text-decoration:line-through;font-size:13px}
.kpi{background:var(--card);border:1px solid var(--line);border-radius:20px;padding:18px;display:flex;flex-direction:column;gap:4px}
.kpi b{font-family:var(--f-display);font-size:32px;font-variant-numeric:tabular-nums}.kpi .d{color:var(--ok);background:var(--ok-bg);border-radius:99px;padding:0 8px;font-size:12px;font-weight:700;align-self:flex-start}
.receipt{background:#fff;color:#000;width:min(290px,100%);padding:18px 16px;border-radius:6px;font-size:12.5px;line-height:1.6;box-shadow:0 18px 40px -22px rgba(0,0,0,.45)}
.receipt hr{border:0;border-top:1px dashed #000;margin:8px 0}.receipt .r{display:flex;justify-content:space-between;gap:8px}.receipt .t{font-family:var(--f-display);font-size:18px}
.voice li{margin-bottom:6px}.voice b{color:var(--ok)}.voice s{color:var(--bad);text-decoration-thickness:1px}
footer{color:var(--ink3);font-size:13px;text-align:center}
@media (max-width:820px){.hero,.grid3,.grid2{grid-template-columns:1fr}.spec .row{grid-template-columns:1fr;gap:2px}}
</style>
<main>
  <header class="hero">
    <svg class="mark" viewBox="0 0 120 120" aria-label="رمز رقيم" role="img">
      <path class="g-fill" d="${G}" fill="#EDEEEC"/>
      <path class="g-wedge" d="${G}" fill="none" stroke="#EDEEEC" stroke-width="3" stroke-linejoin="round"/>
      <circle class="g-hole" cx="77" cy="27" r="6" fill="#E8622A"/>
    </svg>
    <div style="display:flex;flex-direction:column;gap:10px;position:relative;z-index:1">
      <span class="eyebrow" style="color:#E8622A">الهوية البصرية · ٢٠٢٦</span>
      <h1>رَقيم</h1>
      <span class="tag">كلُّ قطعةٍ مرقومة.</span>
      <p>في أوروك جنوب العراق، قبل أكثر من خمسة آلاف عام، ضغط الكتبة قلم القصب على ألواح الطين ليسجلوا الحبوب والأغنام. كانت تلك أول كتابة، وأول جرد مخزون في التاريخ. «الرقيم» هو اللوح المكتوب، ونظامنا يكمل القصة: يسجل كل قطعة بدقة لا تُمحى.</p>
    </div>
  </header>

  <section>
    <div class="head"><span class="eyebrow">الرمز</span><h2>إسفينٌ واحد، ثلاث قراءات</h2>
      <p class="lead">أثر قلم القصب على الطين إسفين: رأس مثلث وذيل. ينحني ذيله فيصير حرف «ر»، ويُثقب رأسه فيصير بطاقة سعر معلقة على منتج.</p></div>
    <div class="grid3">
      <div class="card step"><span class="n">١</span><svg viewBox="0 0 120 120"><path d="M50 14H96L73 44Z" fill="var(--ink)"/><path d="M68 40h10v60h-10z" fill="var(--ink)" opacity=".25"/></svg><h3>الإسفين المسماري</h3><p class="lead" style="font-size:15px">أصل الكتابة كلها: ضغطة قلم في لوح طين.</p></div>
      <div class="card step"><span class="n">٢</span><svg viewBox="0 0 120 120"><path d="${G}" fill="var(--ink)"/></svg><h3>يصير «ر»</h3><p class="lead" style="font-size:15px">الذيل ينحني من اليمين لليسار كما نكتب، فيصير أول حرف من الاسم.</p></div>
      <div class="card step"><span class="n">٣</span><svg viewBox="0 0 120 120"><path d="${G}" fill="var(--ink)" stroke="var(--ink)" stroke-width="3" stroke-linejoin="round"/><circle cx="77" cy="27" r="6" fill="var(--accent)"/></svg><h3>ويصير بطاقة سعر</h3><p class="lead" style="font-size:15px">ثقب في الرأس: التجارة والمخزون في نقطة واحدة.</p></div>
    </div>
    <div class="grid2">
      <div class="card"><h3>أيقونة تطبيق المتجر</h3><div class="icons-row">
        ${[96, 64, 40, 24].map((s) => `<svg viewBox="0 0 120 120" width="${s}" height="${s}"><rect width="120" height="120" rx="34" fill="#C2410E"/><path d="${G}" fill="#FFF7F0" stroke="#FFF7F0" stroke-width="3" stroke-linejoin="round"/><circle cx="77" cy="27" r="6" fill="#121513"/></svg>`).join('')}
      </div><p class="lead" style="font-size:15px">الآجُر الحار يبرز بين أيقونات الهاتف.</p></div>
      <div class="card"><h3>أيقونة لوحة التحكم والموقع</h3><div class="icons-row">
        ${[96, 64, 40, 24].map((s) => `<svg viewBox="0 0 120 120" width="${s}" height="${s}"><rect width="120" height="120" rx="34" fill="#121513"/><path d="${G}" fill="#EDEEEC" stroke="#EDEEEC" stroke-width="3" stroke-linejoin="round"/><circle cx="77" cy="27" r="6" fill="#E8622A"/></svg>`).join('')}
      </div><p class="lead" style="font-size:15px">القار الهادئ للأدوات التي يعمل بها الموظفون يومياً.</p></div>
    </div>
    <div class="phone" aria-label="الأيقونة على شاشة الهاتف">
      ${['','','','','','<svg viewBox="0 0 120 120" width="56" height="56"><rect width="120" height="120" rx="34" fill="#C2410E"/><path d="' + G + '" fill="#FFF7F0" stroke="#FFF7F0" stroke-width="3" stroke-linejoin="round"/><circle cx="77" cy="27" r="6" fill="#121513"/></svg>','',''].map((x, i) => `<span>${x || '<i></i>'}${i === 5 ? 'رقيم' : ''}</span>`).join('')}
    </div>
  </section>

  <section>
    <div class="head"><span class="eyebrow">الألوان</span><h2>مواد بلاد الرافدين</h2>
      <p class="lead">حجر رمادي بارد وقار وآجُر مفخور: مخزن حقيقي فيه رفوف وبضاعة. لون مميز واحد فقط، وألوان الحالات للحالات وحدها. كل مربع: نصفه للوضع الفاتح ونصفه للغامق.</p></div>
    <ul class="sws">
      ${sw('bg', 'الحجر — الخلفية', L.bg, D.bg)}${sw('card', 'البطاقة', L.card, D.card)}${sw('ink', 'القار — النص', L.ink, D.ink)}
      ${sw('ink2', 'نص ثانوي', L.ink2, D.ink2)}${sw('line', 'الحدود', L.line, D.line)}${sw('accent', 'آجُر بابل — المميز', L.accent, D.accent, 'الأزرار الرئيسية، الروابط، بطاقة السعر')}
      ${sw('ok', 'النخيل — نجاح', tones.light.success.ink, tones.dark.success.ink)}${sw('warn', 'التمر — تنبيه', tones.light.warning.ink, tones.dark.warning.ink)}
      ${sw('bad', 'الرمان — خطر', tones.light.danger.ink, tones.dark.danger.ink)}${sw('info', 'اللازورد — معلومة', tones.light.info.ink, tones.dark.info.ink)}
    </ul>
  </section>

  <section>
    <div class="head"><span class="eyebrow">الخط</span><h2>ثمانية، بثلاثة أصوات</h2>
      <p class="lead">Serif Display للعناوين والأرقام الكبيرة، Sans لكل الواجهة، Serif Text للقراءة الطويلة. الأرقام مشرقية في الواجهة، والرموز (SKU والباركود والهاتف) لاتينية دائماً.</p></div>
    <div class="card spec">
      <div class="row"><code>عرض · 44</code><span style="font-family:var(--f-display);font-size:44px;line-height:1.4">تسوّق بثقة.</span></div>
      <div class="row"><code>رقم كبير</code><span style="font-family:var(--f-display);font-size:34px;font-variant-numeric:tabular-nums">١٢٬٤٥٠٬٠٠٠ <small style="font-family:var(--f-sans);font-size:14px;color:var(--ink3)">د.ع</small></span></div>
      <div class="row"><code>عنوان · 23</code><span style="font-family:var(--f-display);font-size:23px">ملخص مبيعات اليوم</span></div>
      <div class="row"><code>واجهة · 15</code><span>أضف المنتج، حدد القسم، وامسح الباركود لتسجيل النسخة.</span></div>
      <div class="row"><code>قراءة · 17</code><span style="font-family:var(--f-read);font-size:17px;line-height:1.95">سماعة لاسلكية بعزل نشط للضوضاء، وبطارية تكفي أربعين ساعة من الاستماع المتواصل.</span></div>
      <div class="row"><code>رموز</code><code style="font-size:15px;color:var(--ink);white-space:normal;overflow-wrap:anywhere">RQ-00042 · 2000000000428 · 0770 123 4567 · S-000123</code></div>
    </div>
  </section>

  <section>
    <div class="head"><span class="eyebrow">الأيقونات</span><h2>${Object.keys(icons).length} أيقونة رُسمت للمشروع</h2>
      <p class="lead">شبكة ٢٤، خط ١٫٧٥، أطراف مدورة. مصدر واحد للوحة والتطبيق والموقع، بلا مكتبات جاهزة وبلا إيموجي.</p></div>
    <ul class="iconset">${iconGrid}</ul>
  </section>

  <section>
    <div class="head"><span class="eyebrow">في الواجهة</span><h2>كيف تبدو الهوية في الاستعمال</h2></div>
    <div class="grid3">
      <div class="card" style="align-items:flex-start"><h3>منتج في المتجر</h3>
        <div class="product"><div class="img">${ic('activity', 56)}<span class="ptag">−١٧٪</span></div>
          <div class="body"><span>سماعة لاسلكية بعزل الضوضاء</span><span class="price">١٢٥٬٠٠٠ د.ع</span><span class="old">١٥٠٬٠٠٠ د.ع</span></div></div>
        <p class="lead" style="font-size:14px">بطاقة السعر بثقب: نفس فكرة الرمز.</p></div>
      <div class="card"><h3>مؤشر في لوحة التحكم</h3>
        <div class="kpi"><span style="color:var(--ink2);font-weight:700;font-size:13px">مبيعات اليوم</span><b>٣٬٢٨٠٬٠٠٠</b><span class="d">▲ ١٢٪ عن أمس</span></div>
        <div style="display:flex;gap:8px;flex-wrap:wrap"><span class="btn primary">${ic('pos', 18)}بيع جديد</span><span class="btn">${ic('printer', 18)}طباعة</span><span class="btn ink">حفظ</span></div>
        <div class="badges"><span class="badge b-acc">جديد</span><span class="badge b-info">مؤكد</span><span class="badge b-warn">مع المندوب</span><span class="badge b-ok">تم التسليم</span><span class="badge b-bad">نفدت الكمية</span></div></div>
      <div class="card" style="align-items:center"><h3 style="align-self:flex-start">إيصال حراري ٨٠ ملم</h3>
        <div class="receipt"><div style="text-align:center"><svg viewBox="0 0 120 120" width="34" height="34"><path d="${G}" fill="#000"/><circle cx="77" cy="27" r="6" fill="#fff"/></svg><div class="t">رَقيم</div><div>بغداد — الكرادة · 0770 000 0000</div></div><hr>
          <div class="r"><span>فاتورة</span><code style="color:#000">S-000123</code></div><div class="r"><span>التاريخ</span><span>١٦ تشرين الأول ٢٠٢٦ · ٩:٠٥ م</span></div><hr>
          <div class="r"><span>شاحن سريع ٦٥ واط ×١</span><span>٤٥٬٠٠٠</span></div><div class="r"><span>كابل USB-C ×٢</span><span>١٨٬٠٠٠</span></div><hr>
          <div class="r t"><span>الإجمالي</span><span>٦٣٬٠٠٠ د.ع</span></div><div class="r"><span>نقداً</span><span>٦٥٬٠٠٠</span></div><div class="r"><span>الباقي</span><span>٢٬٠٠٠</span></div><hr>
          <div style="text-align:center">شكراً لتسوقكم</div></div></div>
    </div>
  </section>

  <section>
    <div class="head"><span class="eyebrow">الحركة والنبرة</span><h2>هادئة، سريعة، واضحة</h2></div>
    <div class="grid2">
      <div class="card"><h3>الحركة</h3><p class="lead" style="font-size:15px">١٤٠ جزءاً من الثانية للتفاعل، ٢٠٠ للانتقال، ٣٢٠ للوحات، بلا نوابض متأرجحة. المقدمة: الإسفين يُضغط، الذيل يُرسم «ر»، ثم يُثقب الثقب (كما في أعلى الصفحة). المنتج يطير إلى السلة بخط منحنٍ. كل الحركة تحترم «تقليل الحركة».</p></div>
      <div class="card voice"><h3>النبرة</h3><ul style="margin:0;padding-inline-start:18px">
        <li><b>تمت إضافة المنتج إلى السلة</b> — <s>تمت العملية بنجاح!!</s></li>
        <li><b>انقطع الإنترنت. سنرسل طلبك عند عودته.</b> — <s>خطأ في الشبكة</s></li>
        <li><b>٣ منتجات · منتجان · ١١ منتجاً</b> — <s>3 منتج</s></li></ul></div>
    </div>
  </section>
  <footer>هوية رقيم · المصدر البرمجي: packages/shared/src/theme.ts و icons.ts · خط ثمانية مستخدم وفق ترخيصه (ممنوع على اللافتات الخارجية)</footer>
</main>`;
writeFileSync(root + 'brand/brand-board.html', html);
console.log('brand/brand-board.html', Math.round(html.length / 1024), 'KB');
