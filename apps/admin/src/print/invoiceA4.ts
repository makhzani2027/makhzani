/** فاتورة A4 رسمية: الشعار والبيانات، جدول البنود، الإجماليات، الدفعات، التوقيع، QR */
import { INVOICE_CHANNEL, INVOICE_KIND, PAYMENT_METHOD, type InvoiceSettings, type StoreSettings } from '@raqeem/shared';
import { qrSvg } from '../ui/codes';
import { a4Css, a4Header, code, escapeHtml, formatPhoneSafe, printFmt, type PrintDoc } from './common';
import type { ReceiptData } from './receipt';

export async function buildInvoiceA4(d: ReceiptData & { partyLabel?: string; address?: string | null }, store: StoreSettings, settings: InvoiceSettings): Promise<PrintDoc> {
  const f = printFmt(store);
  const inv = d.invoice;
  const qr = settings.show_qr ? await qrSvg(inv.number, 160).catch(() => '') : '';
  const isPurchase = inv.kind === 'purchase' || inv.kind === 'purchase_return';
  const rows = d.items
    .map((i, n) => `<tr>
  <td class="e">${f.num(n + 1)}</td>
  <td><b>${escapeHtml(i.name)}</b>${i.variant_title ? `<div class="muted">${escapeHtml(i.variant_title)}</div>` : ''}${i.serials?.length ? `<div class="muted ltr">SN: ${escapeHtml(i.serials.join(', '))}</div>` : ''}</td>
  <td>${code(i.sku)}</td>
  <td class="e">${f.qty(i.qty)}</td>
  <td class="e">${f.money(i.unit_price, true)}</td>
  <td class="e">${i.discount > 0 ? f.money(i.discount, true) : '—'}</td>
  <td class="e"><b>${f.money(i.line_total, true)}</b></td>
</tr>`)
    .join('');
  const pays = d.payments.filter((p) => !p.voided_at);
  const r = (k: string, v: string, cls = '') => `<div class="r ${cls}"><span>${k}</span><span class="e">${v}</span></div>`;
  const party = d.customer && !d.customer.is_cash_customer ? d.customer : null;

  const html = `<div class="a4">
${a4Header(store, {
  kind: `${INVOICE_KIND[inv.kind].label}${inv.status === 'void' ? ' (ملغاة)' : ''}`,
  number: inv.number,
  meta: [`التاريخ: ${f.date(inv.created_at)} · ${f.time(inv.created_at)}`, `القناة: ${escapeHtml(INVOICE_CHANNEL[inv.channel].label)}`, d.cashier ? `المحرر: ${escapeHtml(d.cashier)}` : ''].filter(Boolean),
})}
<div class="parties">
  <div class="party"><h4>${escapeHtml(d.partyLabel ?? (isPurchase ? 'المورد' : 'الزبون'))}</h4><b>${escapeHtml(party?.name ?? 'زبون نقدي')}</b>${party?.phone ? `<div class="muted">${code(formatPhoneSafe(party.phone))}</div>` : ''}${d.address ? `<div class="muted">${escapeHtml(d.address)}</div>` : ''}</div>
  <div class="party"><h4>حالة الدفع</h4><b>${inv.due > 0 ? `متبقٍ ${f.money(inv.due)}` : 'مدفوعة بالكامل'}</b><div class="muted">${pays.length ? pays.map((p) => `${escapeHtml(PAYMENT_METHOD[p.method]?.label ?? p.method)} ${f.money(p.amount)}`).join(' · ') : 'لا دفعات'}</div>${d.originalNumber ? `<div class="muted">إرجاع عن الفاتورة ${code(d.originalNumber)}</div>` : ''}</div>
</div>
<table>
  <thead><tr><th style="width:8mm">#</th><th>المنتج</th><th style="width:26mm">SKU</th><th class="e" style="width:14mm">الكمية</th><th class="e" style="width:24mm">السعر</th><th class="e" style="width:20mm">الخصم</th><th class="e" style="width:26mm">المجموع</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
<div class="sum">
  <div class="notes">
    ${inv.note ? `<h4>ملاحظة</h4>${escapeHtml(inv.note)}<br><br>` : ''}
    ${settings.return_policy && !isPurchase ? `<h4>سياسة الإرجاع</h4>${escapeHtml(settings.return_policy)}` : ''}
    ${inv.status === 'void' ? `<div style="margin-top:4mm"><span class="stamp">ملغاة</span> ${escapeHtml(inv.void_reason ?? '')}</div>` : ''}
  </div>
  <div class="totals">
    ${r('مجموع البنود', f.money(inv.subtotal))}
    ${inv.discount > 0 ? r('خصم الفاتورة', `− ${f.money(inv.discount)}`) : ''}
    ${inv.delivery_fee > 0 ? r('أجرة التوصيل', f.money(inv.delivery_fee)) : ''}
    ${r('الإجمالي', f.money(inv.total), 'g')}
    ${r('المدفوع', f.money(inv.paid))}
    ${inv.due > 0 ? r('المتبقي', f.money(inv.due), 'due') : ''}
  </div>
</div>
<div class="sign"><div>توقيع المستلم</div><div>توقيع البائع والختم</div></div>
<div class="foot"><span>${escapeHtml(settings.footer_note || 'شكراً لتعاملكم معنا')}</span>${qr}</div>
</div>`;
  return { html, css: a4Css, paper: 'A4', title: inv.number };
}
