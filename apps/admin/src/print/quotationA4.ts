/** عرض سعر A4: بيانات المتجر والزبون، البنود، الإجمالي، مدة الصلاحية، ملاحظة، توقيع */
import { QUOTATION_STATUS, type Quotation, type QuotationItem, type StoreSettings } from '@raqeem/shared';
import { a4Css, a4Header, code, escapeHtml, formatPhoneSafe, printFmt, type PrintDoc } from './common';

export function buildQuotationA4(o: { quotation: Quotation; items: QuotationItem[]; customer: { name: string; phone: string | null } | null; store: StoreSettings; author?: string | null }): PrintDoc {
  const q = o.quotation;
  const f = printFmt({ ...o.store, currency: q.currency });
  const rows = o.items.map((i, n) => `<tr>
  <td class="e">${f.num(n + 1)}</td>
  <td><b>${escapeHtml(i.name)}</b>${i.variant_title ? `<div class="muted">${escapeHtml(i.variant_title)}</div>` : ''}</td>
  <td class="e">${f.qty(i.qty)}</td>
  <td class="e">${f.money(i.unit_price, true)}</td>
  <td class="e">${i.discount > 0 ? f.money(i.discount, true) : '—'}</td>
  <td class="e"><b>${f.money(i.line_total, true)}</b></td>
</tr>`).join('');
  const r = (k: string, v: string, cls = '') => `<div class="r ${cls}"><span>${k}</span><span class="e">${v}</span></div>`;
  const html = `<div class="a4">
${a4Header(o.store, { kind: 'عرض سعر', number: q.number, meta: [`التاريخ: ${f.date(q.created_at)}`, q.valid_until ? `ساري حتى: ${f.date(`${q.valid_until}T12:00:00Z`)}` : '', o.author ? `المحرر: ${escapeHtml(o.author)}` : ''].filter(Boolean) })}
<div class="parties">
  <div class="party"><h4>مقدَّم إلى</h4><b>${escapeHtml(o.customer?.name ?? q.customer_name ?? 'زبون')}</b>${o.customer?.phone ? `<div class="muted">${code(formatPhoneSafe(o.customer.phone))}</div>` : ''}</div>
  <div class="party"><h4>الحالة</h4><b>${escapeHtml(QUOTATION_STATUS[q.status].label)}</b><div class="muted">الأسعار ${q.currency === 'USD' ? 'بالدولار الأمريكي' : 'بالدينار العراقي'}</div></div>
</div>
<table>
  <thead><tr><th style="width:8mm">#</th><th>المنتج</th><th class="e" style="width:16mm">الكمية</th><th class="e" style="width:26mm">السعر</th><th class="e" style="width:22mm">الخصم</th><th class="e" style="width:28mm">المجموع</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
<div class="sum">
  <div class="notes">${q.note ? `<h4>ملاحظات</h4>${escapeHtml(q.note)}<br><br>` : ''}<h4>الشروط</h4>هذا العرض للأسعار فقط ولا يُعد فاتورة. الأسعار ${q.valid_until ? `ثابتة حتى ${f.date(`${q.valid_until}T12:00:00Z`)}` : 'قابلة للتغيير'} وتخضع لتوفر الكميات.</div>
  <div class="totals">
    ${r('مجموع البنود', f.money(q.subtotal))}
    ${q.discount > 0 ? r('الخصم', `− ${f.money(q.discount)}`) : ''}
    ${r('الإجمالي', f.money(q.total), 'g')}
  </div>
</div>
<div class="sign"><div>موافقة الزبون</div><div>الختم والتوقيع</div></div>
</div>`;
  return { html, css: a4Css, paper: 'A4', title: `عرض سعر ${q.number}` };
}
