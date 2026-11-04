/**
 * عرض سعر A4 — المستند الذي يأخذه الزبون معه، فيُصمَّم ليبقى في ذهنه:
 * رأسية المتجر (أو صورة الرأسية المرفوعة)، عنوان العرض، «ماذا يقدّم لك هذا العرض» بارزة،
 * جدول البنود بصورها وعلاماتها، الإجمالي في كتلة آجُرية مع المبلغ بالحروف، العلامات المعتمدة،
 * الشروط، وموضع الختم والتوقيع. يمتد على أكثر من صفحة دون قطع صف أو كتلة.
 */
import { amountInWords, countOf, nouns, type InvoiceSettings, type Quotation, type QuotationItem, type StoreSettings } from '@raqeem/shared';
import { imgUrl } from '../lib/media';
import type { QuotationItemExtra } from '../pages/sales/api';
import { BRAND, code, escapeHtml, formatPhoneSafe, markSvg, printFmt, storeMark, type PrintDoc } from './common';

export interface QuotationPrintInput {
  quotation: Quotation;
  items: QuotationItem[];
  customer: { name: string; phone: string | null } | null;
  store: StoreSettings;
  invoice?: Pick<InvoiceSettings, 'letterhead_key'> | null;
  extras?: Record<string, QuotationItemExtra>;
  author?: string | null;
  /** شريط الشركات أعلى الورقة (من الإعدادات) — يحلّ محل شريط «علامات في هذا العرض» أسفلها */
  headerBrands?: { id: string; name: string; logo_key: string | null }[];
}

const ICON_CHECK = '<svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.2 4.2L19 7"/></svg>';
const ICON_PHONE = '<svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/></svg>';
const ICON_PIN = '<svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-6.3-7-11.5a7 7 0 0 1 14 0C19 14.7 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>';

export function buildQuotationA4(o: QuotationPrintInput): PrintDoc {
  const q = o.quotation;
  const f = printFmt({ ...o.store, currency: q.currency });
  const extras = o.extras ?? {};
  const hasDisc = o.items.some((i) => i.discount > 0);
  const pieces = o.items.reduce((s, i) => s + i.qty, 0);
  const customerName = o.customer?.name ?? q.customer_name ?? 'زبون';
  const phone = o.customer?.phone ?? q.customer_phone ?? null;
  const title = q.title?.trim() || 'عرض سعر';
  const validTxt = q.valid_until ? f.date(`${q.valid_until}T12:00:00Z`) : null;
  const letterhead = imgUrl(o.invoice?.letterhead_key ?? null, 'lg');

  // ---------------------------------------------------------------- الرأسية
  const contacts = [
    o.store.phone ? `<span>${ICON_PHONE}${code(formatPhoneSafe(o.store.phone))}</span>` : '',
    o.store.whatsapp && o.store.whatsapp !== o.store.phone ? `<span>${ICON_PHONE}${code(formatPhoneSafe(o.store.whatsapp))}</span>` : '',
    o.store.address ? `<span>${ICON_PIN}${escapeHtml(o.store.address)}</span>` : '',
  ].filter(Boolean).join('');
  const logoOf = (b: { name: string; logo_key: string | null }) => {
    const logo = imgUrl(b.logo_key, 'sm');
    return logo ? `<img src="${escapeHtml(logo)}" alt="${escapeHtml(b.name)}">` : `<b>${escapeHtml(b.name)}</b>`;
  };
  const top = o.headerBrands ?? [];
  const strip = top.length ? `<div class="hb">${top.map(logoOf).join('')}</div>` : '';
  const head = letterhead
    ? `<header class="lh${strip ? ' wb' : ''}"><img src="${escapeHtml(letterhead)}" alt="">${strip}</header>`
    : `<header class="hd${strip ? ' wb' : ''}"><div class="band">
  <div class="who">${storeMark(o.store, '15mm', '#fff', BRAND.brick)}<div><div class="nm">${escapeHtml(o.store.name)}</div>${o.store.legal_name ? `<div class="lg">${escapeHtml(o.store.legal_name)}</div>` : ''}</div></div>
  <div class="ct">${contacts}</div>
</div>${strip}</header>`;

  // ---------------------------------------------------------------- العنوان والبيانات
  const meta = (k: string, v: string) => `<div class="m"><span>${k}</span><b>${v}</b></div>`;
  const titleBlock = `<section class="ttl">
  <div class="tt"><div class="kind">عرض سعر</div><h1>${escapeHtml(title)}</h1></div>
  <div class="meta">${meta('رقم العرض', code(q.number))}${meta('التاريخ', f.date(q.created_at))}${validTxt ? meta('صالح حتى', validTxt) : ''}</div>
</section>
<section class="to">
  <div class="cell"><span>مقدَّم إلى</span><b>${escapeHtml(customerName)}</b>${phone ? `<i>${code(formatPhoneSafe(phone))}</i>` : ''}</div>
  <div class="cell"><span>مضمون العرض</span><b>${countOf(o.items.length, nouns.line, o.store.digits)}، ${Number.isInteger(pieces) ? countOf(pieces, nouns.item, o.store.digits) : `${f.qty(pieces)} قطعة`}</b><i>الأسعار ${q.currency === 'USD' ? 'بالدولار الأمريكي' : 'بالدينار العراقي'}</i></div>
  ${o.author ? `<div class="cell"><span>أعدّه</span><b>${escapeHtml(o.author)}</b><i>${escapeHtml(o.store.name)}</i></div>` : ''}
</section>`;

  // ---------------------------------------------------------------- المميزات
  const feats = (q.features ?? []).filter((x) => x.trim());
  const featBlock = feats.length ? `<section class="feats">
  <h3><span>${markSvg('5mm', '#fff', BRAND.brick)}</span>ماذا يقدّم لك هذا العرض</h3>
  <ul>${feats.map((x) => `<li><i>${ICON_CHECK}</i><span>${escapeHtml(x)}</span></li>`).join('')}</ul>
</section>` : '';

  // ---------------------------------------------------------------- البنود
  const rows = o.items.map((it, n) => {
    const ex = extras[it.variant_id];
    const src = imgUrl(ex?.image_key ?? null, 'sm');
    const sub = [it.variant_title, ex?.brand?.name].filter(Boolean).map((x) => escapeHtml(x)).join('، ');
    return `<tr>
  <td class="n">${f.num(n + 1)}</td>
  <td class="p"><div class="pi">${src ? `<img src="${escapeHtml(src)}" alt="">` : `<span class="ph">${markSvg('5mm', '#C9CDC8', '#fff')}</span>`}<div><b>${escapeHtml(it.name)}</b>${sub ? `<em>${sub}</em>` : ''}</div></div></td>
  <td class="e q">${f.qty(it.qty)}</td>
  <td class="e">${f.money(it.unit_price, true)}</td>
  ${hasDisc ? `<td class="e">${it.discount > 0 ? `− ${f.money(it.discount, true)}` : '—'}</td>` : ''}
  <td class="e t">${f.money(it.line_total, true)}</td>
</tr>`;
  }).join('');
  const table = `<table class="items">
  <thead><tr><th class="n">#</th><th>الصنف</th><th class="e" style="width:17mm">الكمية</th><th class="e" style="width:28mm">سعر القطعة</th>${hasDisc ? '<th class="e" style="width:22mm">الخصم</th>' : ''}<th class="e" style="width:31mm">المجموع</th></tr></thead>
  <tbody>${rows}</tbody>
</table>`;

  // ---------------------------------------------------------------- الإجمالي والشروط
  const words = amountInWords(q.total, q.currency);
  const terms = [
    q.note?.trim() || '',
    `هذا عرض أسعار وليس فاتورة.${validTxt ? ` الأسعار ثابتة حتى ${validTxt}` : ' الأسعار قابلة للتغيير'} وتخضع لتوفّر الكميات عند التأكيد.`,
  ].filter(Boolean);
  const sum = `<section class="sum">
  <div class="terms"><h4>الشروط والملاحظات</h4>${terms.map((t) => `<p>${escapeHtml(t)}</p>`).join('')}</div>
  <div class="tot">
    <div class="r"><span>مجموع البنود</span><b>${f.money(q.subtotal)}</b></div>
    ${q.discount > 0 ? `<div class="r disc"><span>خصم خاص</span><b>− ${f.money(q.discount)}</b></div>` : ''}
    <div class="grand"><span>الإجمالي</span><b>${f.money(q.total)}</b></div>
  </div>
</section>
${words ? `<div class="words"><span>المبلغ كتابةً</span>${escapeHtml(words)}</div>` : ''}`;

  // ---------------------------------------------------------------- العلامات المعتمدة
  const brands = new Map<string, NonNullable<QuotationItemExtra['brand']>>();
  for (const it of o.items) { const b = extras[it.variant_id]?.brand; if (b) brands.set(b.id, b); }
  const brandBlock = brands.size && !top.length ? `<section class="brands"><span>علامات تجارية في هذا العرض</span><div>${[...brands.values()].map(logoOf).join('')}</div></section>` : '';

  // ---------------------------------------------------------------- الختم والتوقيع
  const sign = `<div class="end"><section class="sign">
  <div class="s"><div class="ln"></div><span>موافقة الزبون وتوقيعه</span></div>
  <div class="seal">${markSvg('9mm', '#C9CDC8', '#fff')}<span>الختم</span></div>
  <div class="s"><div class="ln"></div><span>توقيع ${escapeHtml(o.store.name)}</span></div>
</section>
<footer class="ft"><span>${escapeHtml(o.store.name)}${o.store.address ? `، ${escapeHtml(o.store.address)}` : ''}</span><span>شكراً لثقتكم</span></footer></div>`;

  const html = `<div class="qa">${head}${titleBlock}${featBlock}${table}${sum}${brandBlock}${sign}</div>`;
  return { html, css: CSS, paper: 'A4', title: `${title} — ${q.number}` };
}

const CSS = `
.qa{color:${BRAND.ink};font-size:12px;line-height:1.6;direction:rtl}
.qa .ltr{direction:ltr;unicode-bidi:isolate;font-family:'Sans',system-ui,sans-serif;font-variant-numeric:tabular-nums}
.qa svg{display:block}
/* الرأسية */
.lh{margin:0 0 5mm}
.lh img{display:block;width:100%;max-height:48mm;object-fit:contain;border-radius:3mm}
.hd{margin-bottom:5mm}
.band{display:flex;justify-content:space-between;align-items:center;gap:8mm;background:${BRAND.ink};color:#fff;border-radius:4mm;padding:4mm 6mm;position:relative;overflow:hidden}
.hd.wb{border:1px solid ${BRAND.line};border-radius:4mm;overflow:hidden}
.hd.wb .band{border-radius:0}
.lh.wb{border:1px solid ${BRAND.line};border-radius:4mm;overflow:hidden}
.lh.wb>img{border-radius:0}
/* شريط الشركات تحت الرأسية */
.hb{display:flex;flex-wrap:wrap;justify-content:space-around;align-items:center;gap:3mm 7mm;padding:2.6mm 6mm;background:#fff}
.hb img{height:9mm;max-width:38mm;object-fit:contain}
.hb b{font-family:'Sans',system-ui,sans-serif;font-weight:900;font-size:15px;letter-spacing:.6px;direction:ltr;color:${BRAND.ink}}
.band::after{content:'';position:absolute;inset-inline-start:0;top:0;bottom:0;width:3mm;background:${BRAND.brick}}
.band .who{display:flex;align-items:center;gap:4mm}
.band .nm{font-family:'Display',serif;font-weight:900;font-size:27px;line-height:1.35;padding-bottom:.15em}
.band .lg{font-size:11px;color:#C9CDC8}
.band .ct{display:flex;flex-direction:column;align-items:flex-end;gap:1mm;font-size:11px;color:#E4E6E3}
.band .ct span{display:flex;align-items:center;gap:1.6mm}
/* العنوان */
.ttl{display:flex;justify-content:space-between;align-items:flex-end;gap:8mm;padding-bottom:4mm;border-bottom:1.5px solid ${BRAND.ink}}
.ttl .kind{display:inline-block;background:${BRAND.soft};color:${BRAND.brick};font-weight:900;font-size:11px;letter-spacing:.4px;padding:.6mm 3mm;border-radius:10mm;margin-bottom:1.5mm}
.ttl h1{margin:0;font-family:'Display',serif;font-weight:900;font-size:25px;line-height:1.45;padding-bottom:.18em}
.ttl .meta{display:flex;gap:0;border:1px solid ${BRAND.line};border-radius:3mm;overflow:hidden;flex:none}
.ttl .m{padding:2mm 4mm;text-align:center;min-width:26mm}
.ttl .m+.m{border-inline-start:1px solid ${BRAND.line}}
.ttl .m span{display:block;font-size:9.5px;color:${BRAND.ink2}}
.ttl .m b{font-size:12.5px}
.to{display:flex;gap:4mm;margin:4mm 0 4mm}
.to .cell{flex:1;background:#F6F7F5;border-radius:3mm;padding:2.5mm 4mm}
.to .cell span{display:block;font-size:9.5px;color:${BRAND.brick};font-weight:700}
.to .cell b{display:block;font-size:14px;line-height:1.5}
.to .cell i{display:block;font-style:normal;font-size:11px;color:${BRAND.ink2}}
/* المميزات */
.feats{border:1.5px solid ${BRAND.brick};border-radius:4mm;padding:3mm 5mm 2.5mm;margin-bottom:4mm;background:#FFFAF7;break-inside:avoid}
.feats h3{margin:0 0 2.5mm;display:flex;align-items:center;gap:2.5mm;font-family:'Display',serif;font-weight:900;font-size:16px;line-height:1.4;padding-bottom:.1em}
.feats h3 span{width:8mm;height:8mm;border-radius:2.4mm;background:${BRAND.brick};display:grid;place-items:center}
.feats ul{list-style:none;margin:0;padding:0;columns:2;column-gap:7mm}
.feats li{display:flex;gap:2.2mm;align-items:flex-start;break-inside:avoid;padding:.8mm 0;font-size:12px;font-weight:500}
.feats li i{flex:none;width:4.4mm;height:4.4mm;border-radius:50%;background:${BRAND.brick};display:grid;place-items:center;margin-top:.9mm}
/* البنود */
.items{width:100%;border-collapse:separate;border-spacing:0}
.items thead th{background:${BRAND.ink};color:#fff;font-size:10.5px;font-weight:700;padding:2.4mm 2.5mm;text-align:right}
.items thead th:first-child{border-radius:0 2.5mm 2.5mm 0}
.items thead th:last-child{border-radius:2.5mm 0 0 2.5mm}
.items td{padding:1.5mm 2.5mm;border-bottom:1px solid #ECEEEB;vertical-align:middle}
.items tr{break-inside:avoid}
.items .n{width:8mm;text-align:center;color:${BRAND.ink2};font-size:10.5px}
.items .pi{display:flex;align-items:center;gap:3mm}
.items .pi img,.items .ph{width:11mm;height:11mm;border-radius:2mm;object-fit:contain;background:#F3F4F2;flex:none;display:grid;place-items:center}
.items .pi b{display:block;font-size:12.5px;line-height:1.45}
.items .pi em{display:block;font-style:normal;font-size:10.5px;color:${BRAND.ink2}}
.items .e{text-align:left;white-space:nowrap;font-variant-numeric:tabular-nums}
.items .q{font-weight:700}
.items .t{font-weight:900}
/* الإجمالي */
.sum{display:flex;gap:7mm;margin-top:4mm;align-items:stretch;break-inside:avoid}
.terms{flex:1;font-size:11px;color:${BRAND.ink2}}
.terms h4{margin:0 0 1mm;color:${BRAND.ink};font-size:11.5px}
.terms p{margin:0 0 1.2mm;white-space:pre-line}
.tot{width:76mm;flex:none;border:1px solid ${BRAND.line};border-radius:4mm;overflow:hidden}
.tot .r{display:flex;justify-content:space-between;padding:2mm 4.5mm;font-size:12px}
.tot .r b{font-variant-numeric:tabular-nums}
.tot .disc b{color:${BRAND.brick}}
.tot .grand{display:flex;justify-content:space-between;align-items:center;background:${BRAND.brick};color:#fff;padding:3mm 4.5mm}
.tot .grand span{font-weight:700;font-size:13px}
.tot .grand b{font-family:'Display',serif;font-weight:900;font-size:21px;line-height:1.35;padding-bottom:.12em}
.words{margin-top:3mm;border:1px dashed ${BRAND.brick};border-radius:3mm;padding:2.2mm 4mm;font-weight:700;font-size:12px;background:#FFFAF7;break-inside:avoid}
.words span{color:${BRAND.brick};font-size:10px;margin-inline-end:3mm;font-weight:900}
/* العلامات */
.brands{display:flex;align-items:center;gap:5mm;margin-top:4mm;padding:2.5mm 0;border-top:1px solid ${BRAND.line};border-bottom:1px solid ${BRAND.line};break-inside:avoid}
.brands>span{font-size:10px;color:${BRAND.ink2};flex:none}
.brands div{display:flex;flex-wrap:wrap;align-items:center;gap:6mm}
.brands img{height:7mm;max-width:30mm;object-fit:contain}
.brands b{font-size:13px;letter-spacing:.3px;direction:ltr}
/* التوقيع */
.end{break-inside:avoid;padding-top:7mm}
.sign{display:flex;justify-content:space-between;align-items:flex-end;gap:10mm}
.sign .s{flex:1;text-align:center;font-size:10.5px;color:${BRAND.ink2}}
.sign .ln{border-top:1px solid ${BRAND.ink};margin-bottom:1.5mm}
.sign .seal{width:22mm;height:22mm;border-radius:50%;border:1.5px dashed #C9CDC8;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.5mm;color:#9AA19A;font-size:9.5px;flex:none}
.ft{margin-top:4mm;padding-top:2.5mm;border-top:1px solid ${BRAND.line};display:flex;justify-content:space-between;font-size:10px;color:${BRAND.ink2}}
`;
