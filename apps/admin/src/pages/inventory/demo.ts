/**
 * جداول وضع العرض الإضافية للمخزون والمشتريات: الحركات، السريالات، الصور، فواتير الشراء وبنودها، الدفعات، النقل، الجرد.
 * تُعلَّق على demoDb نفسه وبنفس أسماء جداول قاعدة البيانات (invoices، payments…) حتى يقرأها أي جزء آخر من اللوحة.
 * كل جدول يُنشأ بـ «إن لم يوجد» فلا يمسح ما أضافه غيرنا.
 * demoApplyMovement تحاكي private.apply_movement حرفياً: تمنع السالب، تكتب balance_after، تحدّث available_qty ومتوسط التكلفة.
 */
import {
  formatDocNumber, formatQty, weightedAvgCost,
  type DocKind, type Invoice, type InvoiceItem, type InventorySettings, type InvoiceSettings, type MovementKind, type Payment,
  type ProductImage, type Serial, type StockMovement, type Stocktake, type StocktakeItem, type Transfer, type TransferItem,
} from '@raqeem/shared';
import { demoDb, demoId } from '../../lib/demo-db';
import { AppError } from '../../lib/supabase';

export interface DemoExt {
  product_images: ProductImage[];
  stock_movements: StockMovement[];
  serials: Serial[];
  transfers: Transfer[];
  transfer_items: TransferItem[];
  stocktakes: Stocktake[];
  stocktake_items: StocktakeItem[];
  invoices: Invoice[];
  invoice_items: InvoiceItem[];
  payments: Payment[];
  doc_counters: Partial<Record<DocKind, number>>;
  barcode_seq: number;
}
export type DemoDb = typeof demoDb & DemoExt;

/** الموظف الحالي في وضع العرض (نفس معرّف profile في lib/auth) */
export const DEMO_USER = 'demo-owner';
export const DEMO_STAFF = [
  { id: 'demo-owner', full_name: 'صاحب المتجر (عرض)' },
  { id: 'demo-keeper', full_name: 'حسن كريم — أمين المخزن' },
];

export const DEFAULT_LABEL_SIZE = { width_mm: 50, height_mm: 25 };

let ready = false;
let movementSeq = 0;

/** قاعدة بيانات العرض مع جداولنا (تُبنى مرة واحدة عند أول استعمال) */
export function ddb(): DemoDb {
  const db = demoDb as DemoDb;
  if (!ready) {
    ready = true;
    seed(db);
  }
  return db;
}

const DAY = 86_400_000;
const iso = (t: number) => new Date(t).toISOString();

function seed(db: DemoDb) {
  db.product_images ??= [];
  db.serials ??= [];
  db.transfers ??= [];
  db.transfer_items ??= [];
  db.stocktakes ??= [];
  db.stocktake_items ??= [];
  db.invoices ??= [];
  db.invoice_items ??= [];
  db.payments ??= [];
  db.doc_counters ??= {};
  db.barcode_seq ??= 1200;
  const wh = db.warehouses;
  db.settings.inventory ??= { allow_negative_stock: false, default_warehouse_id: wh.find((w) => w.is_default)?.id ?? null, low_stock_default: 5 } satisfies InventorySettings;
  db.settings.invoice ??= {
    receipt_width: 80, show_logo: true, header_note: null, footer_note: 'شكراً لتسوقكم من رقيم', return_policy: null, show_qr: true, label_size: DEFAULT_LABEL_SIZE,
  } satisfies InvoiceSettings;
  if (db.stock_movements) {
    movementSeq = Math.max(0, ...db.stock_movements.map((m) => m.id));
    return;
  }
  db.stock_movements = [];
  buildHistory(db);
}

/**
 * تاريخ معقول ينتهي بنفس الأرصدة الحالية في البيانات التجريبية:
 * رصيد افتتاحي قبل شهرين ← فاتورتا شراء من الموردين ← مبيعات متفرقة. بعض النسخ بلا مبيعات فتظهر في «الراكد».
 */
function buildHistory(db: DemoDb) {
  const now = Date.now();
  const [main, shop] = db.warehouses;
  const [s1, s2] = db.suppliers;
  const cost = (vid: string) => db.variant_costs.find((c) => c.variant_id === vid)?.avg_cost ?? 0;
  const purchaseA: { vid: string; qty: number }[] = [];
  const purchaseB: { vid: string; qty: number }[] = [];
  const events: Omit<StockMovement, 'id' | 'balance_after'>[] = [];

  db.product_variants.forEach((v, i) => {
    for (const lvl of db.stock_levels.filter((l) => l.variant_id === v.id)) {
      const isMain = lvl.warehouse_id === main.id;
      const p = isMain && i % 4 < 2 && lvl.qty > 1 ? Math.ceil(lvl.qty / 2) : 0;
      const s = isMain && i % 3 !== 0 ? (i % 5) + 1 : 0;
      const opening = lvl.qty + s - p;
      const base = { variant_id: v.id, warehouse_id: lvl.warehouse_id, note: null, created_by: 'demo-keeper' };
      if (opening > 0) events.push({ ...base, kind: 'opening', qty: opening, unit_cost: cost(v.id), ref_type: 'adjustment', ref_id: null, created_at: iso(now - 62 * DAY + i * 60_000) });
      if (p > 0) {
        (i % 4 === 0 ? purchaseA : purchaseB).push({ vid: v.id, qty: p });
        events.push({ ...base, kind: 'purchase', qty: p, unit_cost: cost(v.id), ref_type: 'invoice', ref_id: i % 4 === 0 ? 'inv-a' : 'inv-b', created_at: iso(now - (i % 4 === 0 ? 21 : 9) * DAY) });
      }
      if (s > 0) events.push({ ...base, kind: 'sale', qty: -s, unit_cost: cost(v.id), ref_type: null, ref_id: null, note: 'بيع من نقطة البيع', created_by: DEMO_USER, created_at: iso(now - (1 + (i % 14)) * DAY - i * 3_600_000) });
    }
    // سريالات للأجهزة بعدد القطع الموجودة في كل مخزن
    const product = db.products.find((x) => x.id === v.product_id);
    if (product?.track_serials) {
      for (const lvl of db.stock_levels.filter((l) => l.variant_id === v.id)) {
        for (let n = 0; n < lvl.qty; n++) {
          db.serials.push({
            id: demoId(), variant_id: v.id, serial: `SN${v.sku.replace(/\D/g, '')}${lvl.warehouse_id === shop.id ? 'S' : 'M'}${String(n + 1).padStart(4, '0')}`,
            status: 'in_stock', warehouse_id: lvl.warehouse_id, purchase_invoice_id: null, sale_invoice_id: null, note: null, created_at: iso(now - 40 * DAY), updated_at: iso(now - 40 * DAY),
          });
        }
      }
    }
  });

  // فاتورتا الشراء
  const makeInvoice = (key: string, supplierId: string, lines: { vid: string; qty: number }[], daysAgo: number, paidRatio: number) => {
    if (!lines.length) return;
    const id = demoId();
    const number = nextDocNumber(db, 'purchase');
    const created = iso(now - daysAgo * DAY);
    let subtotal = 0;
    for (const l of lines) {
      const v = db.product_variants.find((x) => x.id === l.vid)!;
      const p = db.products.find((x) => x.id === v.product_id)!;
      const uc = cost(v.id);
      subtotal += uc * l.qty;
      db.invoice_items.push({
        id: demoId(), invoice_id: id, variant_id: v.id, product_id: p.id, name: p.name, variant_title: v.title === 'افتراضي' ? null : v.title, sku: v.sku,
        qty: l.qty, unit_price: uc, discount: 0, line_total: uc * l.qty, unit_cost: uc, serials: [],
      });
    }
    const paid = Math.round((subtotal * paidRatio) / 1000) * 1000;
    db.invoices.push({
      id, number, kind: 'purchase', channel: 'manual', status: 'posted', customer_id: null, supplier_id: supplierId, order_id: null, return_of: null,
      warehouse_id: main.id, subtotal, discount: 0, delivery_fee: 0, total: subtotal, paid, due: subtotal - paid, cost_total: subtotal,
      note: null, cash_session_id: null, created_by: 'demo-keeper', created_at: created, voided_at: null, voided_by: null, void_reason: null,
    });
    if (paid > 0) {
      db.payments.push({
        id: demoId(), number: nextDocNumber(db, 'voucher'), direction: 'out', method: 'cash', amount: paid, customer_id: null, supplier_id: supplierId,
        invoice_id: id, order_id: null, cash_session_id: null, reference: null, note: 'دفعة عند الاستلام', created_by: 'demo-keeper', created_at: created, voided_at: null,
      });
    }
    for (const e of events) if (e.ref_id === key) e.ref_id = id;
  };
  makeInvoice('inv-a', s1.id, purchaseA, 21, 0.6);
  makeInvoice('inv-b', s2.id, purchaseB, 9, 0);

  // الحركات بالترتيب الزمني مع الرصيد بعد كل حركة
  events.sort((a, b) => a.created_at.localeCompare(b.created_at));
  const bal = new Map<string, number>();
  for (const e of events) {
    const k = `${e.variant_id}|${e.warehouse_id}`;
    const b = (bal.get(k) ?? 0) + e.qty;
    bal.set(k, b);
    db.stock_movements.push({ ...e, id: ++movementSeq, balance_after: b });
  }
}

export function nextDocNumber(db: DemoDb, kind: DocKind): string {
  const n = (db.doc_counters[kind] ?? 0) + 1;
  db.doc_counters[kind] = n;
  return formatDocNumber(kind, n);
}

const sellable = (db: DemoDb) => new Set(db.warehouses.filter((w) => w.is_sellable && w.is_active).map((w) => w.id));

/** available_qty = مجموع (الكمية − المحجوز) في المخازن القابلة للبيع */
export function demoRecomputeAvailable(db: DemoDb, variantId: string) {
  const ok = sellable(db);
  const v = db.product_variants.find((x) => x.id === variantId);
  if (!v) return;
  v.available_qty = db.stock_levels.filter((l) => l.variant_id === variantId && ok.has(l.warehouse_id)).reduce((s, l) => s + l.qty - l.reserved, 0);
  v.updated_at = new Date().toISOString();
}

export function demoRecomputeAll(db: DemoDb) {
  for (const v of db.product_variants) demoRecomputeAvailable(db, v.id);
}

export interface DemoMovementInput {
  variant_id: string;
  warehouse_id: string;
  qty: number;
  kind: MovementKind;
  unit_cost?: number | null;
  ref_type?: StockMovement['ref_type'];
  ref_id?: string | null;
  note?: string | null;
}

/** محاكاة private.apply_movement */
export function demoApplyMovement(db: DemoDb, m: DemoMovementInput): StockMovement {
  let lvl = db.stock_levels.find((l) => l.variant_id === m.variant_id && l.warehouse_id === m.warehouse_id);
  const now = new Date().toISOString();
  if (!lvl) {
    lvl = { variant_id: m.variant_id, warehouse_id: m.warehouse_id, qty: 0, reserved: 0, updated_at: now };
    db.stock_levels.push(lvl);
  }
  const next = lvl.qty + m.qty;
  const allowNegative = (db.settings.inventory as InventorySettings | undefined)?.allow_negative_stock ?? false;
  if (m.qty < 0 && next < 0 && !allowNegative) {
    const v = db.product_variants.find((x) => x.id === m.variant_id);
    const p = db.products.find((x) => x.id === v?.product_id);
    const wh = db.warehouses.find((w) => w.id === m.warehouse_id);
    throw new AppError(`الكمية غير كافية من «${p?.name ?? ''}${v && v.title !== 'افتراضي' ? ` — ${v.title}` : ''}» في ${wh?.name ?? 'المخزن'}. المتوفر ${formatQty(lvl.qty)} فقط.`);
  }
  // متوسط التكلفة المرجّح عند الشراء والرصيد الافتتاحي
  if ((m.kind === 'purchase' || m.kind === 'opening') && m.qty > 0 && m.unit_cost !== null && m.unit_cost !== undefined) {
    const totalBefore = db.stock_levels.filter((l) => l.variant_id === m.variant_id).reduce((s, l) => s + l.qty, 0);
    let c = db.variant_costs.find((x) => x.variant_id === m.variant_id);
    if (!c) {
      c = { variant_id: m.variant_id, avg_cost: m.unit_cost, last_cost: m.unit_cost, updated_at: now };
      db.variant_costs.push(c);
    } else {
      c.avg_cost = weightedAvgCost(totalBefore, c.avg_cost, m.qty, m.unit_cost);
      c.last_cost = m.unit_cost;
      c.updated_at = now;
    }
  }
  lvl.qty = next;
  lvl.updated_at = now;
  const mv: StockMovement = {
    id: ++movementSeq, variant_id: m.variant_id, warehouse_id: m.warehouse_id, kind: m.kind, qty: m.qty, balance_after: next,
    unit_cost: m.unit_cost ?? db.variant_costs.find((x) => x.variant_id === m.variant_id)?.avg_cost ?? null,
    ref_type: m.ref_type ?? null, ref_id: m.ref_id ?? null, note: m.note ?? null, created_by: DEMO_USER, created_at: now,
  };
  db.stock_movements.push(mv);
  demoRecomputeAvailable(db, m.variant_id);
  return mv;
}

/** الكتابة الجماعية «كلها أو لا شيء»: تنسخ الجداول المتأثرة وتعيدها عند أي خطأ (مثل معاملة Postgres) */
export function demoTransaction<T>(db: DemoDb, fn: () => T): T {
  const snap = {
    stock_levels: db.stock_levels.map((l) => ({ ...l })),
    stock_movements: db.stock_movements.length,
    variant_costs: db.variant_costs.map((c) => ({ ...c })),
    available: db.product_variants.map((v) => v.available_qty),
    seq: movementSeq,
  };
  try {
    return fn();
  } catch (e) {
    db.stock_levels.splice(0, db.stock_levels.length, ...snap.stock_levels);
    db.stock_movements.length = snap.stock_movements;
    db.variant_costs.splice(0, db.variant_costs.length, ...snap.variant_costs);
    db.product_variants.forEach((v, i) => { if (snap.available[i] !== undefined) v.available_qty = snap.available[i]; });
    movementSeq = snap.seq;
    throw e;
  }
}

export const demoNow = () => new Date().toISOString();
