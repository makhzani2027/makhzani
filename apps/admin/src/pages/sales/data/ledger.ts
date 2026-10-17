/**
 * دفتر وضع العرض: الفواتير والدفعات والمصروفات والصندوق وأحداث الطلبات والسجل والتقييمات والموظفون.
 * demoDb المشترك لا يحوي هذه الجداول، فنبنيها هنا مرة واحدة بتاريخ واقعي (٤ أشهر) بمولّد أرقام ثابت البذرة
 * حتى تظهر الرئيسية والتقارير والديون بأرقام معقولة. كل الكتابة في العرض تمر من الدوال أدناه.
 */
import {
  formatDocNumber, startOfBaghdadDay, roundMoney,
  type AuditEntry, type CashSession, type CustomerBalance, type DocKind, type Expense, type Invoice, type InvoiceChannel,
  type InvoiceItem, type InvoiceKind, type NotificationCampaign, type OrderEvent, type OrderStatus, type Payment,
  type PaymentDirection, type PaymentMethod, type Profile, type Review, type Serial, type SupplierBalance,
} from '@raqeem/shared';
import { demoDb, demoId } from '../../../lib/demo-db';

const MIN = 60_000;
const HOUR = 60 * MIN;

/** مولّد ثابت البذرة: نفس البيانات في كل تحميل */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface DemoLedger {
  invoices: Invoice[];
  invoice_items: InvoiceItem[];
  payments: Payment[];
  expenses: Expense[];
  cash_sessions: CashSession[];
  order_events: OrderEvent[];
  audit_log: AuditEntry[];
  campaigns: NotificationCampaign[];
  reviews: Review[];
  staff: Profile[];
  serials: Serial[];
}

export const ledger: DemoLedger = {
  invoices: [], invoice_items: [], payments: [], expenses: [], cash_sessions: [], order_events: [],
  audit_log: [], campaigns: [], reviews: [], staff: [], serials: [],
};

const counters: Partial<Record<DocKind, number>> = {};
export function nextDoc(kind: DocKind): string {
  counters[kind] = (counters[kind] ?? 0) + 1;
  return formatDocNumber(kind, counters[kind]!);
}

// ------------------------------------------------------------------ الموظفون

const iso = (t: number) => new Date(t).toISOString();
const profile = (id: string, full_name: string, email: string, role_id: string | null, extra: Partial<Profile> = {}): Profile => ({
  id, kind: 'staff', full_name, phone: null, email, avatar_key: null, role_id, is_owner: false, status: 'active', onboarded: true,
  governorate: 'baghdad', prefs: {}, last_seen_at: null, created_at: iso(Date.now() - 200 * 24 * HOUR), updated_at: iso(Date.now()), ...extra,
});

ledger.staff.push(
  profile('demo-owner', 'صاحب المتجر (عرض)', 'demo@raqeem.iq', null, { is_owner: true, last_seen_at: iso(Date.now()) }),
  profile('staff-1', 'حيدر سلمان', 'haider@raqeem.iq', 'role-2', { phone: '+9647712345670', last_seen_at: iso(Date.now() - 2 * HOUR) }),
  profile('staff-2', 'نور الهدى جاسم', 'noor@raqeem.iq', 'role-2', { last_seen_at: iso(Date.now() - 26 * HOUR) }),
  profile('staff-3', 'مصطفى كريم', 'mustafa@raqeem.iq', 'role-4', { last_seen_at: iso(Date.now() - 5 * HOUR) }),
  profile('staff-4', 'سجاد عباس', 'sajjad@raqeem.iq', 'role-3', { status: 'blocked', last_seen_at: iso(Date.now() - 40 * 24 * HOUR) }),
);

export const staffName = (id: string | null | undefined): string | null => (id ? ledger.staff.find((s) => s.id === id)?.full_name ?? null : null);

// ------------------------------------------------------------------ المخزون في العرض

/** يحرّك رصيد نسخة في مخزن (موجب دخول، سالب خروج) ويحدّث المتاح — مثل private.apply_movement */
export function demoMoveStock(variantId: string, warehouseId: string, delta: number) {
  let lvl = demoDb.stock_levels.find((s) => s.variant_id === variantId && s.warehouse_id === warehouseId);
  if (!lvl) {
    lvl = { variant_id: variantId, warehouse_id: warehouseId, qty: 0, reserved: 0, updated_at: iso(Date.now()) };
    demoDb.stock_levels.push(lvl);
  }
  lvl.qty += delta;
  lvl.updated_at = iso(Date.now());
  const v = demoDb.product_variants.find((x) => x.id === variantId);
  if (v) {
    const sellable = new Set(demoDb.warehouses.filter((w) => w.is_sellable).map((w) => w.id));
    v.available_qty = demoDb.stock_levels.filter((s) => s.variant_id === variantId && sellable.has(s.warehouse_id)).reduce((s, l) => s + l.qty - l.reserved, 0);
  }
}

export const variantCost = (variantId: string) => demoDb.variant_costs.find((c) => c.variant_id === variantId)?.avg_cost ?? 0;

// ------------------------------------------------------------------ الفواتير والدفعات

export interface DemoLine { variant_id: string; qty: number; unit_price: number; discount?: number; serials?: string[]; unit_cost?: number; name?: string; variant_title?: string | null; sku?: string; product_id?: string }

export function demoCreateInvoice(o: {
  kind: InvoiceKind; channel: InvoiceChannel; customer_id?: string | null; supplier_id?: string | null; warehouse_id?: string;
  lines: DemoLine[]; discount?: number; delivery_fee?: number; note?: string | null; created_by?: string | null; created_at?: string;
  cash_session_id?: string | null; order_id?: string | null; return_of?: string | null;
}): Invoice {
  const id = demoId();
  const docKind: DocKind = o.kind;
  const items: InvoiceItem[] = o.lines.map((l) => {
    const v = demoDb.product_variants.find((x) => x.id === l.variant_id);
    const p = demoDb.products.find((x) => x.id === (l.product_id ?? v?.product_id));
    const gross = l.unit_price * l.qty;
    const disc = Math.min(Math.max(l.discount ?? 0, 0), gross);
    return {
      id: demoId(), invoice_id: id, variant_id: l.variant_id, product_id: p?.id ?? l.product_id ?? '', name: l.name ?? p?.name ?? 'منتج',
      variant_title: l.variant_title !== undefined ? l.variant_title : v && v.title !== 'افتراضي' ? v.title : null, sku: l.sku ?? v?.sku ?? '',
      qty: l.qty, unit_price: l.unit_price, discount: disc, line_total: roundMoney(gross - disc), unit_cost: l.unit_cost ?? variantCost(l.variant_id), serials: l.serials ?? [],
    };
  });
  const subtotal = items.reduce((s, i) => s + i.line_total, 0);
  const discount = Math.min(Math.max(o.discount ?? 0, 0), subtotal);
  const fee = o.delivery_fee ?? 0;
  const total = roundMoney(subtotal - discount + fee);
  const inv: Invoice = {
    id, number: nextDoc(docKind), kind: o.kind, channel: o.channel, status: 'posted', customer_id: o.customer_id ?? null, supplier_id: o.supplier_id ?? null,
    order_id: o.order_id ?? null, return_of: o.return_of ?? null, warehouse_id: o.warehouse_id ?? demoDb.warehouses[0].id,
    subtotal, discount, delivery_fee: fee, total, paid: 0, due: total, cost_total: roundMoney(items.reduce((s, i) => s + i.unit_cost * i.qty, 0)),
    note: o.note ?? null, cash_session_id: o.cash_session_id ?? null, created_by: o.created_by ?? 'demo-owner', created_at: o.created_at ?? iso(Date.now()),
    voided_at: null, voided_by: null, void_reason: null,
  };
  ledger.invoices.push(inv);
  ledger.invoice_items.push(...items);
  return inv;
}

/** يعيد حساب المدفوع والمتبقي لفاتورة من دفعاتها الفعالة */
export function recalcInvoice(inv: Invoice) {
  const isOut = inv.kind === 'purchase' || inv.kind === 'sale_return';
  const paid = ledger.payments
    .filter((p) => p.invoice_id === inv.id && !p.voided_at)
    .reduce((s, p) => s + ((p.direction === 'out') === isOut ? p.amount : -p.amount), 0);
  inv.paid = roundMoney(paid);
  inv.due = roundMoney(inv.total - inv.paid);
}

export function demoAddPayment(o: {
  direction: PaymentDirection; method: PaymentMethod; amount: number; customer_id?: string | null; supplier_id?: string | null;
  invoice_id?: string | null; order_id?: string | null; cash_session_id?: string | null; reference?: string | null; note?: string | null;
  created_by?: string | null; created_at?: string;
}): Payment {
  const p: Payment = {
    id: demoId(), number: nextDoc(o.direction === 'in' ? 'receipt' : 'voucher'), direction: o.direction, method: o.method, amount: roundMoney(o.amount),
    customer_id: o.customer_id ?? null, supplier_id: o.supplier_id ?? null, invoice_id: o.invoice_id ?? null, order_id: o.order_id ?? null,
    cash_session_id: o.cash_session_id ?? null, reference: o.reference ?? null, note: o.note ?? null, created_by: o.created_by ?? 'demo-owner',
    created_at: o.created_at ?? iso(Date.now()), voided_at: null,
  };
  ledger.payments.push(p);
  const inv = p.invoice_id ? ledger.invoices.find((i) => i.id === p.invoice_id) : undefined;
  if (inv) recalcInvoice(inv);
  return p;
}

/** يوزّع دفعة زبون على أقدم فواتيره المستحقة (مثل record_payment بلا فاتورة محددة) */
export function oldestDueInvoice(customerId: string): Invoice | undefined {
  return ledger.invoices
    .filter((i) => i.customer_id === customerId && i.kind === 'sale' && i.status === 'posted' && i.due > 0)
    .sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
}

// ------------------------------------------------------------------ الأرصدة (مثل views)

export function demoCustomerBalance(customerId: string): CustomerBalance {
  let sales = 0, returns = 0, paid = 0;
  let last: string | null = null;
  for (const i of ledger.invoices) {
    if (i.customer_id !== customerId || i.status !== 'posted') continue;
    if (i.kind === 'sale') sales += i.total;
    else if (i.kind === 'sale_return') returns += i.total;
    else continue;
    if (!last || i.created_at > last) last = i.created_at;
  }
  for (const p of ledger.payments) {
    if (p.customer_id !== customerId || p.voided_at) continue;
    paid += p.direction === 'in' ? p.amount : -p.amount;
    if (!last || p.created_at > last) last = p.created_at;
  }
  return { customer_id: customerId, sales_total: sales, returns_total: returns, paid_total: paid, balance: roundMoney(sales - returns - paid), last_activity_at: last };
}

export function demoSupplierBalance(supplierId: string): SupplierBalance {
  let purchases = 0, returns = 0, paid = 0;
  let last: string | null = null;
  for (const i of ledger.invoices) {
    if (i.supplier_id !== supplierId || i.status !== 'posted') continue;
    if (i.kind === 'purchase') purchases += i.total;
    else if (i.kind === 'purchase_return') returns += i.total;
    else continue;
    if (!last || i.created_at > last) last = i.created_at;
  }
  for (const p of ledger.payments) {
    if (p.supplier_id !== supplierId || p.voided_at) continue;
    paid += p.direction === 'out' ? p.amount : -p.amount;
    if (!last || p.created_at > last) last = p.created_at;
  }
  return { supplier_id: supplierId, purchases_total: purchases, returns_total: returns, paid_total: paid, balance: roundMoney(purchases - returns - paid), last_activity_at: last };
}

/** المتوقع في درج الصندوق: الافتتاحي + نقد داخل − نقد خارج − مصروفات نقدية في الجلسة */
export function demoSessionTotals(s: CashSession) {
  const pays = ledger.payments.filter((p) => p.cash_session_id === s.id && !p.voided_at && p.method === 'cash');
  const cashIn = pays.filter((p) => p.direction === 'in').reduce((a, p) => a + p.amount, 0);
  const cashOut = pays.filter((p) => p.direction === 'out').reduce((a, p) => a + p.amount, 0);
  const exp = ledger.expenses.filter((e) => e.cash_session_id === s.id && e.method === 'cash').reduce((a, e) => a + e.amount, 0);
  return { cash_in: cashIn, cash_out: cashOut, expenses: exp, expected: roundMoney(s.opening_float + cashIn - cashOut - exp) };
}

export function demoAudit(action: string, entity: string, entityId: string | null, data: Record<string, unknown>, actor = 'demo-owner') {
  ledger.audit_log.unshift({ id: (ledger.audit_log[0]?.id ?? 0) + 1, actor_id: actor, action, entity, entity_id: entityId, data, created_at: iso(Date.now()) });
}

export function demoOrderEvent(orderId: string, status: OrderStatus | null, note: string | null, visible: boolean, at = iso(Date.now()), actor: string | null = 'demo-owner') {
  ledger.order_events.push({ id: demoId(), order_id: orderId, status, note, is_customer_visible: visible, actor_id: actor, created_at: at });
}

// ================================================================== البذور (تاريخ واقعي)

function seed() {
  const r = mulberry32(20261016);
  const pick = <T,>(arr: T[]): T => arr[Math.floor(r() * arr.length)];
  const now = Date.now();
  const variants = demoDb.product_variants.filter((v) => v.is_active);
  const weightOf = (vid: string) => {
    const v = variants.find((x) => x.id === vid)!;
    return Math.max(8, demoDb.products.find((p) => p.id === v.product_id)?.sold_count ?? 10);
  };
  const totalW = variants.reduce((s, v) => s + weightOf(v.id), 0);
  const pickVariant = () => {
    let x = r() * totalW;
    for (const v of variants) { x -= weightOf(v.id); if (x <= 0) return v; }
    return variants[0];
  };
  const cashCustomer = demoDb.customers.find((c) => c.is_cash_customer)!;
  const regulars = demoDb.customers.filter((c) => !c.is_cash_customer);
  const cashiers = ['staff-1', 'staff-2', 'demo-owner'];
  const [main, shop] = demoDb.warehouses;

  type Ev = { at: number; run: () => void };
  const events: Ev[] = [];

  const DAYS = 120;
  const sessions: Record<number, CashSession> = {};

  for (let d = DAYS; d >= 0; d--) {
    const day = startOfBaghdadDay(now, -d).getTime();
    const opened = day + 9 * HOUR + 45 * MIN;
    if (opened > now) continue;
    const isToday = d === 0;
    const sess: CashSession = {
      id: demoId(), status: isToday ? 'open' : 'closed', opened_by: isToday ? 'demo-owner' : pick(cashiers.slice(0, 2)), opened_at: iso(opened),
      opening_float: 100000, closed_by: null, closed_at: null, expected_cash: null, counted_cash: null, note: null,
    };
    sessions[d] = sess;
    events.push({ at: opened, run: () => ledger.cash_sessions.push(sess) });

    const weekday = new Date(day + 3 * HOUR).getUTCDay();
    // الجمعة أهدأ، والأيام الأخيرة أنشط (نمو طبيعي)
    const base = weekday === 5 ? 3 : 5 + Math.round((DAYS - d) / 40);
    const n = d > 60 ? Math.round(base * 0.7) : base + Math.floor(r() * 5);
    for (let k = 0; k < n; k++) {
      const at = day + 10 * HOUR + Math.floor(r() * 12 * HOUR);
      if (at > now) continue;
      const lines: DemoLine[] = [];
      const count = r() < 0.55 ? 1 : r() < 0.75 ? 2 : 3;
      for (let j = 0; j < count; j++) {
        const v = pickVariant();
        if (lines.some((l) => l.variant_id === v.id)) continue;
        const qty = v.price < 15000 && r() < 0.4 ? 2 + Math.floor(r() * 2) : 1;
        lines.push({ variant_id: v.id, qty, unit_price: v.price, discount: r() < 0.08 ? Math.round((v.price * qty * 0.05) / 250) * 250 : 0 });
      }
      const credit = r() < 0.05;
      const customer = credit || r() < 0.18 ? pick(regulars) : cashCustomer;
      const method: PaymentMethod = r() < 0.72 ? 'cash' : r() < 0.5 ? 'card' : r() < 0.7 ? 'zaincash' : 'fib';
      const by = isToday ? 'demo-owner' : sess.opened_by;
      events.push({
        at,
        run: () => {
          const inv = demoCreateInvoice({ kind: 'sale', channel: 'pos', customer_id: customer.id, warehouse_id: r() < 0.8 ? main.id : shop.id, lines, discount: r() < 0.06 ? 1000 : 0, created_by: by, created_at: iso(at), cash_session_id: sess.id });
          const pay = credit && customer.id !== cashCustomer.id ? Math.round((inv.total * (r() < 0.5 ? 0 : 0.4)) / 1000) * 1000 : inv.total;
          if (pay > 0) demoAddPayment({ direction: 'in', method: credit ? 'cash' : method, amount: pay, customer_id: customer.id, invoice_id: inv.id, cash_session_id: sess.id, created_by: by, created_at: iso(at) });
        },
      });
    }

    // مرتجع كل بضعة أيام
    if (d > 0 && d % 6 === 3) {
      const at = day + 18 * HOUR;
      events.push({
        at,
        run: () => {
          const src = ledger.invoices.filter((i) => i.kind === 'sale' && i.channel === 'pos' && i.status === 'posted').slice(-12)[0];
          const item = src && ledger.invoice_items.find((i) => i.invoice_id === src.id);
          if (!src || !item) return;
          const ret = demoCreateInvoice({ kind: 'sale_return', channel: 'pos', customer_id: src.customer_id, warehouse_id: src.warehouse_id, return_of: src.id, lines: [{ variant_id: item.variant_id, qty: 1, unit_price: item.line_total / item.qty, unit_cost: item.unit_cost }], note: 'المنتج لا يناسب الزبون', created_by: sess.opened_by, created_at: iso(at), cash_session_id: sess.id });
          demoAddPayment({ direction: 'out', method: 'cash', amount: ret.total, customer_id: src.customer_id, invoice_id: ret.id, cash_session_id: sess.id, created_by: sess.opened_by, created_at: iso(at), note: 'استرداد نقدي' });
        },
      });
    }

    // المصروفات
    const dayOfMonth = new Date(day + 3 * HOUR).getUTCDate();
    const addExpense = (category: string, amount: number, method: PaymentMethod, note: string | null, hour = 13) => {
      const at = day + hour * HOUR;
      if (at > now) return;
      events.push({ at, run: () => ledger.expenses.push({ id: demoId(), category, amount, method, note, spent_at: iso(at), cash_session_id: method === 'cash' ? sess.id : null, created_by: 'demo-owner', created_at: iso(at) }) });
    };
    if (dayOfMonth === 1) { addExpense('إيجار', 1500000, 'bank_transfer', 'إيجار المحل والمخزن'); addExpense('رواتب', 2400000, 'bank_transfer', 'رواتب الموظفين الأربعة', 14); }
    if (dayOfMonth === 5) addExpense('كهرباء', 185000, 'cash', 'فاتورة الكهرباء الوطنية');
    if (weekday === 6) addExpense('مولدة', 120000, 'cash', 'اشتراك المولدة الأسبوعي', 11);
    if (dayOfMonth === 10) addExpense('إنترنت', 60000, 'zaincash', null);
    if (d % 4 === 1) addExpense('نقل', 15000 + Math.round(r() * 4) * 5000, 'cash', 'أجور توصيل بضاعة', 16);
    if (d % 23 === 7) addExpense('صيانة', 75000, 'cash', 'صيانة المكيف');
  }

  // بيع آجل لزبائن دائمين بأعمار مختلفة (لتقرير أعمار الديون)
  const ali = regulars[0];
  const noor = regulars[2] ?? regulars[0];
  const creditSeeds: [string, number, number, number][] = [
    [noor.id, 104, 640000, 200000], [noor.id, 72, 410000, 0], [ali.id, 48, 165000, 50000], [noor.id, 22, 285000, 85000], [ali.id, 4, 90000, 0],
  ];
  for (const [cid, daysAgo, target, paidNow] of creditSeeds) {
    const at = startOfBaghdadDay(now, -daysAgo).getTime() + 15 * HOUR;
    events.push({
      at,
      run: () => {
        const lines: DemoLine[] = [];
        let sum = 0;
        while (sum < target * 0.9) {
          const v = pickVariant();
          const qty = Math.max(1, Math.round(Math.min(5, (target - sum) / v.price)));
          if (sum + v.price * qty > target * 1.15) { if (lines.length) break; }
          lines.push({ variant_id: v.id, qty, unit_price: v.wholesale_price ?? v.price });
          sum += v.price * qty;
        }
        const inv = demoCreateInvoice({ kind: 'sale', channel: 'manual', customer_id: cid, lines, created_by: 'demo-owner', created_at: iso(at), note: 'بيع بالآجل' });
        if (paidNow > 0) demoAddPayment({ direction: 'in', method: 'cash', amount: paidNow, customer_id: cid, invoice_id: inv.id, created_at: iso(at) });
      },
    });
  }
  // سندات قبض لاحقة من التاجر
  for (const daysAgo of [60, 30, 9]) {
    const at = startOfBaghdadDay(now, -daysAgo).getTime() + 12 * HOUR;
    events.push({ at, run: () => { const inv = oldestDueInvoice(noor.id); if (inv) demoAddPayment({ direction: 'in', method: 'cash', amount: Math.min(inv.due, 100000), customer_id: noor.id, invoice_id: inv.id, created_at: iso(at), note: 'دفعة من الحساب' }); } });
  }

  // مشتريات من الموردين (لتبويب «علينا»)
  const purchaseSeeds: [number, number, number, number][] = [[96, 0, 4200000, 4200000], [63, 1, 2850000, 2000000], [41, 0, 3600000, 2500000], [16, 1, 1950000, 0], [5, 0, 2300000, 1000000]];
  for (const [daysAgo, sIdx, target, paid] of purchaseSeeds) {
    const sup = demoDb.suppliers[sIdx] ?? demoDb.suppliers[0];
    const at = startOfBaghdadDay(now, -daysAgo).getTime() + 11 * HOUR;
    events.push({
      at,
      run: () => {
        const lines: DemoLine[] = [];
        let sum = 0;
        for (const v of variants) {
          if (sum >= target) break;
          if (r() < 0.6) continue;
          const cost = variantCost(v.id);
          const qty = Math.max(2, Math.min(20, Math.round((target - sum) / cost / 3)));
          lines.push({ variant_id: v.id, qty, unit_price: cost, unit_cost: cost });
          sum += cost * qty;
        }
        const inv = demoCreateInvoice({ kind: 'purchase', channel: 'manual', supplier_id: sup.id, lines, created_by: 'demo-owner', created_at: iso(at), note: 'فاتورة شراء' });
        if (paid > 0) demoAddPayment({ direction: 'out', method: 'cash', amount: Math.min(paid, inv.total), supplier_id: sup.id, invoice_id: inv.id, created_at: iso(at) });
      },
    });
  }

  events.sort((a, b) => a.at - b.at);
  for (const e of events) e.run();

  // إغلاق الجلسات السابقة بعدّ قريب من المتوقع (فروقات صغيرة واقعية)
  for (const [d, s] of Object.entries(sessions)) {
    if (s.status !== 'closed') continue;
    const t = demoDb.warehouses && demoSessionTotals(s);
    const variance = Number(d) % 9 === 2 ? -2000 : Number(d) % 13 === 5 ? 1000 : 0;
    s.expected_cash = t.expected;
    s.counted_cash = t.expected + variance;
    s.closed_by = s.opened_by;
    s.closed_at = iso(Date.parse(s.opened_at) + 12.5 * HOUR);
    s.note = variance < 0 ? 'نقص بسيط في الفكة' : null;
  }

  // الطلب المسلَّم ← فاتورة أونلاين + أحداث كل الطلبات
  const steps: OrderStatus[] = ['pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered'];
  const stepNote: Partial<Record<OrderStatus, string>> = { pending: 'استلمنا طلبك', confirmed: 'تم تأكيد طلبك', preparing: 'نجهّز طلبك الآن', ready: 'طلبك جاهز', out_for_delivery: 'طلبك مع المندوب', delivered: 'تم تسليم طلبك' };
  for (const o of demoDb.orders) {
    const created = Date.parse(o.created_at);
    const upto = steps.indexOf(o.status);
    steps.slice(0, upto + 1).forEach((s, i) => demoOrderEvent(o.id, s, stepNote[s] ?? null, true, iso(created + i * 22 * MIN), i === 0 ? null : 'staff-3'));
    if (o.status === 'delivered') {
      const items = demoDb.order_items.filter((i) => i.order_id === o.id);
      const inv = demoCreateInvoice({
        kind: 'sale', channel: 'online', customer_id: o.customer_id, warehouse_id: o.warehouse_id, order_id: o.id, delivery_fee: o.delivery_fee,
        lines: items.map((i) => ({ variant_id: i.variant_id, qty: i.qty, unit_price: i.unit_price, name: i.name, variant_title: i.variant_title, sku: i.sku, product_id: i.product_id })),
        created_by: 'staff-3', created_at: iso(created + 5 * 22 * MIN),
      });
      demoAddPayment({ direction: 'in', method: 'cash', amount: inv.total, customer_id: o.customer_id, invoice_id: inv.id, order_id: o.id, created_by: 'staff-3', created_at: inv.created_at, note: 'تحصيل المندوب' });
      o.invoice_id = inv.id;
      o.payment_status = 'paid';
    }
  }
  const prep = demoDb.orders.find((o) => o.status === 'preparing');
  if (prep) demoOrderEvent(prep.id, null, 'الزبون طلب التغليف كهدية', false, iso(Date.parse(prep.created_at) + 50 * MIN), 'staff-3');

  // الأرقام التسلسلية للأجهزة
  for (const p of demoDb.products.filter((x) => x.track_serials)) {
    for (const v of demoDb.product_variants.filter((x) => x.product_id === p.id)) {
      for (let i = 1; i <= v.available_qty; i++) {
        ledger.serials.push({ id: demoId(), variant_id: v.id, serial: `${v.sku.replace('RQ-', 'SN')}${String(i * 37 + 1000)}`, status: 'in_stock', warehouse_id: main.id, purchase_invoice_id: null, sale_invoice_id: null, note: null, created_at: iso(now), updated_at: iso(now) });
      }
    }
  }

  // تقييمات
  const reviewers = demoDb.customers.filter((c) => c.profile_id);
  const comments: [number, 1 | 2 | 3 | 4 | 5, string | null, boolean][] = [
    [0, 5, 'شاحن ممتاز وصغير، يشحن اللابتوب والهاتف معاً بسرعة.', true], [4, 5, 'عزل الضوضاء رائع والبطارية تدوم طويلاً.', true],
    [10, 4, 'القلاية جيدة جداً، فقط حجمها أكبر مما توقعت.', true], [5, 3, 'الصوت جيد لكن العلبة تخدش بسهولة.', true],
    [1, 5, null, true], [6, 1, 'رابط موقع آخر للبيع بسعر أقل www.example.com', false], [15, 4, 'الساعة أنيقة، أتمنى لو كانت البطارية أطول.', true],
  ];
  comments.forEach(([pIdx, rating, comment, visible], i) => {
    const c = reviewers[i % reviewers.length];
    const p = demoDb.products[pIdx];
    if (!p || !c?.profile_id) return;
    ledger.reviews.push({ id: demoId(), product_id: p.id, profile_id: c.profile_id, order_id: null, rating, comment, is_visible: visible, created_at: iso(now - (i + 1) * 31 * HOUR) });
  });

  // حملات إشعارات
  ledger.campaigns.push(
    { id: demoId(), title: 'أسبوع الإلكترونيات بدأ', body: 'خصومات حتى ٢٥٪ على السماعات والشواحن لمدة أسبوع فقط.', image_key: null, link_kind: 'category', link_value: demoDb.categories[1]?.id ?? null, sent_at: iso(now - 3 * 24 * HOUR), created_by: 'demo-owner', created_at: iso(now - 3 * 24 * HOUR) },
    { id: demoId(), title: 'وصلت القلاية الهوائية', body: 'عادت متوفرة بسعر خاص للطلبات من التطبيق.', image_key: null, link_kind: 'product', link_value: demoDb.products[10]?.id ?? null, sent_at: iso(now - 12 * 24 * HOUR), created_by: 'demo-owner', created_at: iso(now - 12 * 24 * HOUR) },
  );

  // سجل العمليات
  const p0 = demoDb.products[0];
  const v0 = demoDb.product_variants[0];
  const audits: Omit<AuditEntry, 'id'>[] = [
    { actor_id: 'demo-owner', action: 'update', entity: 'product_variants', entity_id: v0.id, data: { old: { price: 48000 }, new: { price: v0.price }, label: `${p0.name} — ${v0.sku}` }, created_at: iso(now - 50 * MIN) },
    { actor_id: 'demo-owner', action: 'insert', entity: 'coupons', entity_id: null, data: { new: { code: 'WELCOME10', kind: 'percent', value: 10 } }, created_at: iso(now - 5 * HOUR) },
    { actor_id: 'staff-3', action: 'update', entity: 'customers', entity_id: regulars[0].id, data: { old: { credit_limit: 300000 }, new: { credit_limit: 500000 }, label: regulars[0].name }, created_at: iso(now - 27 * HOUR) },
    { actor_id: 'demo-owner', action: 'update', entity: 'app_settings', entity_id: 'checkout', data: { old: { free_delivery_over: 200000 }, new: { free_delivery_over: 150000 } }, created_at: iso(now - 2 * 24 * HOUR) },
    { actor_id: 'demo-owner', action: 'update', entity: 'profiles', entity_id: 'staff-4', data: { old: { status: 'active' }, new: { status: 'blocked' }, label: 'سجاد عباس' }, created_at: iso(now - 9 * 24 * HOUR) },
    { actor_id: 'staff-1', action: 'void', entity: 'invoices', entity_id: null, data: { number: 'S-000014', reason: 'أُدخلت بالخطأ مرتين' }, created_at: iso(now - 11 * 24 * HOUR) },
    { actor_id: 'demo-owner', action: 'insert', entity: 'banners', entity_id: demoDb.banners[0]?.id ?? null, data: { new: { title: demoDb.banners[0]?.title, placement: 'home_hero' } }, created_at: iso(now - 14 * 24 * HOUR) },
  ];
  audits.forEach((a, i) => ledger.audit_log.push({ ...a, id: audits.length - i }));
}

seed();
