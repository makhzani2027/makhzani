/**
 * الإيصال الحراري ٥٨/٨٠ ملم (بيع أو إرجاع). أسود فقط، خطوط دفتر متقطعة، خط ثمانية.
 */
import { INVOICE_KIND, PAYMENT_METHOD, type Invoice, type InvoiceItem, type InvoiceSettings, type Payment, type StoreSettings } from '@raqeem/shared';
import { qrSvg } from '../ui/codes';
import { code, escapeHtml, formatPhoneSafe, markSvg, printFmt, thermalCss, type PrintDoc } from './common';

export interface ReceiptData {
  invoice: Invoice;
  items: InvoiceItem[];
  payments: Payment[];
  customer: { name: string; phone: string | null; is_cash_customer?: boolean } | null;
  cashier: string | null;
  /** الباقي للزبون (يُعرف فقط لحظة البيع) */
  change?: number;
  /** رقم الفاتورة الأصلية لإيصال الإرجاع */
  originalNumber?: string | null;
}

export async function buildReceipt(d: ReceiptData, store: StoreSettings, settings: InvoiceSettings, widthOverride?: 58 | 80): Promise<PrintDoc> {
  const width = widthOverride ?? settings.receipt_width ?? 80;
  const inv = d.invoice;
  const f = printFmt({ ...store, currency: inv.currency });
  const pf = (p: { amount: number; currency: 'IQD' | 'USD' }) => printFmt({ ...store, currency: p.currency }).money(p.amount);
  const isReturn = inv.kind === 'sale_return' || inv.kind === 'purchase_return';
  const kv = (k: string, v: string) => `<div class="kv"><span>${k}</span><span>${v}</span></div>`;
  const qr = settings.show_qr ? await qrSvg(inv.number, 160).catch(() => '') : '';

  const items = d.items
    .map((i) => {
      const gross = i.qty * i.unit_price;
      return `<div class="item">
  <div class="n">${escapeHtml(i.name)}${i.variant_title ? ` <span class="v">— ${escapeHtml(i.variant_title)}</span>` : ''}</div>
  <div class="q"><span>${f.qty(i.qty)} × ${f.money(i.unit_price, true)}</span><b>${f.money(gross, true)}</b></div>
  ${i.discount > 0 ? `<div class="d"><span>خصم</span><span>− ${f.money(i.discount, true)}</span></div>` : ''}
  ${i.serials?.length ? `<div class="s">SN: ${escapeHtml(i.serials.join('، '))}</div>` : ''}
</div>`;
    })
    .join('');

  const lineDiscounts = d.items.reduce((s, i) => s + i.discount, 0);
  const gross = d.items.reduce((s, i) => s + i.qty * i.unit_price, 0);
  const active = d.payments.filter((p) => !p.voided_at);
  const pays = active.map((p) => kv(PAYMENT_METHOD[p.method]?.label ?? p.method, pf(p))).join('');
  const showCustomer = d.customer && !d.customer.is_cash_customer;

  const html = `<div class="t">
${settings.show_logo ? `<div class="mark">${markSvg(width === 80 ? '13mm' : '10mm')}</div>` : ''}
<div class="store">${escapeHtml(store.name)}</div>
${store.address ? `<div class="sub">${escapeHtml(store.address)}</div>` : ''}
${store.phone ? `<div class="sub">هاتف: ${code(formatPhoneSafe(store.phone))}</div>` : ''}
${settings.header_note ? `<div class="note">${escapeHtml(settings.header_note)}</div>` : ''}
<hr class="rule">
<div class="title">${isReturn ? 'إيصال إرجاع' : escapeHtml(INVOICE_KIND[inv.kind].label)}${inv.status === 'void' ? ' — ملغاة' : ''}</div>
${kv('الرقم', code(inv.number))}
${d.originalNumber ? kv('عن الفاتورة', code(d.originalNumber)) : ''}
${kv('التاريخ', `${f.dateShort(inv.created_at)} · ${f.time(inv.created_at)}`)}
${d.cashier ? kv('الكاشير', escapeHtml(d.cashier)) : ''}
${showCustomer ? kv('الزبون', escapeHtml(d.customer!.name)) : ''}
${showCustomer && d.customer!.phone ? kv('الهاتف', code(formatPhoneSafe(d.customer!.phone))) : ''}
<hr class="rule">
${items}
<hr class="rule">
${kv('عدد القطع', f.qty(d.items.reduce((s, i) => s + i.qty, 0)))}
${lineDiscounts > 0 || inv.discount > 0 ? kv('المجموع', f.money(gross)) : ''}
${lineDiscounts > 0 ? kv('خصم البنود', `− ${f.money(lineDiscounts)}`) : ''}
${inv.discount > 0 ? kv('خصم الفاتورة', `− ${f.money(inv.discount)}`) : ''}
${inv.delivery_fee > 0 ? kv('أجرة التوصيل', f.money(inv.delivery_fee)) : ''}
<div class="grand"><span>${isReturn ? 'المبلغ المُرجع' : 'الإجمالي'}</span><span>${f.money(inv.total)}</span></div>
${inv.currency === 'USD' ? kv('سعر الصرف', printFmt(store).num(inv.exchange_rate)) : ''}
${pays ? `${pays}` : ''}
${d.change && d.change > 0 ? `<div class="kv" style="font-weight:900"><span>الباقي للزبون</span><span>${f.money(d.change)}</span></div>` : ''}
${!isReturn && inv.due > 0 ? `<div class="box"><div class="kv" style="font-weight:900"><span>المتبقي بالآجل</span><span>${f.money(inv.due)}</span></div><div class="tiny" style="margin-top:.5mm">يُسجَّل على حساب الزبون</div></div>` : ''}
${qr ? `<div class="qr">${qr}<span class="ltr">${escapeHtml(inv.number)}</span></div>` : ''}
${settings.return_policy && !isReturn ? `<hr class="rule"><div class="note">${escapeHtml(settings.return_policy)}</div>` : ''}
<div class="thanks">${escapeHtml(settings.footer_note || 'شكراً لتسوقكم')}</div>
${store.whatsapp || store.socials?.instagram ? `<div class="tiny">${[store.whatsapp ? `واتساب ${code(formatPhoneSafe(store.whatsapp))}` : '', store.socials?.instagram ? `انستغرام ${code(`@${store.socials.instagram}`)}` : ''].filter(Boolean).join(' · ')}</div>` : ''}
</div>`;
  return { html, css: thermalCss(width), paper: width === 58 ? '58mm' : '80mm', title: inv.number };
}
