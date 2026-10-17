/**
 * بيانات البيع: الرئيسية، نقطة البيع، الفواتير، الطلبات، طلبات التوفير.
 * كل دالة تفرّع: وضع العرض (demoDb + ledger) أو Supabase بأسماء العقد حرفياً (system/06-database.md).
 *
 * ── pos_checkout(p jsonb) — ما نرسله بالضبط ─────────────────────────────────────────────
 *   p = {
 *     warehouse_id: uuid,
 *     customer_id: uuid | null,              // null = «زبون نقدي»
 *     items: [{ variant_id: uuid, qty: number,
 *               unit_price?: number,         // فقط إن غيّره الكاشير (pos.price_override)
 *               discount?: number,           // خصم على البند كله بالمبلغ (pos.discount)
 *               serials?: string[] }],       // للمنتجات track_serials (العدد = qty)
 *     discount?: number,                     // خصم على الفاتورة (pos.discount)
 *     payments: [{ method: PaymentMethod, amount: number, reference?: string }],
 *                                            // نقداً: المبلغ الذي سلّمه الزبون (قد يزيد) والخادم يحسب الفكة
 *                                            // مجموع أقل من الإجمالي = الباقي آجل (يتطلب زبوناً وضمن credit_limit)
 *     note?: string
 *   }
 *   ← يعيد { invoice_id: uuid, number: 'S-000123', change: number }
 * ───────────────────────────────────────────────────────────────────────────────────────
 */
import {
  canTransition, isoDay, roundMoney, startOfBaghdadDay, tender, baghdadParts, BAGHDAD_OFFSET_MIN,
  type CashSession, type DashboardSummary, type Invoice, type InvoiceKind, type InvoiceChannel, type LowStockRow, type Order, type OrderItem,
  type OrderStatus, type Payment, type PaymentMethod, type ProductRequest, type RequestStatus, type SalesPoint, type TopProductRow, type Customer,
  type Supplier, type InvoiceItem, type OrderEvent,
} from '@raqeem/shared';
import { IS_DEMO } from '../../lib/env';
import { demoDb, demoDelay, demoChanged } from '../../lib/demo-db';
import { AppError, rpc, sb } from '../../lib/supabase';
import {
  demoAddPayment, demoAudit, demoCreateInvoice, demoCustomerBalance, demoMoveStock, demoOrderEvent, demoSessionTotals, ledger,
  oldestDueInvoice, recalcInvoice, staffName, variantCost,
} from './data/ledger';
import { getSetting } from './data/app-settings';
import { staffNames } from './data/lookups';
import type {
  CheckoutPayload, CheckoutResult, DateRange, InvoiceFull, InvoiceRow, OrderFull, OrderRow, PosItem, RecordPaymentPayload,
} from './data/types';

const nowIso = () => new Date().toISOString();
const inRange = (t: string, r: DateRange) => t >= r.from && t < r.to;

// ================================================================== الرئيسية

export async function dashboardSummary(r: DateRange): Promise<DashboardSummary> {
  if (!IS_DEMO) return rpc<DashboardSummary>('dashboard_summary', { from: r.from, to: r.to });
  await demoDelay(220);
  const inv = ledger.invoices.filter((i) => i.status === 'posted' && inRange(i.created_at, r));
  const sales = inv.filter((i) => i.kind === 'sale');
  const rets = inv.filter((i) => i.kind === 'sale_return');
  const sum = (a: Invoice[], f: (i: Invoice) => number) => a.reduce((s, i) => s + f(i), 0);
  const pays = ledger.payments.filter((p) => !p.voided_at && inRange(p.created_at, r));
  const receivables = demoDb.customers.reduce((s, c) => s + Math.max(0, demoCustomerBalance(c.id).balance), 0);
  const { demoSupplierBalance } = await import('./data/ledger');
  const payables = demoDb.suppliers.reduce((s, x) => s + Math.max(0, demoSupplierBalance(x.id).balance), 0);
  return {
    sales_total: sum(sales, (i) => i.total),
    sales_count: sales.length,
    returns_total: sum(rets, (i) => i.total),
    profit: sum(sales, (i) => i.total - i.delivery_fee - i.cost_total) - sum(rets, (i) => i.total - i.cost_total),
    orders_new: demoDb.orders.filter((o) => o.status === 'pending').length,
    orders_open: demoDb.orders.filter((o) => ['confirmed', 'preparing', 'ready', 'out_for_delivery'].includes(o.status)).length,
    requests_new: demoDb.product_requests.filter((x) => x.status === 'new').length,
    low_stock_count: demoDb.product_variants.filter((v) => v.is_active && v.available_qty > 0 && v.available_qty <= v.min_stock).length,
    out_of_stock_count: demoDb.product_variants.filter((v) => v.is_active && v.available_qty <= 0).length,
    receivables,
    payables,
    cash_in: pays.filter((p) => p.direction === 'in').reduce((s, p) => s + p.amount, 0),
    cash_out: pays.filter((p) => p.direction === 'out').reduce((s, p) => s + p.amount, 0),
    expenses_total: ledger.expenses.filter((e) => inRange(e.spent_at, r)).reduce((s, e) => s + e.amount, 0),
  };
}

export type Bucket = 'day' | 'week' | 'month';

/** بداية الحاوية بتوقيت بغداد (الأسبوع يبدأ الاثنين مثل date_trunc في Postgres) */
export function bucketStart(t: number | string, bucket: Bucket): number {
  const p = baghdadParts(t);
  const off = BAGHDAD_OFFSET_MIN * 60_000;
  if (bucket === 'month') return Date.UTC(p.year, p.month, 1) - off;
  const day = Date.UTC(p.year, p.month, p.day) - off;
  if (bucket === 'week') return day - ((p.weekday + 6) % 7) * 86_400_000;
  return day;
}

/** يملأ الحاويات الفارغة بأصفار حتى يكون الرسم متصلاً */
export function fillSeries(points: SalesPoint[], r: DateRange, bucket: Bucket): SalesPoint[] {
  const map = new Map(points.map((p) => [isoDay(p.bucket), p]));
  const out: SalesPoint[] = [];
  let t = bucketStart(r.from, bucket);
  const end = Date.parse(r.to);
  let guard = 0;
  while (t < end && guard++ < 800) {
    const key = isoDay(t);
    out.push(map.get(key) ?? { bucket: new Date(t).toISOString(), sales: 0, returns: 0, profit: 0, invoices: 0 });
    const p = baghdadParts(t);
    t = bucket === 'month' ? bucketStart(Date.UTC(p.year, p.month + 1, 1) + 12 * 3600_000, 'month') : t + (bucket === 'week' ? 7 : 1) * 86_400_000;
  }
  return out;
}

export async function salesSeries(r: DateRange, bucket: Bucket): Promise<SalesPoint[]> {
  let pts: SalesPoint[];
  if (!IS_DEMO) pts = (await rpc<SalesPoint[]>('sales_series', { from: r.from, to: r.to, bucket })) ?? [];
  else {
    await demoDelay(200);
    const m = new Map<number, SalesPoint>();
    for (const i of ledger.invoices) {
      if (i.status !== 'posted' || !inRange(i.created_at, r) || (i.kind !== 'sale' && i.kind !== 'sale_return')) continue;
      const k = bucketStart(i.created_at, bucket);
      const p = m.get(k) ?? { bucket: new Date(k).toISOString(), sales: 0, returns: 0, profit: 0, invoices: 0 };
      if (i.kind === 'sale') { p.sales += i.total; p.invoices += 1; p.profit = (p.profit ?? 0) + i.total - i.delivery_fee - i.cost_total; }
      else { p.returns += i.total; p.profit = (p.profit ?? 0) - (i.total - i.cost_total); }
      m.set(k, p);
    }
    pts = [...m.values()];
  }
  return fillSeries(pts, r, bucket);
}

export async function topProducts(r: DateRange, lim = 8): Promise<TopProductRow[]> {
  if (!IS_DEMO) return (await rpc<TopProductRow[]>('top_products', { from: r.from, to: r.to, lim })) ?? [];
  await demoDelay(160);
  const ids = new Set(ledger.invoices.filter((i) => i.kind === 'sale' && i.status === 'posted' && inRange(i.created_at, r)).map((i) => i.id));
  const m = new Map<string, TopProductRow>();
  for (const it of ledger.invoice_items) {
    if (!ids.has(it.invoice_id)) continue;
    const row = m.get(it.variant_id) ?? { product_id: it.product_id, variant_id: it.variant_id, name: it.name, variant_title: it.variant_title, qty: 0, revenue: 0, profit: 0 };
    row.qty += it.qty;
    row.revenue += it.line_total;
    row.profit = (row.profit ?? 0) + it.line_total - it.unit_cost * it.qty;
    m.set(it.variant_id, row);
  }
  return [...m.values()].sort((a, b) => b.revenue - a.revenue).slice(0, lim);
}

export async function lowStock(lim = 50): Promise<LowStockRow[]> {
  if (!IS_DEMO) return (await rpc<LowStockRow[]>('low_stock', { lim })) ?? [];
  await demoDelay(120);
  return demoDb.product_variants
    .filter((v) => v.is_active && v.available_qty <= v.min_stock)
    .sort((a, b) => a.available_qty - b.available_qty)
    .slice(0, lim)
    .map((v) => {
      const p = demoDb.products.find((x) => x.id === v.product_id)!;
      return { variant_id: v.id, product_id: p.id, name: p.name, variant_title: v.title === 'افتراضي' ? null : v.title, sku: v.sku, qty: v.available_qty, min_stock: v.min_stock };
    });
}

export interface OpenSession extends CashSession { opened_by_name: string | null }

export async function openSessions(): Promise<OpenSession[]> {
  if (IS_DEMO) { await demoDelay(80); return ledger.cash_sessions.filter((s) => s.status === 'open').map((s) => ({ ...s, opened_by_name: staffName(s.opened_by) })); }
  const { data, error } = await sb().from('cash_sessions').select('*').eq('status', 'open').order('opened_at');
  if (error) throw error;
  const names = await staffNames();
  return (data as CashSession[]).map((s) => ({ ...s, opened_by_name: names[s.opened_by] ?? null }));
}

// ================================================================== نقطة البيع

/** كل النسخ القابلة للبيع مع رصيد المخزن المختار — يُحمَّل مرة ويُبحث فيه محلياً (فوري) */
export async function loadPosCatalog(warehouseId: string): Promise<PosItem[]> {
  if (IS_DEMO) {
    await demoDelay(200);
    return demoDb.product_variants
      .filter((v) => v.is_active)
      .map((v) => {
        const p = demoDb.products.find((x) => x.id === v.product_id)!;
        const lvl = demoDb.stock_levels.find((s) => s.variant_id === v.id && s.warehouse_id === warehouseId);
        return toPosItem(v, p, lvl ? lvl.qty - lvl.reserved : 0);
      })
      .filter((x) => !demoDb.products.find((p) => p.id === x.product_id)?.archived_at);
  }
  const [vs, lv] = await Promise.all([
    sb().from('product_variants')
      .select('id,product_id,title,sku,barcode,price,wholesale_price,min_stock,image_key,is_active,products!inner(id,name,cover_key,category_id,track_serials,unit,tags,archived_at)')
      .eq('is_active', true).is('products.archived_at', null).limit(10000),
    sb().from('stock_levels').select('variant_id,qty,reserved').eq('warehouse_id', warehouseId).limit(20000),
  ]);
  if (vs.error) throw vs.error;
  if (lv.error) throw lv.error;
  const stock = new Map((lv.data ?? []).map((s) => [s.variant_id as string, Number(s.qty) - Number(s.reserved)]));
  type Row = { id: string; product_id: string; title: string; sku: string; barcode: string | null; price: number; wholesale_price: number | null; min_stock: number; image_key: string | null; products: { id: string; name: string; cover_key: string | null; category_id: string | null; track_serials: boolean; unit: string; tags: string[] } };
  return ((vs.data ?? []) as unknown as Row[]).map((v) => toPosItem(v, v.products, stock.get(v.id) ?? 0));
}

function toPosItem(
  v: { id: string; product_id: string; title: string; sku: string; barcode: string | null; price: number; wholesale_price: number | null; min_stock: number; image_key: string | null },
  p: { name: string; cover_key: string | null; category_id: string | null; track_serials: boolean; unit: string; tags?: string[] },
  stock: number,
): PosItem {
  const vt = v.title === 'افتراضي' ? null : v.title;
  return {
    variant_id: v.id, product_id: v.product_id, name: p.name, variant_title: vt, sku: v.sku, barcode: v.barcode, price: Number(v.price),
    wholesale_price: v.wholesale_price, min_stock: Number(v.min_stock), image_key: v.image_key ?? p.cover_key, category_id: p.category_id,
    track_serials: p.track_serials, unit: p.unit, stock, search: `${p.name} ${vt ?? ''} ${(p.tags ?? []).join(' ')}`,
  };
}

/** الأرقام التسلسلية المتوفرة لنسخة في مخزن (اقتراحات عند البيع) */
export async function availableSerials(variantId: string, warehouseId: string): Promise<string[]> {
  if (IS_DEMO) return ledger.serials.filter((s) => s.variant_id === variantId && s.status === 'in_stock' && (!s.warehouse_id || s.warehouse_id === warehouseId)).map((s) => s.serial);
  const { data } = await sb().from('serials').select('serial').eq('variant_id', variantId).eq('status', 'in_stock').eq('warehouse_id', warehouseId).limit(200);
  return (data ?? []).map((s) => s.serial as string);
}

export async function mySession(userId: string): Promise<CashSession | null> {
  if (IS_DEMO) { await demoDelay(60); return ledger.cash_sessions.find((s) => s.status === 'open' && s.opened_by === userId) ?? null; }
  const { data, error } = await sb().from('cash_sessions').select('*').eq('status', 'open').eq('opened_by', userId).maybeSingle();
  if (error) throw error;
  return data as CashSession | null;
}

export async function openCashSession(float: number): Promise<CashSession> {
  if (!IS_DEMO) return rpc<CashSession>('open_cash_session', { float });
  await demoDelay();
  if (ledger.cash_sessions.some((s) => s.status === 'open' && s.opened_by === 'demo-owner')) throw new AppError('لديك جلسة صندوق مفتوحة بالفعل.');
  const { demoId } = await import('../../lib/demo-db');
  const s: CashSession = { id: demoId(), status: 'open', opened_by: 'demo-owner', opened_at: nowIso(), opening_float: float, closed_by: null, closed_at: null, expected_cash: null, counted_cash: null, note: null };
  ledger.cash_sessions.push(s);
  return s;
}

export async function closeCashSession(counted: number, note: string | null): Promise<CashSession> {
  if (!IS_DEMO) return rpc<CashSession>('close_cash_session', { counted, note });
  await demoDelay();
  const s = ledger.cash_sessions.find((x) => x.status === 'open' && x.opened_by === 'demo-owner');
  if (!s) throw new AppError('لا توجد جلسة صندوق مفتوحة.');
  s.expected_cash = demoSessionTotals(s).expected;
  s.counted_cash = counted;
  s.status = 'closed';
  s.closed_by = 'demo-owner';
  s.closed_at = nowIso();
  s.note = note;
  return s;
}

export async function posCheckout(p: CheckoutPayload): Promise<CheckoutResult> {
  if (!IS_DEMO) return rpc<CheckoutResult>('pos_checkout', { p });
  await demoDelay(260);
  if (!p.items.length) throw new AppError('السلة فارغة.');
  const inv = await getSetting('inventory');
  const pos = await getSetting('pos');
  const session = ledger.cash_sessions.find((s) => s.status === 'open' && s.opened_by === 'demo-owner') ?? null;
  if (pos.require_cash_session && !session) throw new AppError('افتح جلسة الصندوق أولاً قبل البيع.');
  const lines = p.items.map((it) => {
    const v = demoDb.product_variants.find((x) => x.id === it.variant_id);
    if (!v || !v.is_active) throw new AppError('أحد المنتجات لم يعد متاحاً للبيع.');
    const prod = demoDb.products.find((x) => x.id === v.product_id)!;
    if (!(it.qty > 0)) throw new AppError(`كمية غير صحيحة لـ «${prod.name}».`);
    const lvl = demoDb.stock_levels.find((s) => s.variant_id === v.id && s.warehouse_id === p.warehouse_id);
    const avail = lvl ? lvl.qty - lvl.reserved : 0;
    if (!inv.allow_negative_stock && avail < it.qty) throw new AppError(`الكمية غير متوفرة: «${prod.name}» — المتوفر ${avail} فقط.`);
    if (prod.track_serials && (it.serials?.length ?? 0) !== it.qty) throw new AppError(`أدخل ${it.qty} من الأرقام التسلسلية لـ «${prod.name}».`);
    return { variant_id: v.id, qty: it.qty, unit_price: it.unit_price ?? v.price, discount: it.discount ?? 0, serials: it.serials ?? [] };
  });
  const subtotal = lines.reduce((s, l) => s + Math.max(0, l.unit_price * l.qty - l.discount), 0);
  const total = roundMoney(subtotal - Math.min(p.discount ?? 0, subtotal));
  const t = tender(total, p.payments);
  const cashCust = demoDb.customers.find((c) => c.is_cash_customer)!;
  const customerId = p.customer_id ?? cashCust.id;
  if (t.remaining > 0) {
    const c = demoDb.customers.find((x) => x.id === customerId);
    if (!c || c.is_cash_customer) throw new AppError('البيع بالآجل يحتاج اختيار زبون مسجّل.');
    const bal = demoCustomerBalance(c.id).balance;
    if (c.credit_limit !== null && bal + t.remaining > c.credit_limit) throw new AppError(`يتجاوز حد الدين لهذا الزبون (${c.credit_limit} د.ع). الرصيد الحالي ${bal} د.ع.`);
  }
  const invc = demoCreateInvoice({ kind: 'sale', channel: 'pos', customer_id: customerId, warehouse_id: p.warehouse_id, lines, discount: p.discount ?? 0, note: p.note ?? null, cash_session_id: session?.id ?? null });
  let changeLeft = t.change;
  for (const pay of p.payments.filter((x) => x.amount > 0)) {
    let amount = pay.amount;
    if (pay.method === 'cash' && changeLeft > 0) { const c = Math.min(changeLeft, amount); amount -= c; changeLeft -= c; }
    if (amount > 0) demoAddPayment({ direction: 'in', method: pay.method, amount, reference: pay.reference ?? null, customer_id: customerId, invoice_id: invc.id, cash_session_id: session?.id ?? null });
  }
  for (const l of lines) {
    demoMoveStock(l.variant_id, p.warehouse_id, -l.qty);
    for (const sn of l.serials) {
      const s = ledger.serials.find((x) => x.variant_id === l.variant_id && x.serial === sn);
      if (s) { s.status = 'sold'; s.sale_invoice_id = invc.id; }
    }
  }
  demoChanged();
  return { invoice_id: invc.id, number: invc.number, change: t.change };
}

// ================================================================== الفواتير

export interface InvoiceFilter { kind: InvoiceKind; q: string; channel: InvoiceChannel | ''; status: 'posted' | 'void' | ''; range: DateRange | null; page: number; pageSize: number; customerId?: string; supplierId?: string }

export async function listInvoices(f: InvoiceFilter): Promise<{ rows: InvoiceRow[]; total: number; sum: number }> {
  if (IS_DEMO) {
    await demoDelay();
    const q = f.q.trim().toLowerCase();
    let rows = ledger.invoices.filter((i) => i.kind === f.kind);
    if (f.channel) rows = rows.filter((i) => i.channel === f.channel);
    if (f.status) rows = rows.filter((i) => i.status === f.status);
    if (f.customerId) rows = rows.filter((i) => i.customer_id === f.customerId);
    if (f.supplierId) rows = rows.filter((i) => i.supplier_id === f.supplierId);
    if (f.range) rows = rows.filter((i) => inRange(i.created_at, f.range!));
    const withNames = rows.map((i) => ({
      ...i,
      customer_name: demoDb.customers.find((c) => c.id === i.customer_id)?.name ?? null,
      supplier_name: demoDb.suppliers.find((s) => s.id === i.supplier_id)?.name ?? null,
      created_by_name: staffName(i.created_by),
    }));
    const filtered = q ? withNames.filter((i) => i.number.toLowerCase().includes(q) || (i.customer_name ?? '').includes(f.q.trim()) || (i.supplier_name ?? '').includes(f.q.trim())) : withNames;
    filtered.sort((a, b) => b.created_at.localeCompare(a.created_at));
    return { rows: filtered.slice((f.page - 1) * f.pageSize, f.page * f.pageSize), total: filtered.length, sum: filtered.filter((i) => i.status === 'posted').reduce((s, i) => s + i.total, 0) };
  }
  let query = sb().from('invoices').select('*, customers(name), suppliers(name)', { count: 'exact' }).eq('kind', f.kind);
  if (f.channel) query = query.eq('channel', f.channel);
  if (f.status) query = query.eq('status', f.status);
  if (f.customerId) query = query.eq('customer_id', f.customerId);
  if (f.supplierId) query = query.eq('supplier_id', f.supplierId);
  if (f.range) query = query.gte('created_at', f.range.from).lt('created_at', f.range.to);
  const q = f.q.trim().replace(/[%_,()]/g, '');
  if (q) {
    const { data: cs } = await sb().from('customers').select('id').ilike('name', `%${q}%`).limit(50);
    const ids = (cs ?? []).map((c) => c.id as string);
    query = ids.length ? query.or(`number.ilike.%${q}%,customer_id.in.(${ids.join(',')})`) : query.ilike('number', `%${q}%`);
  }
  const { data, error, count } = await query.order('created_at', { ascending: false }).range((f.page - 1) * f.pageSize, f.page * f.pageSize - 1);
  if (error) throw error;
  const names = await staffNames();
  type R = Invoice & { customers: { name: string } | null; suppliers: { name: string } | null };
  const rows = ((data ?? []) as R[]).map(({ customers, suppliers, ...i }) => ({ ...i, customer_name: customers?.name ?? null, supplier_name: suppliers?.name ?? null, created_by_name: i.created_by ? names[i.created_by] ?? null : null }));
  return { rows, total: count ?? rows.length, sum: rows.filter((i) => i.status === 'posted').reduce((s, i) => s + Number(i.total), 0) };
}

export async function getInvoice(id: string): Promise<InvoiceFull> {
  if (IS_DEMO) {
    await demoDelay();
    const invoice = ledger.invoices.find((i) => i.id === id);
    if (!invoice) throw new AppError('الفاتورة غير موجودة.');
    const returns = ledger.invoices.filter((i) => i.return_of === id && i.status === 'posted');
    const returned: Record<string, number> = {};
    const items = ledger.invoice_items.filter((i) => i.invoice_id === id);
    for (const r of returns) for (const ri of ledger.invoice_items.filter((x) => x.invoice_id === r.id)) {
      const src = items.find((x) => x.variant_id === ri.variant_id);
      if (src) returned[src.id] = (returned[src.id] ?? 0) + ri.qty;
    }
    const orig = invoice.return_of ? ledger.invoices.find((i) => i.id === invoice.return_of) : null;
    return {
      invoice, items, payments: ledger.payments.filter((p) => p.invoice_id === id), returns, returned,
      customer: demoDb.customers.find((c) => c.id === invoice.customer_id) ?? null, supplier: demoDb.suppliers.find((s) => s.id === invoice.supplier_id) ?? null,
      cashier: staffName(invoice.created_by), original: orig ? { id: orig.id, number: orig.number } : null,
    };
  }
  const { data: invoice, error } = await sb().from('invoices').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!invoice) throw new AppError('الفاتورة غير موجودة.');
  const inv = invoice as Invoice;
  const [items, pays, rets, cust, sup, names, orig] = await Promise.all([
    sb().from('invoice_items').select('*').eq('invoice_id', id),
    sb().from('payments').select('*').eq('invoice_id', id).order('created_at'),
    sb().from('invoices').select('*').eq('return_of', id).eq('status', 'posted'),
    inv.customer_id ? sb().from('customers').select('*').eq('id', inv.customer_id).maybeSingle() : Promise.resolve({ data: null }),
    inv.supplier_id ? sb().from('suppliers').select('*').eq('id', inv.supplier_id).maybeSingle() : Promise.resolve({ data: null }),
    staffNames(),
    inv.return_of ? sb().from('invoices').select('id,number').eq('id', inv.return_of).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const its = (items.data ?? []) as InvoiceItem[];
  const returns = (rets.data ?? []) as Invoice[];
  const returned: Record<string, number> = {};
  if (returns.length) {
    const { data: ri } = await sb().from('invoice_items').select('variant_id,qty').in('invoice_id', returns.map((r) => r.id));
    for (const x of ri ?? []) {
      const src = its.find((i) => i.variant_id === x.variant_id);
      if (src) returned[src.id] = (returned[src.id] ?? 0) + Number(x.qty);
    }
  }
  return {
    invoice: inv, items: its, payments: (pays.data ?? []) as Payment[], returns, returned,
    customer: (cust.data as Customer | null) ?? null, supplier: (sup.data as Supplier | null) ?? null,
    cashier: inv.created_by ? names[inv.created_by] ?? null : null, original: (orig.data as { id: string; number: string } | null) ?? null,
  };
}

export interface ReturnPayload { invoice_id: string; items: { invoice_item_id: string; qty: number }[]; refund?: { method: PaymentMethod; amount: number } | null; reason: string }

export async function postReturn(p: ReturnPayload): Promise<{ invoice_id: string; number: string }> {
  if (!IS_DEMO) return rpc('post_return', { p });
  await demoDelay(240);
  const full = await getInvoice(p.invoice_id);
  const src = full.invoice;
  if (src.status !== 'posted') throw new AppError('لا يمكن الإرجاع من فاتورة ملغاة.');
  if (src.kind !== 'sale' && src.kind !== 'purchase') throw new AppError('هذه الفاتورة لا تقبل الإرجاع.');
  const lines = p.items.filter((x) => x.qty > 0).map((x) => {
    const it = full.items.find((i) => i.id === x.invoice_item_id);
    if (!it) throw new AppError('بند غير موجود في الفاتورة.');
    const left = it.qty - (full.returned[it.id] ?? 0);
    if (x.qty > left) throw new AppError(`لا يمكن إرجاع أكثر من ${left} من «${it.name}».`);
    // سعر البند الصافي بعد خصمه وحصته من خصم الفاتورة
    const share = src.subtotal > 0 ? 1 - src.discount / src.subtotal : 1;
    return { variant_id: it.variant_id, qty: x.qty, unit_price: roundMoney((it.line_total / it.qty) * share), unit_cost: it.unit_cost, name: it.name, variant_title: it.variant_title, sku: it.sku, product_id: it.product_id, serials: it.serials.slice(0, x.qty) };
  });
  if (!lines.length) throw new AppError('اختر كمية للإرجاع.');
  const kind: InvoiceKind = src.kind === 'sale' ? 'sale_return' : 'purchase_return';
  const ret = demoCreateInvoice({ kind, channel: src.channel === 'online' ? 'online' : 'pos', customer_id: src.customer_id, supplier_id: src.supplier_id, warehouse_id: src.warehouse_id, lines, return_of: src.id, note: p.reason });
  const session = ledger.cash_sessions.find((s) => s.status === 'open' && s.opened_by === 'demo-owner');
  if (p.refund && p.refund.amount > 0) {
    demoAddPayment({ direction: kind === 'sale_return' ? 'out' : 'in', method: p.refund.method, amount: Math.min(p.refund.amount, ret.total), customer_id: src.customer_id, supplier_id: src.supplier_id, invoice_id: ret.id, cash_session_id: p.refund.method === 'cash' ? session?.id ?? null : null, note: 'استرداد عن إرجاع' });
  }
  for (const l of lines) demoMoveStock(l.variant_id, src.warehouse_id, kind === 'sale_return' ? l.qty : -l.qty);
  demoAudit('insert', 'invoices', ret.id, { number: ret.number, return_of: src.number, reason: p.reason });
  demoChanged();
  return { invoice_id: ret.id, number: ret.number };
}

export async function voidInvoice(id: string, reason: string): Promise<void> {
  if (!IS_DEMO) { await rpc('void_invoice', { id, reason }); return; }
  await demoDelay(220);
  const inv = ledger.invoices.find((i) => i.id === id);
  if (!inv) throw new AppError('الفاتورة غير موجودة.');
  if (inv.status === 'void') throw new AppError('الفاتورة ملغاة مسبقاً.');
  if (ledger.invoices.some((i) => i.return_of === id && i.status === 'posted')) throw new AppError('لهذه الفاتورة إرجاع مسجّل. ألغِ فاتورة الإرجاع أولاً.');
  const sign = inv.kind === 'sale' || inv.kind === 'purchase_return' ? 1 : -1; // عكس الحركة الأصلية
  for (const it of ledger.invoice_items.filter((i) => i.invoice_id === id)) demoMoveStock(it.variant_id, inv.warehouse_id, sign * it.qty);
  for (const p of ledger.payments.filter((x) => x.invoice_id === id && !x.voided_at)) p.voided_at = nowIso();
  inv.status = 'void';
  inv.voided_at = nowIso();
  inv.voided_by = 'demo-owner';
  inv.void_reason = reason;
  recalcInvoice(inv);
  demoAudit('void', 'invoices', id, { number: inv.number, reason });
  demoChanged();
}

export async function recordPayment(p: RecordPaymentPayload): Promise<Payment> {
  if (!IS_DEMO) return rpc<Payment>('record_payment', { p });
  await demoDelay(200);
  if (!(p.amount > 0)) throw new AppError('اكتب مبلغاً أكبر من صفر.');
  const session = ledger.cash_sessions.find((s) => s.status === 'open' && s.opened_by === 'demo-owner');
  let invoiceId = p.invoice_id ?? null;
  if (invoiceId) {
    const inv = ledger.invoices.find((i) => i.id === invoiceId);
    if (inv && p.amount > inv.due + 0.001) throw new AppError(`المبلغ أكبر من المتبقي على الفاتورة (${inv.due}).`);
  } else if (p.customer_id && p.direction === 'in') {
    const old = oldestDueInvoice(p.customer_id);
    if (old && p.amount <= old.due) invoiceId = old.id;
  }
  const pay = demoAddPayment({ ...p, invoice_id: invoiceId, cash_session_id: p.method === 'cash' ? session?.id ?? null : null });
  demoChanged();
  return pay;
}

// ================================================================== الطلبات

export interface OrderFilter { status: OrderStatus | 'all'; q: string; range: DateRange | null; page: number; pageSize: number; customerId?: string }

function orderMatches(o: Order, q: string, customer: Customer | undefined): boolean {
  const t = q.trim();
  if (!t) return true;
  const digits = t.replace(/\D/g, '');
  return o.number.toLowerCase().includes(t.toLowerCase()) || (customer?.name ?? '').includes(t) || (o.address?.recipient_name ?? '').includes(t)
    || (digits.length >= 4 && ((customer?.phone ?? '').includes(digits.replace(/^0/, '')) || (o.address?.phone ?? '').includes(digits.replace(/^0/, ''))));
}

export async function listOrders(f: OrderFilter): Promise<{ rows: OrderRow[]; total: number }> {
  if (IS_DEMO) {
    await demoDelay();
    let rows = demoDb.orders.filter((o) => (f.status === 'all' ? true : o.status === f.status));
    if (f.customerId) rows = rows.filter((o) => o.customer_id === f.customerId);
    if (f.range) rows = rows.filter((o) => inRange(o.created_at, f.range!));
    rows = rows.filter((o) => orderMatches(o, f.q, demoDb.customers.find((c) => c.id === o.customer_id)));
    rows.sort((a, b) => b.created_at.localeCompare(a.created_at));
    return {
      total: rows.length,
      rows: rows.slice((f.page - 1) * f.pageSize, f.page * f.pageSize).map((o) => {
        const c = demoDb.customers.find((x) => x.id === o.customer_id);
        return { ...o, customer_name: c?.name ?? o.address?.recipient_name ?? 'زبون', customer_phone: o.address?.phone ?? c?.phone ?? null, items_count: demoDb.order_items.filter((i) => i.order_id === o.id).reduce((s, i) => s + i.qty, 0) };
      }),
    };
  }
  let query = sb().from('orders').select('*, customers(name,phone), order_items(qty)', { count: 'exact' });
  if (f.status !== 'all') query = query.eq('status', f.status);
  if (f.customerId) query = query.eq('customer_id', f.customerId);
  if (f.range) query = query.gte('created_at', f.range.from).lt('created_at', f.range.to);
  const q = f.q.trim().replace(/[%_,()]/g, '');
  if (q) {
    const { normalizeIraqiPhone } = await import('@raqeem/shared');
    const phone = normalizeIraqiPhone(q);
    const { data: cs } = phone ? await sb().from('customers').select('id').eq('phone', phone).limit(20) : await sb().from('customers').select('id').ilike('name', `%${q}%`).limit(50);
    const ids = (cs ?? []).map((c) => c.id as string);
    query = ids.length ? query.or(`number.ilike.%${q}%,customer_id.in.(${ids.join(',')})`) : query.ilike('number', `%${q}%`);
  }
  const { data, error, count } = await query.order('created_at', { ascending: false }).range((f.page - 1) * f.pageSize, f.page * f.pageSize - 1);
  if (error) throw error;
  type R = Order & { customers: { name: string; phone: string | null } | null; order_items: { qty: number }[] };
  return {
    total: count ?? 0,
    rows: ((data ?? []) as R[]).map(({ customers, order_items, ...o }) => ({ ...o, customer_name: customers?.name ?? o.address?.recipient_name ?? 'زبون', customer_phone: o.address?.phone ?? customers?.phone ?? null, items_count: (order_items ?? []).reduce((s, i) => s + Number(i.qty), 0) })),
  };
}

export const ORDER_TABS: OrderStatus[] = ['pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'cancelled', 'returned'];

export async function orderCounts(): Promise<Record<OrderStatus | 'all', number>> {
  const out = { all: 0 } as Record<OrderStatus | 'all', number>;
  if (IS_DEMO) {
    for (const s of ORDER_TABS) out[s] = demoDb.orders.filter((o) => o.status === s).length;
    out.all = demoDb.orders.length;
    return out;
  }
  const res = await Promise.all(ORDER_TABS.map((s) => sb().from('orders').select('id', { count: 'exact', head: true }).eq('status', s)));
  ORDER_TABS.forEach((s, i) => { out[s] = res[i].count ?? 0; out.all += out[s]; });
  return out;
}

export async function getOrder(id: string): Promise<OrderFull> {
  if (IS_DEMO) {
    await demoDelay();
    const order = demoDb.orders.find((o) => o.id === id);
    if (!order) throw new AppError('الطلب غير موجود.');
    return {
      order, items: demoDb.order_items.filter((i) => i.order_id === id),
      events: ledger.order_events.filter((e) => e.order_id === id).sort((a, b) => a.created_at.localeCompare(b.created_at)).map((e) => ({ ...e, actor_name: staffName(e.actor_id) })),
      customer: demoDb.customers.find((c) => c.id === order.customer_id) ?? null,
      invoice_number: order.invoice_id ? ledger.invoices.find((i) => i.id === order.invoice_id)?.number ?? null : null,
    };
  }
  const { data: order, error } = await sb().from('orders').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!order) throw new AppError('الطلب غير موجود.');
  const o = order as Order;
  const [items, events, cust, inv, names] = await Promise.all([
    sb().from('order_items').select('*').eq('order_id', id),
    sb().from('order_events').select('*').eq('order_id', id).order('created_at'),
    sb().from('customers').select('*').eq('id', o.customer_id).maybeSingle(),
    o.invoice_id ? sb().from('invoices').select('number').eq('id', o.invoice_id).maybeSingle() : Promise.resolve({ data: null }),
    staffNames(),
  ]);
  return {
    order: o, items: (items.data ?? []) as OrderItem[],
    events: ((events.data ?? []) as OrderEvent[]).map((e) => ({ ...e, actor_name: e.actor_id ? names[e.actor_id] ?? null : null })),
    customer: (cust.data as Customer | null) ?? null, invoice_number: (inv.data as { number: string } | null)?.number ?? null,
  };
}

/**
 * set_order_status(order_id, status, note). status = null ← ملاحظة داخلية فقط (حدث غير ظاهر للزبون + staff_note).
 */
export async function setOrderStatus(orderId: string, status: OrderStatus | null, note: string | null): Promise<void> {
  if (!IS_DEMO) { await rpc('set_order_status', { order_id: orderId, status, note }); return; }
  await demoDelay(220);
  const o = demoDb.orders.find((x) => x.id === orderId);
  if (!o) throw new AppError('الطلب غير موجود.');
  if (status === null) {
    if (!note?.trim()) throw new AppError('اكتب الملاحظة.');
    o.staff_note = note.trim();
    o.updated_at = nowIso();
    demoOrderEvent(o.id, null, note.trim(), false);
    demoChanged();
    return;
  }
  if (!canTransition(o.status, status, o.fulfillment)) throw new AppError('لا يمكن نقل الطلب إلى هذه الحالة من حالته الحالية.');
  const items = demoDb.order_items.filter((i) => i.order_id === o.id);
  const at = nowIso();
  if (status === 'confirmed') o.confirmed_at = at;
  if (status === 'delivered') {
    const inv = demoCreateInvoice({
      kind: 'sale', channel: 'online', customer_id: o.customer_id, warehouse_id: o.warehouse_id, order_id: o.id, delivery_fee: o.delivery_fee, discount: o.discount,
      lines: items.map((i) => ({ variant_id: i.variant_id, qty: i.qty, unit_price: i.unit_price, name: i.name, variant_title: i.variant_title, sku: i.sku, product_id: i.product_id, unit_cost: variantCost(i.variant_id) })),
    });
    for (const i of items) demoMoveStock(i.variant_id, o.warehouse_id, -i.qty);
    if (o.payment_method === 'cod' || o.payment_method === 'office' || o.payment_status === 'paid') {
      demoAddPayment({ direction: 'in', method: o.payment_method === 'online' ? 'wayl' : 'cash', amount: inv.total, customer_id: o.customer_id, invoice_id: inv.id, order_id: o.id, note: o.payment_method === 'cod' ? 'تحصيل المندوب' : null });
      o.payment_status = 'paid';
    }
    o.invoice_id = inv.id;
    o.delivered_at = at;
  }
  if (status === 'cancelled') { o.cancel_reason = note; o.cancelled_at = at; }
  if (status === 'returned' && o.invoice_id) {
    const src = ledger.invoices.find((i) => i.id === o.invoice_id);
    if (src) {
      const ret = demoCreateInvoice({ kind: 'sale_return', channel: 'online', customer_id: o.customer_id, warehouse_id: o.warehouse_id, return_of: src.id, note,
        lines: ledger.invoice_items.filter((i) => i.invoice_id === src.id).map((i) => ({ variant_id: i.variant_id, qty: i.qty, unit_price: i.line_total / i.qty, unit_cost: i.unit_cost, name: i.name, variant_title: i.variant_title, sku: i.sku, product_id: i.product_id })) });
      for (const i of items) demoMoveStock(i.variant_id, o.warehouse_id, i.qty);
      if (src.paid > 0) demoAddPayment({ direction: 'out', method: 'cash', amount: Math.min(src.paid, ret.total), customer_id: o.customer_id, invoice_id: ret.id, order_id: o.id, note: 'استرداد طلب مُرجع' });
      o.payment_status = 'refunded';
    }
  }
  o.status = status;
  o.updated_at = at;
  const msg: Partial<Record<OrderStatus, string>> = { confirmed: 'تم تأكيد طلبك', preparing: 'نجهّز طلبك الآن', ready: o.fulfillment === 'pickup' ? 'طلبك جاهز للاستلام من المكتب' : 'طلبك جاهز', out_for_delivery: 'طلبك مع المندوب في الطريق إليك', delivered: 'تم تسليم طلبك', cancelled: 'تم إلغاء الطلب', returned: 'تم تسجيل إرجاع الطلب' };
  demoOrderEvent(o.id, status, note ? `${msg[status] ?? ''}${status === 'cancelled' ? ` — ${note}` : note ? ` — ${note}` : ''}` : msg[status] ?? null, true, at);
  demoChanged();
}

// ================================================================== طلبات التوفير

export interface RequestRow extends ProductRequest { customer_name: string | null; customer_phone: string | null; product_name: string | null }

export async function listRequests(status: RequestStatus | 'all' | 'open', q: string): Promise<RequestRow[]> {
  const open: RequestStatus[] = ['new', 'reviewing', 'sourcing', 'available'];
  if (IS_DEMO) {
    await demoDelay();
    const t = q.trim();
    return demoDb.product_requests
      .filter((r) => (status === 'all' ? true : status === 'open' ? open.includes(r.status) : r.status === status))
      .filter((r) => !t || r.title.includes(t) || r.number.toLowerCase().includes(t.toLowerCase()) || (demoDb.customers.find((c) => c.id === r.customer_id)?.name ?? '').includes(t))
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((r) => {
        const c = demoDb.customers.find((x) => x.id === r.customer_id);
        return { ...r, customer_name: c?.name ?? null, customer_phone: c?.phone ?? null, product_name: demoDb.products.find((p) => p.id === r.product_id)?.name ?? null };
      });
  }
  let query = sb().from('product_requests').select('*, customers(name,phone), products(name)').order('created_at', { ascending: false }).limit(300);
  if (status === 'open') query = query.in('status', open);
  else if (status !== 'all') query = query.eq('status', status);
  const t = q.trim().replace(/[%_,()]/g, '');
  if (t) query = query.or(`title.ilike.%${t}%,number.ilike.%${t}%`);
  const { data, error } = await query;
  if (error) throw error;
  type R = ProductRequest & { customers: { name: string; phone: string | null } | null; products: { name: string } | null };
  return ((data ?? []) as R[]).map(({ customers, products, ...r }) => ({ ...r, customer_name: customers?.name ?? null, customer_phone: customers?.phone ?? null, product_name: products?.name ?? null }));
}

export async function setRequestStatus(id: string, status: RequestStatus, reply: string | null, productId: string | null): Promise<void> {
  if (!IS_DEMO) { await rpc('set_request_status', { id, status, reply, product_id: productId }); return; }
  await demoDelay();
  const r = demoDb.product_requests.find((x) => x.id === id);
  if (!r) throw new AppError('الطلب غير موجود.');
  Object.assign(r, { status, staff_reply: reply, product_id: productId, updated_at: nowIso() });
  demoChanged();
}

/** صورة طلب التوفير في الحاوية الخاصة ← رابط موقّع لساعة */
export async function requestImageUrl(key: string | null): Promise<string | null> {
  if (!key) return null;
  if (IS_DEMO || /^(https?:|blob:|data:)/.test(key)) return /^(https?:|blob:|data:)/.test(key) ? key : null;
  const path = /\.(webp|png|jpe?g)$/i.test(key) ? key : `${key}-md.webp`;
  const { data } = await sb().storage.from('private').createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

export interface ProductLite { id: string; name: string; cover_key: string | null; price: number | null; sku: string | null }

/** بحث خفيف عن منتجات (للربط في طلبات التوفير والبانرات وأقسام الرئيسية) */
export async function searchProducts(q: string, limit = 12): Promise<ProductLite[]> {
  const t = q.trim();
  if (IS_DEMO) {
    await demoDelay(80);
    const { matchScore } = await import('@raqeem/shared');
    return demoDb.products
      .filter((p) => !p.archived_at)
      .map((p) => ({ p, v: demoDb.product_variants.filter((v) => v.product_id === p.id) }))
      .map((x) => ({ ...x, s: t ? matchScore(t, x.p.name, x.v.map((v) => v.sku)) : 1 }))
      .filter((x) => x.s > 0).sort((a, b) => b.s - a.s).slice(0, limit)
      .map(({ p, v }) => ({ id: p.id, name: p.name, cover_key: p.cover_key, price: v[0]?.price ?? null, sku: v[0]?.sku ?? null }));
  }
  let query = sb().from('products').select('id,name,cover_key,product_variants(price,sku)').is('archived_at', null).limit(limit);
  if (t) query = query.ilike('search_text', `%${t.replace(/[%_]/g, '')}%`);
  const { data, error } = await query;
  if (error) throw error;
  type R = { id: string; name: string; cover_key: string | null; product_variants: { price: number; sku: string }[] };
  return ((data ?? []) as R[]).map((p) => ({ id: p.id, name: p.name, cover_key: p.cover_key, price: p.product_variants?.[0]?.price ?? null, sku: p.product_variants?.[0]?.sku ?? null }));
}

/** اليوم بتوقيت بغداد كفترة */
export function todayRange(): DateRange {
  return { from: startOfBaghdadDay().toISOString(), to: startOfBaghdadDay(Date.now(), 1).toISOString() };
}
