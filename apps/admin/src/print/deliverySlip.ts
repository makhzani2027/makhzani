/**
 * إيصال التجهيز/المندوب ٨٠ ملم: العنوان كبير، أقرب نقطة دالة بارزة، الهاتف، والمبلغ المطلوب تحصيله.
 */
import { FULFILLMENT, ORDER_PAYMENT_METHOD, governorateName, type Order, type OrderItem, type StoreSettings } from '@raqeem/shared';
import { qrSvg } from '../ui/codes';
import { code, escapeHtml, formatPhoneSafe, markSvg, printFmt, thermalCss, type PrintDoc } from './common';

export async function buildDeliverySlip(order: Order, items: OrderItem[], customerName: string, store: StoreSettings, width: 58 | 80 = 80): Promise<PrintDoc> {
  const f = printFmt(store);
  const a = order.address;
  const qr = await qrSvg(order.number, 160).catch(() => '');
  const toCollect = order.payment_status === 'paid' ? 0 : order.total;
  const kv = (k: string, v: string) => `<div class="kv"><span>${k}</span><span>${v}</span></div>`;
  const place = a ? [governorateName(a.governorate), a.city, a.area, a.street].filter(Boolean).map((x) => escapeHtml(x)).join(' — ') : '';

  const html = `<div class="t">
<div class="mark">${markSvg(width === 80 ? '10mm' : '8mm')}</div>
<div class="sub" style="font-weight:700">${escapeHtml(store.name)}${store.phone ? ` · ${code(formatPhoneSafe(store.phone))}` : ''}</div>
<hr class="rule solid">
<div class="c big">${code(order.number)}</div>
<div class="sub">${escapeHtml(FULFILLMENT[order.fulfillment].label)} · ${f.dateShort(order.created_at)} ${f.time(order.created_at)}</div>
<hr class="rule">
<div style="font-weight:900;font-size:1.25em">${escapeHtml(a?.recipient_name ?? customerName)}</div>
${a?.phone ? `<div class="big" style="font-size:1.6em">${code(formatPhoneSafe(a.phone))}</div>` : ''}
${a ? `<div style="font-weight:700;font-size:1.15em;line-height:1.5">${place}</div>` : '<div style="font-weight:700">استلام من المكتب</div>'}
${a?.landmark ? `<div class="box"><div style="font-size:.85em">أقرب نقطة دالة</div><div style="font-weight:900;font-size:1.3em;line-height:1.45">${escapeHtml(a.landmark)}</div></div>` : ''}
<hr class="rule">
${items.map((i) => `<div class="kv"><span><b>${f.qty(i.qty)}×</b> ${escapeHtml(i.name)}${i.variant_title ? ` — ${escapeHtml(i.variant_title)}` : ''}</span><span>${f.money(i.line_total, true)}</span></div>`).join('')}
<hr class="rule">
${kv('المجموع', f.money(order.subtotal))}
${order.discount > 0 ? kv('الخصم', `− ${f.money(order.discount)}`) : ''}
${kv('التوصيل', order.delivery_fee > 0 ? f.money(order.delivery_fee) : 'مجاني')}
<div class="grand"><span>${toCollect > 0 ? 'المطلوب تحصيله' : 'مدفوع مسبقاً'}</span><span>${f.money(toCollect > 0 ? toCollect : order.total)}</span></div>
<div class="sub">${escapeHtml(ORDER_PAYMENT_METHOD[order.payment_method].label)}</div>
${order.customer_note ? `<div class="box"><div style="font-size:.85em">ملاحظة الزبون</div><div style="font-weight:700">${escapeHtml(order.customer_note)}</div></div>` : ''}
${qr ? `<div class="qr">${qr}</div>` : ''}
<div class="tiny">توقيع المستلم: ............................</div>
</div>`;
  return { html, css: thermalCss(width), paper: width === 58 ? '58mm' : '80mm', title: `توصيل ${order.number}` };
}
