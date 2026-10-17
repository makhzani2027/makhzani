/** سند قبض (RC) أو صرف (PV) حراري — يُعطى للزبون عند تسديد دفعة من دينه */
import { PAYMENT_METHOD, type Payment, type StoreSettings } from '@raqeem/shared';
import { code, escapeHtml, formatPhoneSafe, markSvg, printFmt, thermalCss, type PrintDoc } from './common';

export function buildVoucher(o: { payment: Payment; partyName: string | null; partyPhone?: string | null; invoiceNumber?: string | null; balanceAfter?: number | null; cashier?: string | null; store: StoreSettings; width?: 58 | 80 }): PrintDoc {
  const width = o.width ?? 80;
  const p = o.payment;
  const f = printFmt({ ...o.store, currency: p.currency });
  const kv = (k: string, v: string) => `<div class="kv"><span>${k}</span><span>${v}</span></div>`;
  const html = `<div class="t">
<div class="mark">${markSvg(width === 80 ? '11mm' : '9mm')}</div>
<div class="store">${escapeHtml(o.store.name)}</div>
${o.store.phone ? `<div class="sub">هاتف: ${code(formatPhoneSafe(o.store.phone))}</div>` : ''}
<hr class="rule">
<div class="title">${p.direction === 'in' ? 'سند قبض' : 'سند صرف'}</div>
${kv('الرقم', code(p.number))}
${kv('التاريخ', `${f.dateShort(p.created_at)} · ${f.time(p.created_at)}`)}
${o.partyName ? kv(p.direction === 'in' ? 'استلمنا من' : 'صرفنا إلى', escapeHtml(o.partyName)) : ''}
${o.partyPhone ? kv('الهاتف', code(formatPhoneSafe(o.partyPhone))) : ''}
${kv('طريقة الدفع', escapeHtml(PAYMENT_METHOD[p.method]?.label ?? p.method))}
${p.reference ? kv('رقم العملية', code(p.reference)) : ''}
${o.invoiceNumber ? kv('عن الفاتورة', code(o.invoiceNumber)) : ''}
<div class="grand"><span>المبلغ</span><span>${f.money(p.amount)}</span></div>
${p.note ? `<div class="note">${escapeHtml(p.note)}</div>` : ''}
${o.balanceAfter !== undefined && o.balanceAfter !== null ? kv('الرصيد بعد السند', f.money(o.balanceAfter)) : ''}
${o.cashier ? kv('المستلم', escapeHtml(o.cashier)) : ''}
<div class="tiny" style="margin-top:6mm">التوقيع: ............................</div>
</div>`;
  return { html, css: thermalCss(width), paper: width === 58 ? '58mm' : '80mm', title: p.number };
}
