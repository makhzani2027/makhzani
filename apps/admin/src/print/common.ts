/**
 * أساس قوالب الطباعة: كل قالب دالة نقية تعيد { html, css, paper, title } وتُطبع بـ printDoc().
 * الحرارية (٥٨/٨٠ ملم) أسود فقط بلا رمادي (الطابعات الحرارية تنقّط الرمادي فيبهت).
 * A4 بلون الطوب #C2410E والحبر #121513 من الهوية.
 */
import { formatDate, formatMoney, formatPhone, formatNumber, formatQty, formatTime, type StoreSettings } from '@raqeem/shared';
import { escapeHtml, type PaperSize } from '../lib/print';

export { escapeHtml };

export interface PrintDoc {
  html: string;
  css: string;
  paper: PaperSize;
  title: string;
}

export const BRAND = { brick: '#C2410E', ink: '#121513', ink2: '#50564F', line: '#DCDFDB', soft: '#FBE6DA', stone: '#EDEEEC' } as const;

const GLYPH = 'M56 17H98L82.5 37.7C82.5 80 62 101.5 20 103C54 93.5 71.5 75 71.5 37.7Z';

/** رمز رقيم كـ SVG نصي */
export function markSvg(size: string, ink = '#000', hole = '#fff'): string {
  return `<svg viewBox="0 0 120 120" width="${size}" height="${size}" aria-hidden="true"><path d="${GLYPH}" fill="${ink}" stroke="${ink}" stroke-width="3" stroke-linejoin="round"/><circle cx="77" cy="27" r="6" fill="${hole}"/></svg>`;
}

/** تنسيق الأرقام بإعدادات المتجر (العملة وشكل الأرقام) */
export function printFmt(store: Pick<StoreSettings, 'currency' | 'digits'>) {
  const digits = store.digits ?? 'arab';
  const currency = store.currency ?? 'IQD';
  return {
    money: (n: number | null | undefined, bare = false) => formatMoney(n, { currency, digits, bare }),
    num: (n: number) => formatNumber(n, { digits }),
    qty: (n: number) => formatQty(n, digits),
    date: (d: string | number | Date) => formatDate(d, { digits }),
    dateShort: (d: string | number | Date) => formatDate(d, { digits, short: true }),
    time: (d: string | number | Date) => formatTime(d, { digits }),
  };
}
export type PrintFmt = ReturnType<typeof printFmt>;

/** رمز لاتيني معزول الاتجاه (رقم فاتورة، SKU، هاتف) */
export const code = (s: string | null | undefined) => `<span class="ltr">${escapeHtml(s ?? '')}</span>`;

/** أنماط الإيصال الحراري. العرض الطباعي الفعلي ≈ ٧٢ ملم لورق ٨٠ و٤٨ ملم لورق ٥٨ */
export function thermalCss(width: 58 | 80): string {
  const w = width === 80 ? 72 : 48;
  const fs = width === 80 ? 12.5 : 10.5;
  return `
.t{width:${w}mm;margin:0 auto;padding:3mm 0 7mm;font-size:${fs}px;line-height:1.5;color:#000;direction:rtl}
.t *{color:#000}
.ltr{direction:ltr;unicode-bidi:isolate;font-family:ui-monospace,'Courier New',monospace;letter-spacing:.2px}
.c{text-align:center}
.mark{display:flex;justify-content:center;margin-bottom:1mm}
.store{font-family:'Display',serif;font-weight:900;font-size:${width === 80 ? 21 : 17}px;line-height:1.45;padding-bottom:.2em;text-align:center}
.sub{text-align:center;font-size:${fs - 1}px}
.note{text-align:center;font-size:${fs - 1}px;margin-top:1mm;white-space:pre-line}
.rule{border:0;border-top:1px dashed #000;margin:2.2mm 0}
.rule.solid{border-top:1.5px solid #000}
.kv{display:flex;justify-content:space-between;align-items:baseline;gap:2mm}
.kv>span:first-child{flex:none}
.kv>b,.kv>span:last-child{text-align:left;font-variant-numeric:tabular-nums}
.title{text-align:center;font-weight:900;font-size:${fs + 2}px;letter-spacing:.3px;margin:1mm 0}
.item{padding:1mm 0}
.item .n{font-weight:700;line-height:1.35}
.item .v{font-size:${fs - 1.5}px}
.item .q{display:flex;justify-content:space-between;gap:2mm;font-variant-numeric:tabular-nums}
.item .d{display:flex;justify-content:space-between;font-size:${fs - 1}px}
.item .s{font-size:${fs - 2}px;direction:ltr;text-align:right;font-family:ui-monospace,monospace;word-break:break-all}
.grand{display:flex;justify-content:space-between;align-items:baseline;font-family:'Display',serif;font-weight:900;font-size:${width === 80 ? 20 : 16}px;border-top:2px solid #000;border-bottom:2px solid #000;padding:1.2mm 0 1.6mm;margin:1.5mm 0}
.box{border:1.5px solid #000;border-radius:2mm;padding:1.6mm 2mm;margin:1.5mm 0}
.big{font-family:'Display',serif;font-weight:900;font-size:${width === 80 ? 22 : 17}px;line-height:1.4;padding-bottom:.15em}
.qr{display:flex;flex-direction:column;align-items:center;gap:1mm;margin-top:2mm}
.qr svg{width:${width === 80 ? 24 : 20}mm;height:${width === 80 ? 24 : 20}mm}
.thanks{text-align:center;font-weight:900;font-size:${fs + 1}px;margin-top:2mm}
.tiny{font-size:${fs - 2.5}px;text-align:center;margin-top:2mm}
`;
}

/** أنماط A4 المشتركة (فاتورة، كشف حساب، تقرير) */
export const a4Css = `
.a4{color:${BRAND.ink};font-size:12.5px;line-height:1.6;direction:rtl}
.ltr{direction:ltr;unicode-bidi:isolate;font-family:ui-monospace,'Courier New',monospace}
.head{display:flex;justify-content:space-between;align-items:flex-start;gap:12mm;padding-bottom:5mm;border-bottom:2px solid ${BRAND.ink}}
.brand{display:flex;gap:4mm;align-items:center}
.brand .nm{font-family:'Display',serif;font-weight:900;font-size:26px;line-height:1.4;padding-bottom:.15em}
.brand .meta{font-size:11.5px;color:${BRAND.ink2};line-height:1.55}
.doc{text-align:left}
.doc .kind{font-family:'Display',serif;font-weight:900;font-size:22px;color:${BRAND.brick};line-height:1.4;padding-bottom:.1em}
.doc .no{font-size:15px;font-weight:700}
.doc .meta{font-size:11.5px;color:${BRAND.ink2}}
.parties{display:grid;grid-template-columns:1fr 1fr;gap:6mm;margin:6mm 0 5mm}
.party{border:1px solid ${BRAND.line};border-radius:3mm;padding:3mm 4mm}
.party h4{margin:0 0 1mm;font-size:10.5px;color:${BRAND.brick};font-weight:700;letter-spacing:.3px}
.party b{font-size:14px}
table{width:100%;border-collapse:collapse}
th{background:${BRAND.ink};color:#fff;font-size:11px;font-weight:700;padding:2.2mm 2.5mm;text-align:right}
th:first-child{border-radius:0 2mm 2mm 0}th:last-child{border-radius:2mm 0 0 2mm}
td{padding:2.2mm 2.5mm;border-bottom:1px dashed ${BRAND.line};vertical-align:top}
tr:nth-child(even) td{background:#F6F7F5}
.e{text-align:left;font-variant-numeric:tabular-nums;white-space:nowrap}
.muted{color:${BRAND.ink2};font-size:11px}
.sum{display:flex;justify-content:space-between;gap:10mm;margin-top:5mm;align-items:flex-start}
.totals{min-width:72mm;border:1px solid ${BRAND.line};border-radius:3mm;padding:3mm 4mm}
.totals .r{display:flex;justify-content:space-between;padding:.8mm 0}
.totals .g{font-family:'Display',serif;font-weight:900;font-size:19px;border-top:1.5px solid ${BRAND.ink};margin-top:1.5mm;padding-top:2mm}
.totals .due{color:${BRAND.brick};font-weight:900}
.notes{flex:1;font-size:11.5px;color:${BRAND.ink2};white-space:pre-line}
.notes h4{margin:0 0 1mm;color:${BRAND.ink};font-size:11.5px}
.sign{display:grid;grid-template-columns:1fr 1fr;gap:20mm;margin-top:16mm}
.sign div{border-top:1px solid ${BRAND.ink};padding-top:2mm;text-align:center;font-size:11px;color:${BRAND.ink2}}
.foot{margin-top:10mm;padding-top:3mm;border-top:1px dashed ${BRAND.line};display:flex;justify-content:space-between;align-items:center;font-size:10.5px;color:${BRAND.ink2}}
.foot svg{width:18mm;height:18mm}
.stamp{display:inline-block;border:2px solid ${BRAND.brick};color:${BRAND.brick};font-weight:900;padding:1mm 4mm;border-radius:2mm;transform:rotate(-4deg);font-size:14px}
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:3mm;margin:5mm 0}
.kpi{border:1px solid ${BRAND.line};border-radius:3mm;padding:2.5mm 3.5mm}
.kpi span{display:block;font-size:10.5px;color:${BRAND.ink2}}
.kpi b{font-family:'Display',serif;font-weight:900;font-size:16px}
h3.sec{font-size:13px;margin:6mm 0 2mm;color:${BRAND.ink}}
`;

export function a4Header(store: StoreSettings, right: { kind: string; number?: string | null; meta: string[] }): string {
  // كل جزء يُهرَّب هنا (لا نفحص المحتوى بحثاً عن وسوم: العنوان نص يكتبه المستخدم)
  const meta = [
    store.address ? escapeHtml(store.address) : null,
    store.phone ? `هاتف: <span class="ltr">${escapeHtml(formatPhoneSafe(store.phone))}</span>` : null,
    store.email ? escapeHtml(store.email) : null,
  ].filter(Boolean);
  return `<div class="head">
  <div class="brand">${markSvg('16mm', BRAND.ink, BRAND.brick)}<div><div class="nm">${escapeHtml(store.name)}</div>${store.legal_name ? `<div class="meta">${escapeHtml(store.legal_name)}</div>` : ''}<div class="meta">${meta.join(' · ')}</div></div></div>
  <div class="doc"><div class="kind">${escapeHtml(right.kind)}</div>${right.number ? `<div class="no">${code(right.number)}</div>` : ''}${right.meta.map((m) => `<div class="meta">${m}</div>`).join('')}</div>
</div>`;
}

/** هاتف بصيغة محلية للعرض (لاتيني دائماً) */
export const formatPhoneSafe = (p: string | null | undefined) => formatPhone(p);
