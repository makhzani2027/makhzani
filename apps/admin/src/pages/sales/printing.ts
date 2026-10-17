/** طباعة مستندات البيع من أي صفحة: إيصال حراري، فاتورة A4، سند، قسيمة توصيل */
import type { Payment, StoreSettings } from '@raqeem/shared';
import { buildDeliverySlip, buildInvoiceA4, buildReceipt, buildVoucher, printDoc } from '../../print';
import { getInvoice, getOrder } from './api';
import { getSetting } from './data/app-settings';

export async function printInvoice(id: string, store: StoreSettings, mode: 'thermal' | 'A4' = 'thermal', change?: number): Promise<void> {
  const [full, settings] = await Promise.all([getInvoice(id), getSetting('invoice')]);
  const party = full.customer ?? (full.supplier ? { name: full.supplier.name, phone: full.supplier.phone } : null);
  const data = {
    invoice: full.invoice, items: full.items, payments: full.payments, cashier: full.cashier, change, originalNumber: full.original?.number ?? null,
    customer: party ? { name: party.name, phone: party.phone, is_cash_customer: full.customer?.is_cash_customer } : null,
  };
  const doc = mode === 'A4'
    ? await buildInvoiceA4({ ...data, partyLabel: full.supplier ? 'المورد' : 'الزبون', address: full.customer?.address ?? null }, store, settings)
    : await buildReceipt(data, store, settings);
  await printDoc(doc);
}

export async function printOrderSlip(orderId: string, store: StoreSettings): Promise<void> {
  const [o, settings] = await Promise.all([getOrder(orderId), getSetting('invoice')]);
  await printDoc(await buildDeliverySlip(o.order, o.items, o.customer?.name ?? o.order.address?.recipient_name ?? 'زبون', store, settings.receipt_width));
}

export async function printVoucher(p: Payment, partyName: string | null, store: StoreSettings, extra: { invoiceNumber?: string | null; balanceAfter?: number | null; cashier?: string | null } = {}): Promise<void> {
  const settings = await getSetting('invoice');
  await printDoc(buildVoucher({ payment: p, partyName, store, width: settings.receipt_width, ...extra }));
}
