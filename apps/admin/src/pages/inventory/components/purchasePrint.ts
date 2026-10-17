import { formatDate, formatMoney, formatQty, type CurrencyCode, type Digits, type StoreSettings } from '@raqeem/shared';
import { escapeHtml, printHtml } from '../../../lib/print';

export interface PrintablePurchase {
  number: string; created_at: string; supplier: string; warehouse: string; currency: CurrencyCode; exchange_rate: number;
  subtotal: number; discount: number; total: number; paid: number; note: string | null;
  lines: { name: string; variant_title: string | null; sku: string; qty: number; unit_cost: number; line_total: number; lot_code?: string | null; expiry_date?: string | null; serials?: string[] }[];
}

/** فاتورة شراء A4 بترويسة المتجر */
export function printPurchase(p: PrintablePurchase, store: StoreSettings, digits: Digits) {
  const m = (n: number) => escapeHtml(formatMoney(n, { currency: p.currency, digits }));
  const rows = p.lines.map((l, i) => `<tr><td>${i + 1}</td><td>${escapeHtml(l.name)}${l.variant_title ? ` — ${escapeHtml(l.variant_title)}` : ''}<div class="s">${escapeHtml(l.sku)}${l.lot_code ? ` · دفعة ${escapeHtml(l.lot_code)}` : ''}${l.expiry_date ? ` · ينتهي ${escapeHtml(formatDate(l.expiry_date, { digits }))}` : ''}${l.serials?.length ? `<br>${escapeHtml(l.serials.join('، '))}` : ''}</div></td><td class="n">${escapeHtml(formatQty(l.qty, digits))}</td><td class="n">${m(l.unit_cost)}</td><td class="n">${m(l.line_total)}</td></tr>`).join('');
  return printHtml(`
    <header><div><h1>${escapeHtml(store.name)}</h1><div class="s">${escapeHtml([store.address, store.phone].filter(Boolean).join(' · '))}</div></div>
    <div class="box"><b>فاتورة شراء</b><br>${escapeHtml(p.number)}<br>${escapeHtml(formatDate(p.created_at, { digits, time: true }))}</div></header>
    <p>المورد: <b>${escapeHtml(p.supplier)}</b> &nbsp; · &nbsp; المخزن: ${escapeHtml(p.warehouse)} &nbsp; · &nbsp; العملة: ${p.currency === 'USD' ? `دولار (سعر الصرف ${escapeHtml(formatQty(p.exchange_rate, digits))})` : 'دينار عراقي'}</p>
    <table><thead><tr><th>#</th><th>المادة</th><th>الكمية</th><th>الكلفة</th><th>المجموع</th></tr></thead><tbody>${rows}</tbody></table>
    <table class="tot"><tr><td>المجموع</td><td class="n">${m(p.subtotal)}</td></tr>${p.discount ? `<tr><td>الخصم</td><td class="n">${m(p.discount)}</td></tr>` : ''}
    <tr><th>الإجمالي</th><th class="n">${m(p.total)}</th></tr><tr><td>المدفوع</td><td class="n">${m(p.paid)}</td></tr><tr><th>المتبقي</th><th class="n">${m(p.total - p.paid)}</th></tr></table>
    ${p.note ? `<p>ملاحظة: ${escapeHtml(p.note)}</p>` : ''}
    <p style="margin-top:48px">توقيع المستلم: ____________ &nbsp;&nbsp; توقيع المورد: ____________</p>`,
  {
    paper: 'A4', title: p.number,
    css: `header{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #121513;padding-bottom:10px;margin-bottom:12px}h1{margin:0;font-size:22px}.s{font-size:11px;color:#555}.box{border:1px solid #121513;padding:8px 12px;text-align:center;font-size:12px}
      table{width:100%;border-collapse:collapse;font-size:12px;margin-top:8px}th,td{border:1px solid #bbb;padding:6px;text-align:right;vertical-align:top}th{background:#EDEEEC}.n{text-align:left;font-variant-numeric:tabular-nums;white-space:nowrap}
      .tot{width:45%;margin-inline-start:auto}`,
  });
}
