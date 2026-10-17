/**
 * بيانات المخزون والمخازن والحركات والجرد والنقل والمشتريات والموردين.
 * كل دالة تفرّع بين وضع العرض (demo.ts) وSupabase. الكتابة على الرصيد دائماً عبر دوال RPC (system/06-database.md).
 *
 * ما نرسله لكل دالة RPC (حرفياً):
 *   adjust_stock(p)      p = {variant_id, warehouse_id, mode:'set'|'delta', qty, kind:'adjustment'|'damage'|'opening', note}
 *   transfer_stock(p)    p = {from_warehouse_id, to_warehouse_id, items:[{variant_id, qty}], note}          ← يعيد {transfer_id, number}
 *   create_stocktake(warehouse_id, note)                                                                   ← يعيد uuid أو {id}
 *   set_stocktake_count(id, variant_id, counted)   counted = null يمسح العدّ
 *   apply_stocktake(id)
 *   post_purchase(p)     p = {supplier_id, warehouse_id, currency:'IQD'|'USD', exchange_rate,
 *                             items:[{variant_id, qty, unit_cost, serials?, lot_code?, expiry_date?}],   // unit_cost بعملة الفاتورة، qty بالقطع
 *                             discount?, payments?:[{method, amount, account_id?, reference?}], note?}  ← يعيد {invoice_id, number}
 *   record_payment(p)    p = {direction:'out', method, amount, currency, exchange_rate, account_id, supplier_id, invoice_id?, reference?, note?}
 *                        ← يعيد {payment_id, number}
 *   post_stock_voucher(p) p = {kind:'in'|'out'|'sample_out'|'sample_return'|'damage', warehouse_id, customer_id?, reason, note?,
 *                             items:[{variant_id, qty, unit_cost?, lot_code?, expiry_date?}]}           ← يعيد {voucher_id, number}
 *   low_stock(lim) · stagnant_products(days, lim) · inventory_valuation() · near_expiry(days, lim) · supplier_statement(supplier_id, from, to)
 */
import {
  normalizeArabic, tokens,
  type Branch, type CurrencyCode,
  type Invoice, type InvoiceItem, type LowStockRow, type MovementKind, type Payment, type PaymentMethod, type Product, type ProductVariant,
  type StockLevel, type StockMovement, type Stocktake, type StocktakeItem, type Supplier, type SupplierBalance, type Transfer, type Warehouse,
} from '@raqeem/shared';
import { IS_DEMO } from '../../lib/env';
import { demoDelay, demoId } from '../../lib/demo-db';
import { AppError, rpc, sb } from '../../lib/supabase';
import { DEMO_STAFF, ddb, demoApplyMovement, demoBranchOf, demoNow, demoRecomputeAll, demoTransaction, nextDocNumber, type DemoDb } from './demo';

export const like = (s: string) => `%${s.replace(/[%_,()]/g, ' ').trim()}%`;
export const vTitle = (t: string | null | undefined) => (t && t !== 'افتراضي' ? t : null);

// ------------------------------------------------------------------ المخازن

export async function listWarehouses(includeInactive = false): Promise<Warehouse[]> {
  if (IS_DEMO) {
    await demoDelay(60);
    return structuredClone(ddb().warehouses).filter((w) => includeInactive || w.is_active).sort((a, b) => Number(b.is_default) - Number(a.is_default) || a.name.localeCompare(b.name, 'ar'));
  }
  let qb = sb().from('warehouses').select('*').order('is_default', { ascending: false }).order('name');
  if (!includeInactive) qb = qb.eq('is_active', true);
  const { data, error } = await qb;
  if (error) throw error;
  return (data ?? []) as Warehouse[];
}

export type WarehouseDraft = Pick<Warehouse, 'name' | 'code' | 'branch_id' | 'address' | 'is_sellable' | 'is_active'> & { id?: string };

export async function listBranches(): Promise<Branch[]> {
  if (IS_DEMO) return structuredClone(ddb().branches).filter((b) => b.is_active);
  const { data, error } = await sb().from('branches').select('*').eq('is_active', true).order('is_default', { ascending: false }).order('name');
  if (error) throw error;
  return (data ?? []) as Branch[];
}

export async function saveWarehouse(w: WarehouseDraft): Promise<Warehouse> {
  const name = w.name.trim();
  const code = w.code.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
  if (!name) throw new AppError('اكتب اسم المخزن.');
  if (!code) throw new AppError('اكتب رمزاً قصيراً بالإنكليزية للمخزن (مثل MAIN).');
  if (IS_DEMO) {
    await demoDelay(150);
    const db = ddb();
    if (db.warehouses.some((x) => x.code === code && x.id !== w.id)) throw new AppError(`الرمز ${code} مستخدم لمخزن آخر.`);
    if (w.id) {
      const cur = db.warehouses.find((x) => x.id === w.id);
      if (!cur) throw new AppError('لم نجد هذا المخزن.');
      if (cur.is_default && !w.is_active) throw new AppError('لا يمكن تعطيل المخزن الافتراضي. اجعل مخزناً آخر افتراضياً أولاً.');
      Object.assign(cur, { name, code, branch_id: w.branch_id, address: w.address, is_sellable: w.is_sellable, is_active: w.is_active });
      demoRecomputeAll(db);
      return structuredClone(cur);
    }
    const row: Warehouse = { id: demoId(), name, code, branch_id: w.branch_id, address: w.address, is_default: false, is_sellable: w.is_sellable, is_active: w.is_active, created_at: demoNow() };
    db.warehouses.push(row);
    return structuredClone(row);
  }
  const body = { name, code, branch_id: w.branch_id, address: w.address, is_sellable: w.is_sellable, is_active: w.is_active };
  const res = w.id ? await sb().from('warehouses').update(body).eq('id', w.id).select().single() : await sb().from('warehouses').insert(body).select().single();
  if (res.error) throw res.error;
  return res.data as Warehouse;
}

export async function setDefaultWarehouse(id: string): Promise<void> {
  if (IS_DEMO) {
    await demoDelay(120);
    for (const w of ddb().warehouses) w.is_default = w.id === id;
    return;
  }
  // فهرس فريد جزئي على is_default: نلغي القديم أولاً
  const off = await sb().from('warehouses').update({ is_default: false }).eq('is_default', true).neq('id', id);
  if (off.error) throw off.error;
  const on = await sb().from('warehouses').update({ is_default: true, is_active: true }).eq('id', id);
  if (on.error) throw on.error;
}

/** عدد القطع والنسخ في كل مخزن */
export async function warehouseUnits(): Promise<Record<string, { units: number; items: number }>> {
  const tally = (rows: { warehouse_id: string; qty: number }[]) => {
    const out: Record<string, { units: number; items: number }> = {};
    for (const r of rows) {
      const o = (out[r.warehouse_id] ??= { units: 0, items: 0 });
      if (r.qty !== 0) { o.units += Number(r.qty); o.items += 1; }
    }
    return out;
  };
  if (IS_DEMO) return tally(ddb().stock_levels);
  const { data, error } = await sb().from('stock_levels').select('warehouse_id,qty').neq('qty', 0).limit(50000);
  if (error) throw error;
  return tally((data ?? []) as { warehouse_id: string; qty: number }[]);
}

// ------------------------------------------------------------------ الأرصدة

export interface StockRow {
  variant_id: string;
  warehouse_id: string;
  qty: number;
  reserved: number;
  available: number;
  product_id: string;
  name: string;
  variant_title: string | null;
  sku: string;
  barcode: string | null;
  price: number;
  min_stock: number;
  cover_key: string | null;
  avg_cost: number | null;
}

export interface StockQuery { q: string; warehouse_id: string; nonZero: boolean; page: number; pageSize: number; withCost: boolean }

export async function listStock(f: StockQuery): Promise<{ rows: StockRow[]; total: number }> {
  const from = (f.page - 1) * f.pageSize;
  if (IS_DEMO) {
    await demoDelay();
    const db = ddb();
    const toks = tokens(f.q);
    const rows: StockRow[] = [];
    for (const l of db.stock_levels) {
      if (f.warehouse_id && l.warehouse_id !== f.warehouse_id) continue;
      if (f.nonZero && l.qty === 0 && l.reserved === 0) continue;
      const v = db.product_variants.find((x) => x.id === l.variant_id);
      const p = v && db.products.find((x) => x.id === v.product_id);
      if (!v || !p || p.archived_at) continue;
      if (toks.length) {
        const hay = normalizeArabic(`${p.name} ${v.title} ${v.sku}`);
        if (!(v.barcode === f.q.trim() || toks.every((t) => hay.includes(t)))) continue;
      }
      rows.push(stockRow(l, v, p, f.withCost ? db.variant_costs.find((c) => c.variant_id === v.id)?.avg_cost ?? 0 : null));
    }
    rows.sort((a, b) => a.name.localeCompare(b.name, 'ar') || a.sku.localeCompare(b.sku));
    return { rows: rows.slice(from, from + f.pageSize), total: rows.length };
  }
  let qb = sb().from('stock_levels')
    .select('variant_id,warehouse_id,qty,reserved,product_variants!inner(id,product_id,title,sku,barcode,price,min_stock,products!inner(name,cover_key,archived_at))', { count: 'exact' })
    .is('product_variants.products.archived_at', null);
  if (f.warehouse_id) qb = qb.eq('warehouse_id', f.warehouse_id);
  if (f.nonZero) qb = qb.or('qty.neq.0,reserved.neq.0');
  const q = f.q.trim();
  if (/^\d{8,14}$/.test(q)) qb = qb.eq('product_variants.barcode', q);
  else for (const t of tokens(q)) qb = qb.ilike('product_variants.products.search_text', like(t));
  const { data, error, count } = await qb.order('variant_id').order('warehouse_id').range(from, from + f.pageSize - 1);
  if (error) throw error;
  type Row = StockLevel & { product_variants: ProductVariant & { products: Pick<Product, 'name' | 'cover_key'> } };
  const raw = (data ?? []) as unknown as Row[];
  const costs = f.withCost ? await costsOf(raw.map((r) => r.variant_id)) : null;
  return {
    rows: raw.map((r) => stockRow(r, r.product_variants, { id: r.product_variants.product_id, ...r.product_variants.products }, costs ? costs[r.variant_id] ?? 0 : null)),
    total: count ?? raw.length,
  };
}

function stockRow(l: Pick<StockLevel, 'variant_id' | 'warehouse_id' | 'qty' | 'reserved'>, v: Pick<ProductVariant, 'title' | 'sku' | 'barcode' | 'price' | 'min_stock' | 'product_id'>, p: Pick<Product, 'id' | 'name' | 'cover_key'>, cost: number | null): StockRow {
  const qty = Number(l.qty), reserved = Number(l.reserved);
  return {
    variant_id: l.variant_id, warehouse_id: l.warehouse_id, qty, reserved, available: qty - reserved, product_id: p.id, name: p.name, variant_title: vTitle(v.title),
    sku: v.sku, barcode: v.barcode, price: Number(v.price), min_stock: Number(v.min_stock), cover_key: p.cover_key, avg_cost: cost,
  };
}

export async function costsOf(variantIds: string[]): Promise<Record<string, number>> {
  if (!variantIds.length) return {};
  if (IS_DEMO) return Object.fromEntries(ddb().variant_costs.filter((c) => variantIds.includes(c.variant_id)).map((c) => [c.variant_id, c.avg_cost]));
  const { data } = await sb().from('variant_costs').select('variant_id,avg_cost,last_cost').in('variant_id', [...new Set(variantIds)]);
  return Object.fromEntries((data ?? []).map((c) => [c.variant_id as string, Number(c.avg_cost)]));
}

/** آخر تكلفة شراء لكل نسخة (اقتراح في فاتورة الشراء) */
export async function lastCostsOf(variantIds: string[]): Promise<Record<string, number>> {
  if (!variantIds.length) return {};
  if (IS_DEMO) return Object.fromEntries(ddb().variant_costs.filter((c) => variantIds.includes(c.variant_id)).map((c) => [c.variant_id, c.last_cost]));
  const { data } = await sb().from('variant_costs').select('variant_id,last_cost').in('variant_id', [...new Set(variantIds)]);
  return Object.fromEntries((data ?? []).map((c) => [c.variant_id as string, Number(c.last_cost)]));
}

export interface StockTotals { items: number; units: number; cost_value: number | null; retail_value: number | null }

/** ملخص قيمة المخزون (بالتكلفة يحتاج costs.view) */
export async function stockTotals(warehouseId: string, withCost: boolean): Promise<StockTotals> {
  if (IS_DEMO) {
    await demoDelay(80);
    const db = ddb();
    let items = 0, units = 0, cost = 0, retail = 0;
    for (const l of db.stock_levels) {
      if (warehouseId && l.warehouse_id !== warehouseId) continue;
      if (l.qty <= 0) continue;
      const v = db.product_variants.find((x) => x.id === l.variant_id);
      if (!v) continue;
      items += 1; units += l.qty; retail += l.qty * v.price;
      cost += l.qty * (db.variant_costs.find((c) => c.variant_id === v.id)?.avg_cost ?? 0);
    }
    return { items, units, cost_value: withCost ? cost : null, retail_value: retail };
  }
  if (withCost) {
    const rows = await rpc<{ warehouse_id: string; items: number; units: number; cost_value: number; retail_value: number }[]>('inventory_valuation');
    const pick = rows.filter((r) => !warehouseId || r.warehouse_id === warehouseId);
    return pick.reduce<StockTotals>((s, r) => ({ items: s.items + Number(r.items), units: s.units + Number(r.units), cost_value: (s.cost_value ?? 0) + Number(r.cost_value), retail_value: (s.retail_value ?? 0) + Number(r.retail_value) }), { items: 0, units: 0, cost_value: 0, retail_value: 0 });
  }
  let qb = sb().from('stock_levels').select('qty').gt('qty', 0).limit(50000);
  if (warehouseId) qb = qb.eq('warehouse_id', warehouseId);
  const { data, error } = await qb;
  if (error) throw error;
  const list = (data ?? []) as { qty: number }[];
  return { items: list.length, units: list.reduce((s, r) => s + Number(r.qty), 0), cost_value: null, retail_value: null };
}

export async function listLowStock(): Promise<LowStockRow[]> {
  if (IS_DEMO) {
    await demoDelay();
    const db = ddb();
    return db.product_variants.filter((v) => v.is_active && v.available_qty <= v.min_stock).flatMap((v) => {
      const p = db.products.find((x) => x.id === v.product_id);
      return p && !p.archived_at ? [{ variant_id: v.id, product_id: p.id, name: p.name, variant_title: vTitle(v.title), sku: v.sku, qty: v.available_qty, min_stock: v.min_stock }] : [];
    }).sort((a, b) => a.qty - b.qty);
  }
  return rpc<LowStockRow[]>('low_stock', { lim: 500 });
}

export interface StagnantRow { variant_id: string; product_id: string; name: string; variant_title: string | null; sku: string; qty: number; last_sale_at: string | null; value: number | null }

export async function listStagnant(days: number, withCost: boolean): Promise<StagnantRow[]> {
  if (IS_DEMO) {
    await demoDelay();
    const db = ddb();
    const since = Date.now() - days * 86_400_000;
    const out: StagnantRow[] = [];
    for (const v of db.product_variants) {
      const qty = db.stock_levels.filter((l) => l.variant_id === v.id).reduce((s, l) => s + l.qty, 0);
      if (qty <= 0) continue;
      const sales = db.stock_movements.filter((m) => m.variant_id === v.id && m.kind === 'sale');
      const last = sales.reduce<string | null>((m, x) => (!m || x.created_at > m ? x.created_at : m), null);
      if (last && Date.parse(last) >= since) continue;
      const p = db.products.find((x) => x.id === v.product_id);
      if (!p || p.archived_at) continue;
      const cost = db.variant_costs.find((c) => c.variant_id === v.id)?.avg_cost ?? 0;
      out.push({ variant_id: v.id, product_id: p.id, name: p.name, variant_title: vTitle(v.title), sku: v.sku, qty, last_sale_at: last, value: withCost ? qty * cost : null });
    }
    return out.sort((a, b) => (a.last_sale_at ?? '').localeCompare(b.last_sale_at ?? ''));
  }
  // شكل الصف من الخادم قد يختلف قليلاً؛ نوحّده هنا
  const rows = await rpc<Record<string, unknown>[]>('stagnant_products', { days, lim: 300 });
  return rows.map((r) => ({
    variant_id: String(r.variant_id ?? ''), product_id: String(r.product_id ?? ''), name: String(r.name ?? ''), variant_title: vTitle(r.variant_title as string | null),
    sku: String(r.sku ?? ''), qty: Number(r.qty ?? 0), last_sale_at: (r.last_sold_at as string | null) ?? null,
    value: withCost && r.cost_value !== undefined ? Number(r.cost_value) : null,
  }));
}

// ------------------------------------------------------------------ تعديل المخزون

export interface AdjustPayload {
  variant_id: string;
  warehouse_id: string;
  mode: 'set' | 'delta';
  qty: number;
  kind: 'adjustment' | 'damage' | 'opening';
  note: string;
  unit_cost?: number;
  lot_code?: string;
  expiry_date?: string;
}

export async function adjustStock(p: AdjustPayload): Promise<void> {
  if (!p.note.trim()) throw new AppError('اكتب سبب التعديل.');
  if (!IS_DEMO) { await rpc('adjust_stock', { p }); return; }
  await demoDelay(200);
  const db = ddb();
  const cur = db.stock_levels.find((l) => l.variant_id === p.variant_id && l.warehouse_id === p.warehouse_id)?.qty ?? 0;
  const delta = p.mode === 'set' ? p.qty - cur : p.kind === 'damage' ? -Math.abs(p.qty) : p.qty;
  if (delta === 0) throw new AppError('الكمية الجديدة تساوي الرصيد الحالي، فلا شيء لتعديله.');
  demoTransaction(db, () => demoApplyMovement(db, { variant_id: p.variant_id, warehouse_id: p.warehouse_id, qty: delta, kind: p.kind, ref_type: 'adjustment', note: p.note.trim(), unit_cost: p.unit_cost ?? null, lot_code: p.lot_code ?? null, expiry_date: p.expiry_date ?? null }));
}

/** رصيد نسخة في مخزن (للنافذة السريعة) */
export async function levelOf(variantId: string, warehouseId: string): Promise<{ qty: number; reserved: number }> {
  if (IS_DEMO) {
    const l = ddb().stock_levels.find((x) => x.variant_id === variantId && x.warehouse_id === warehouseId);
    return { qty: l?.qty ?? 0, reserved: l?.reserved ?? 0 };
  }
  const { data } = await sb().from('stock_levels').select('qty,reserved').eq('variant_id', variantId).eq('warehouse_id', warehouseId).maybeSingle();
  return { qty: Number(data?.qty ?? 0), reserved: Number(data?.reserved ?? 0) };
}

/** أرصدة عدة نسخ في مخزن واحد */
export async function levelsIn(warehouseId: string, variantIds: string[]): Promise<Record<string, { qty: number; reserved: number }>> {
  if (!variantIds.length || !warehouseId) return {};
  if (IS_DEMO) {
    return Object.fromEntries(ddb().stock_levels.filter((l) => l.warehouse_id === warehouseId && variantIds.includes(l.variant_id)).map((l) => [l.variant_id, { qty: l.qty, reserved: l.reserved }]));
  }
  const { data, error } = await sb().from('stock_levels').select('variant_id,qty,reserved').eq('warehouse_id', warehouseId).in('variant_id', [...new Set(variantIds)]);
  if (error) throw error;
  return Object.fromEntries((data ?? []).map((l) => [l.variant_id as string, { qty: Number(l.qty), reserved: Number(l.reserved) }]));
}

// ------------------------------------------------------------------ الحركات

export interface MovementRow extends StockMovement { name: string; variant_title: string | null; sku: string; product_id: string; warehouse_name: string; staff_name: string | null }

export interface MovementQuery {
  variant_ids: string[] | null;
  warehouse_id: string;
  kind: MovementKind | '';
  from: string; // YYYY-MM-DD بتوقيت بغداد
  to: string;
  staff_id: string;
  page: number;
  pageSize: number;
}

/** حدود اليوم بتوقيت بغداد (UTC+3) */
const dayStart = (d: string) => new Date(`${d}T00:00:00+03:00`).toISOString();
const dayEnd = (d: string) => new Date(`${d}T23:59:59.999+03:00`).toISOString();

export async function listMovements(f: MovementQuery): Promise<{ rows: MovementRow[]; total: number }> {
  const from = (f.page - 1) * f.pageSize;
  if (IS_DEMO) {
    await demoDelay();
    const db = ddb();
    const list = db.stock_movements.filter((m) =>
      (!f.variant_ids || f.variant_ids.includes(m.variant_id)) && (!f.warehouse_id || m.warehouse_id === f.warehouse_id) && (!f.kind || m.kind === f.kind)
      && (!f.from || m.created_at >= dayStart(f.from)) && (!f.to || m.created_at <= dayEnd(f.to)) && (!f.staff_id || m.created_by === f.staff_id),
    ).sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id);
    return { rows: list.slice(from, from + f.pageSize).map((m) => demoMovementRow(db, m)), total: list.length };
  }
  let qb = sb().from('stock_movements').select('*, product_variants(title,sku,product_id,products(name)), warehouses(name)', { count: 'exact' });
  if (f.variant_ids) qb = qb.in('variant_id', f.variant_ids.length ? f.variant_ids : ['00000000-0000-0000-0000-000000000000']);
  if (f.warehouse_id) qb = qb.eq('warehouse_id', f.warehouse_id);
  if (f.kind) qb = qb.eq('kind', f.kind);
  if (f.from) qb = qb.gte('created_at', dayStart(f.from));
  if (f.to) qb = qb.lte('created_at', dayEnd(f.to));
  if (f.staff_id) qb = qb.eq('created_by', f.staff_id);
  const { data, error, count } = await qb.order('created_at', { ascending: false }).order('id', { ascending: false }).range(from, from + f.pageSize - 1);
  if (error) throw error;
  const staff = await staffMap();
  type Row = StockMovement & { product_variants: { title: string; sku: string; product_id: string; products: { name: string } | null } | null; warehouses: { name: string } | null };
  return {
    rows: ((data ?? []) as unknown as Row[]).map(({ product_variants: v, warehouses: w, ...m }) => ({
      ...m, qty: Number(m.qty), balance_after: Number(m.balance_after), name: v?.products?.name ?? '', variant_title: vTitle(v?.title), sku: v?.sku ?? '', product_id: v?.product_id ?? '',
      warehouse_name: w?.name ?? '', staff_name: m.created_by ? staff[m.created_by] ?? null : null,
    })),
    total: count ?? 0,
  };
}

function demoMovementRow(db: DemoDb, m: StockMovement): MovementRow {
  const v = db.product_variants.find((x) => x.id === m.variant_id);
  const p = db.products.find((x) => x.id === v?.product_id);
  return {
    ...m, name: p?.name ?? '', variant_title: vTitle(v?.title), sku: v?.sku ?? '', product_id: p?.id ?? '',
    warehouse_name: db.warehouses.find((w) => w.id === m.warehouse_id)?.name ?? '', staff_name: DEMO_STAFF.find((s) => s.id === m.created_by)?.full_name ?? null,
  };
}

let staffCache: Record<string, string> | null = null;
export async function staffMap(): Promise<Record<string, string>> {
  if (staffCache) return staffCache;
  const list = await listStaff().catch(() => []);
  staffCache = Object.fromEntries(list.map((s) => [s.id, s.full_name]));
  return staffCache;
}

/** الموظفون (لفلتر «الموظف») — قد لا يُسمح بقراءتهم لبعض الأدوار فتعود القائمة فارغة */
export async function listStaff(): Promise<{ id: string; full_name: string }[]> {
  if (IS_DEMO) return DEMO_STAFF;
  const { data, error } = await sb().from('profiles').select('id,full_name,email').eq('kind', 'staff').order('full_name');
  if (error) return [];
  return (data ?? []).map((p) => ({ id: p.id as string, full_name: (p.full_name as string | null) ?? (p.email as string | null) ?? 'موظف' }));
}

/** رصيد منتج في كل مخزن + آخر ٢٠ حركة (تبويب المخزون في نموذج المنتج) */
export async function productStock(variantIds: string[]): Promise<{ levels: (StockLevel & { warehouse_name: string })[]; movements: MovementRow[] }> {
  if (!variantIds.length) return { levels: [], movements: [] };
  if (IS_DEMO) {
    await demoDelay(120);
    const db = ddb();
    return {
      levels: db.stock_levels.filter((l) => variantIds.includes(l.variant_id)).map((l) => ({ ...l, warehouse_name: db.warehouses.find((w) => w.id === l.warehouse_id)?.name ?? '' })),
      movements: db.stock_movements.filter((m) => variantIds.includes(m.variant_id)).sort((a, b) => b.created_at.localeCompare(a.created_at) || b.id - a.id).slice(0, 20).map((m) => demoMovementRow(db, m)),
    };
  }
  const [lv, mv] = await Promise.all([
    sb().from('stock_levels').select('*, warehouses(name)').in('variant_id', variantIds),
    listMovements({ variant_ids: variantIds, warehouse_id: '', kind: '', from: '', to: '', staff_id: '', page: 1, pageSize: 20 }),
  ]);
  if (lv.error) throw lv.error;
  return {
    levels: ((lv.data ?? []) as (StockLevel & { warehouses: { name: string } | null })[]).map(({ warehouses, ...l }) => ({ ...l, qty: Number(l.qty), reserved: Number(l.reserved), warehouse_name: warehouses?.name ?? '' })),
    movements: mv.rows,
  };
}

// ------------------------------------------------------------------ النقل بين المخازن

export interface TransferRow extends Transfer { from_name: string; to_name: string; lines: number; units: number; staff_name: string | null }
export interface TransferLine { variant_id: string; qty: number; name: string; variant_title: string | null; sku: string }

export async function listTransfers(page: number, pageSize: number): Promise<{ rows: TransferRow[]; total: number }> {
  const from = (page - 1) * pageSize;
  if (IS_DEMO) {
    await demoDelay();
    const db = ddb();
    const list = [...db.transfers].sort((a, b) => b.created_at.localeCompare(a.created_at));
    return {
      rows: list.slice(from, from + pageSize).map((t) => {
        const items = db.transfer_items.filter((i) => i.transfer_id === t.id);
        return { ...t, from_name: db.warehouses.find((w) => w.id === t.from_warehouse_id)?.name ?? '', to_name: db.warehouses.find((w) => w.id === t.to_warehouse_id)?.name ?? '', lines: items.length, units: items.reduce((s, i) => s + i.qty, 0), staff_name: DEMO_STAFF.find((s) => s.id === t.created_by)?.full_name ?? null };
      }),
      total: list.length,
    };
  }
  const { data, error, count } = await sb().from('transfers').select('*, from:warehouses!transfers_from_warehouse_id_fkey(name), to:warehouses!transfers_to_warehouse_id_fkey(name), transfer_items(qty)', { count: 'exact' })
    .order('created_at', { ascending: false }).range(from, from + pageSize - 1);
  if (error) throw error;
  const staff = await staffMap();
  type Row = Transfer & { from: { name: string } | null; to: { name: string } | null; transfer_items: { qty: number }[] };
  return {
    rows: ((data ?? []) as unknown as Row[]).map(({ from: f, to, transfer_items, ...t }) => ({
      ...t, from_name: f?.name ?? '', to_name: to?.name ?? '', lines: transfer_items.length, units: transfer_items.reduce((s, i) => s + Number(i.qty), 0), staff_name: t.created_by ? staff[t.created_by] ?? null : null,
    })),
    total: count ?? 0,
  };
}

export async function transferLines(id: string): Promise<TransferLine[]> {
  if (IS_DEMO) {
    await demoDelay(80);
    const db = ddb();
    return db.transfer_items.filter((i) => i.transfer_id === id).map((i) => {
      const v = db.product_variants.find((x) => x.id === i.variant_id);
      return { variant_id: i.variant_id, qty: i.qty, name: db.products.find((p) => p.id === v?.product_id)?.name ?? '', variant_title: vTitle(v?.title), sku: v?.sku ?? '' };
    });
  }
  const { data, error } = await sb().from('transfer_items').select('variant_id,qty,product_variants(title,sku,products(name))').eq('transfer_id', id);
  if (error) throw error;
  return ((data ?? []) as unknown as { variant_id: string; qty: number; product_variants: { title: string; sku: string; products: { name: string } | null } | null }[]).map((r) => ({
    variant_id: r.variant_id, qty: Number(r.qty), name: r.product_variants?.products?.name ?? '', variant_title: vTitle(r.product_variants?.title), sku: r.product_variants?.sku ?? '',
  }));
}

export interface TransferPayload { from_warehouse_id: string; to_warehouse_id: string; items: { variant_id: string; qty: number; serials?: string[] }[]; note: string | null }

export async function transferStock(p: TransferPayload): Promise<{ transfer_id: string; number: string }> {
  if (p.from_warehouse_id === p.to_warehouse_id) throw new AppError('اختر مخزنين مختلفين.');
  if (!p.items.length) throw new AppError('أضف منتجاً واحداً على الأقل.');
  if (!IS_DEMO) return rpc('transfer_stock', { p });
  await demoDelay(250);
  const db = ddb();
  return demoTransaction(db, () => {
    const id = demoId();
    const number = nextDocNumber(db, 'transfer');
    for (const it of p.items) {
      const lvl = db.stock_levels.find((l) => l.variant_id === it.variant_id && l.warehouse_id === p.from_warehouse_id);
      if (!lvl || lvl.qty - lvl.reserved < it.qty) {
        const v = db.product_variants.find((x) => x.id === it.variant_id);
        throw new AppError(`الكمية المتاحة من «${db.products.find((x) => x.id === v?.product_id)?.name ?? ''}» لا تكفي للنقل.`);
      }
      const slices = demoApplyMovement(db, { variant_id: it.variant_id, warehouse_id: p.from_warehouse_id, qty: -it.qty, kind: 'transfer_out', ref_type: 'transfer', ref_id: id, note: number });
      // الدفعات تنتقل بتواريخها (لا تضيع الصلاحية بالنقل)
      if (slices.length) for (const sl of slices) demoApplyMovement(db, { variant_id: it.variant_id, warehouse_id: p.to_warehouse_id, qty: sl.qty, kind: 'transfer_in', ref_type: 'transfer', ref_id: id, note: number, lot_code: sl.lot_code, expiry_date: sl.expiry_date });
      else demoApplyMovement(db, { variant_id: it.variant_id, warehouse_id: p.to_warehouse_id, qty: it.qty, kind: 'transfer_in', ref_type: 'transfer', ref_id: id, note: number });
      db.transfer_items.push({ transfer_id: id, variant_id: it.variant_id, qty: it.qty });
    }
    db.transfers.push({ id, number, from_warehouse_id: p.from_warehouse_id, to_warehouse_id: p.to_warehouse_id, note: p.note, created_by: 'demo-owner', created_at: demoNow() });
    return { transfer_id: id, number };
  });
}

// ------------------------------------------------------------------ الجرد

export interface StocktakeRow extends Stocktake { warehouse_name: string; counted: number; staff_name: string | null }

export async function listStocktakes(): Promise<StocktakeRow[]> {
  if (IS_DEMO) {
    await demoDelay();
    const db = ddb();
    return [...db.stocktakes].sort((a, b) => b.created_at.localeCompare(a.created_at)).map((s) => ({
      ...s, warehouse_name: db.warehouses.find((w) => w.id === s.warehouse_id)?.name ?? '', counted: db.stocktake_items.filter((i) => i.stocktake_id === s.id && i.counted_qty !== null).length,
      staff_name: DEMO_STAFF.find((x) => x.id === s.created_by)?.full_name ?? null,
    }));
  }
  const { data, error } = await sb().from('stocktakes').select('*, warehouses(name), stocktake_items(counted_qty)').order('created_at', { ascending: false }).limit(200);
  if (error) throw error;
  const staff = await staffMap();
  return ((data ?? []) as unknown as (Stocktake & { warehouses: { name: string } | null; stocktake_items: { counted_qty: number | null }[] })[]).map(({ warehouses, stocktake_items, ...s }) => ({
    ...s, warehouse_name: warehouses?.name ?? '', counted: stocktake_items.filter((i) => i.counted_qty !== null).length, staff_name: s.created_by ? staff[s.created_by] ?? null : null,
  }));
}

export async function createStocktake(warehouseId: string, note: string | null): Promise<string> {
  if (!IS_DEMO) {
    const r = await rpc<string | { id: string }>('create_stocktake', { warehouse_id: warehouseId, note });
    return typeof r === 'string' ? r : r.id;
  }
  await demoDelay(200);
  const db = ddb();
  if (db.stocktakes.some((s) => s.warehouse_id === warehouseId && s.status === 'draft')) throw new AppError('يوجد جرد مفتوح لهذا المخزن. أكمله أو اعتمده أولاً.');
  const id = demoId();
  db.stocktakes.push({ id, number: nextDocNumber(db, 'stocktake'), warehouse_id: warehouseId, status: 'draft', note, created_by: 'demo-owner', created_at: demoNow(), applied_at: null });
  return id;
}

/** سطر في شاشة الجرد: كل نسخة في نطاق الجرد مع عدّها إن وُجد */
export interface CountLine {
  variant_id: string;
  product_id: string;
  category_id: string | null;
  name: string;
  variant_title: string | null;
  sku: string;
  barcode: string | null;
  expected: number;
  counted: number | null;
  price: number;
  cost: number | null;
}

export interface StocktakeDetail { stocktake: Stocktake; warehouse_name: string; lines: CountLine[] }

export async function getStocktake(id: string, withCost: boolean): Promise<StocktakeDetail> {
  if (IS_DEMO) {
    await demoDelay();
    const db = ddb();
    const st = db.stocktakes.find((s) => s.id === id);
    if (!st) throw new AppError('لم نجد هذا الجرد.');
    const items = new Map(db.stocktake_items.filter((i) => i.stocktake_id === id).map((i) => [i.variant_id, i]));
    const ids = new Set<string>([...items.keys()]);
    // النطاق: كل النسخ الفعالة (للجرد المفتوح) أو ما عُدّ فقط (للمعتمد)
    if (st.status === 'draft') for (const v of db.product_variants) if (v.is_active && !db.products.find((p) => p.id === v.product_id)?.archived_at) ids.add(v.id);
    const lines: CountLine[] = [...ids].flatMap((vid) => {
      const v = db.product_variants.find((x) => x.id === vid);
      const p = v && db.products.find((x) => x.id === v.product_id);
      if (!v || !p) return [];
      const it = items.get(vid);
      const level = db.stock_levels.find((l) => l.variant_id === vid && l.warehouse_id === st.warehouse_id)?.qty ?? 0;
      return [{
        variant_id: vid, product_id: p.id, category_id: p.category_id, name: p.name, variant_title: vTitle(v.title), sku: v.sku, barcode: v.barcode,
        expected: it ? it.expected_qty : level, counted: it?.counted_qty ?? null, price: v.price, cost: withCost ? db.variant_costs.find((c) => c.variant_id === vid)?.avg_cost ?? 0 : null,
      }];
    }).sort((a, b) => a.name.localeCompare(b.name, 'ar'));
    return { stocktake: structuredClone(st), warehouse_name: db.warehouses.find((w) => w.id === st.warehouse_id)?.name ?? '', lines };
  }
  const { data: st, error } = await sb().from('stocktakes').select('*, warehouses(name)').eq('id', id).maybeSingle();
  if (error) throw error;
  if (!st) throw new AppError('لم نجد هذا الجرد.');
  const { warehouses, ...stocktake } = st as Stocktake & { warehouses: { name: string } | null };
  const [itemsRes, levelsRes] = await Promise.all([
    sb().from('stocktake_items').select('variant_id,expected_qty,counted_qty,product_variants(title,sku,barcode,price,product_id,products(name,category_id))').eq('stocktake_id', id),
    stocktake.status === 'draft'
      ? sb().from('stock_levels').select('variant_id,qty,product_variants!inner(title,sku,barcode,price,product_id,is_active,products!inner(name,category_id,archived_at))').eq('warehouse_id', stocktake.warehouse_id).eq('product_variants.is_active', true).is('product_variants.products.archived_at', null).limit(20000)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (itemsRes.error) throw itemsRes.error;
  if (levelsRes.error) throw levelsRes.error;
  type V = { title: string; sku: string; barcode: string | null; price: number; product_id: string; products: { name: string; category_id: string | null } | null };
  const map = new Map<string, CountLine>();
  for (const r of (levelsRes.data ?? []) as unknown as { variant_id: string; qty: number; product_variants: V }[]) {
    const v = r.product_variants;
    map.set(r.variant_id, { variant_id: r.variant_id, product_id: v.product_id, category_id: v.products?.category_id ?? null, name: v.products?.name ?? '', variant_title: vTitle(v.title), sku: v.sku, barcode: v.barcode, expected: Number(r.qty), counted: null, price: Number(v.price), cost: null });
  }
  for (const r of (itemsRes.data ?? []) as unknown as (StocktakeItem & { product_variants: V | null })[]) {
    const v = r.product_variants;
    map.set(r.variant_id, { variant_id: r.variant_id, product_id: v?.product_id ?? '', category_id: v?.products?.category_id ?? null, name: v?.products?.name ?? '', variant_title: vTitle(v?.title), sku: v?.sku ?? '', barcode: v?.barcode ?? null, expected: Number(r.expected_qty), counted: r.counted_qty === null ? null : Number(r.counted_qty), price: Number(v?.price ?? 0), cost: null });
  }
  const lines = [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'ar'));
  if (withCost) {
    const costs = await costsOf(lines.map((l) => l.variant_id));
    for (const l of lines) l.cost = costs[l.variant_id] ?? 0;
  }
  return { stocktake, warehouse_name: warehouses?.name ?? '', lines };
}

export async function setStocktakeCount(id: string, variantId: string, counted: number | null): Promise<void> {
  if (!IS_DEMO) { await rpc('set_stocktake_count', { id, variant_id: variantId, counted }); return; }
  const db = ddb();
  const st = db.stocktakes.find((s) => s.id === id);
  if (!st || st.status !== 'draft') throw new AppError('هذا الجرد مُعتمد ولا يمكن تعديله.');
  let it = db.stocktake_items.find((i) => i.stocktake_id === id && i.variant_id === variantId);
  if (!it) {
    const expected = db.stock_levels.find((l) => l.variant_id === variantId && l.warehouse_id === st.warehouse_id)?.qty ?? 0;
    it = { stocktake_id: id, variant_id: variantId, expected_qty: expected, counted_qty: null };
    db.stocktake_items.push(it);
  }
  it.counted_qty = counted;
}

export async function applyStocktake(id: string): Promise<{ adjusted: number }> {
  if (!IS_DEMO) {
    const r = await rpc<{ adjusted?: number } | null>('apply_stocktake', { id });
    return { adjusted: Number(r?.adjusted ?? 0) };
  }
  await demoDelay(300);
  const db = ddb();
  const st = db.stocktakes.find((s) => s.id === id);
  if (!st || st.status !== 'draft') throw new AppError('هذا الجرد مُعتمد من قبل.');
  return demoTransaction(db, () => {
    let adjusted = 0;
    for (const it of db.stocktake_items.filter((i) => i.stocktake_id === id && i.counted_qty !== null)) {
      const cur = db.stock_levels.find((l) => l.variant_id === it.variant_id && l.warehouse_id === st.warehouse_id)?.qty ?? 0;
      const diff = (it.counted_qty ?? 0) - cur;
      if (diff !== 0) {
        demoApplyMovement(db, { variant_id: it.variant_id, warehouse_id: st.warehouse_id, qty: diff, kind: 'stocktake', ref_type: 'stocktake', ref_id: id, note: st.number });
        adjusted += 1;
      }
    }
    st.status = 'applied';
    st.applied_at = demoNow();
    return { adjusted };
  });
}

// ------------------------------------------------------------------ الموردون

export interface SupplierRow extends Supplier { balance: number; balance_usd: number; purchases_total: number; paid_total: number; last_activity_at: string | null }

/** الأرصدة بالعملتين منفصلتين: مستندات الدينار في balance ومستندات الدولار في balance_usd (لا يُخلطان) */
function demoSupplierBalance(db: DemoDb, supplierId: string): SupplierBalance {
  const inv = db.invoices.filter((i) => i.supplier_id === supplierId && i.status === 'posted');
  const pays = db.payments.filter((p) => p.supplier_id === supplierId && !p.voided_at);
  const bal = (cur: CurrencyCode) => {
    const purchases = inv.filter((i) => i.kind === 'purchase' && i.currency === cur).reduce((s, i) => s + i.total, 0);
    const returns = inv.filter((i) => i.kind === 'purchase_return' && i.currency === cur).reduce((s, i) => s + i.total, 0);
    const paid = pays.filter((p) => p.currency === cur).reduce((s, p) => s + (p.direction === 'out' ? p.amount : -p.amount), 0);
    return { purchases, returns, paid, balance: purchases - returns - paid };
  };
  const iqd = bal('IQD'), usd = bal('USD');
  const dates = [...inv.map((i) => i.created_at), ...pays.map((p) => p.created_at)].sort();
  return { supplier_id: supplierId, purchases_total: iqd.purchases, returns_total: iqd.returns, paid_total: iqd.paid, balance: iqd.balance, balance_usd: Math.round(usd.balance * 100) / 100, last_activity_at: dates[dates.length - 1] ?? null };
}

export async function listSuppliers(): Promise<SupplierRow[]> {
  if (IS_DEMO) {
    await demoDelay();
    const db = ddb();
    return db.suppliers.map((s) => {
      const b = demoSupplierBalance(db, s.id);
      return { ...structuredClone(s), balance: b.balance, balance_usd: b.balance_usd, purchases_total: b.purchases_total, paid_total: b.paid_total, last_activity_at: b.last_activity_at };
    }).sort((a, b) => a.name.localeCompare(b.name, 'ar'));
  }
  const [s, b] = await Promise.all([sb().from('suppliers').select('*').order('name'), sb().from('supplier_balances').select('*')]);
  if (s.error) throw s.error;
  const bal = new Map(((b.data ?? []) as SupplierBalance[]).map((x) => [x.supplier_id, x]));
  return ((s.data ?? []) as Supplier[]).map((x) => {
    const r = bal.get(x.id);
    return { ...x, balance: Number(r?.balance ?? 0), balance_usd: Number(r?.balance_usd ?? 0), purchases_total: Number(r?.purchases_total ?? 0), paid_total: Number(r?.paid_total ?? 0), last_activity_at: r?.last_activity_at ?? null };
  });
}

export async function getSupplier(id: string): Promise<SupplierRow> {
  if (IS_DEMO) {
    const list = await listSuppliers();
    const s = list.find((x) => x.id === id);
    if (!s) throw new AppError('لم نجد هذا المورد.');
    return s;
  }
  const [s, b] = await Promise.all([sb().from('suppliers').select('*').eq('id', id).maybeSingle(), sb().from('supplier_balances').select('*').eq('supplier_id', id).maybeSingle()]);
  if (s.error) throw s.error;
  if (!s.data) throw new AppError('لم نجد هذا المورد.');
  const r = b.data as SupplierBalance | null;
  return { ...(s.data as Supplier), balance: Number(r?.balance ?? 0), balance_usd: Number(r?.balance_usd ?? 0), purchases_total: Number(r?.purchases_total ?? 0), paid_total: Number(r?.paid_total ?? 0), last_activity_at: r?.last_activity_at ?? null };
}

export type SupplierDraft = Pick<Supplier, 'name' | 'company' | 'phone' | 'phone2' | 'address' | 'notes'> & { id?: string };

export async function saveSupplier(s: SupplierDraft): Promise<Supplier> {
  const name = s.name.trim();
  if (!name) throw new AppError('اكتب اسم المورد.');
  if (IS_DEMO) {
    await demoDelay(150);
    const db = ddb();
    const now = demoNow();
    if (s.id) {
      const cur = db.suppliers.find((x) => x.id === s.id);
      if (!cur) throw new AppError('لم نجد هذا المورد.');
      Object.assign(cur, { ...s, name, updated_at: now });
      return structuredClone(cur);
    }
    const row: Supplier = { id: demoId(), name, company: s.company, phone: s.phone, phone2: s.phone2, address: s.address, notes: s.notes, created_at: now, updated_at: now };
    db.suppliers.push(row);
    return structuredClone(row);
  }
  const body = { name, company: s.company, phone: s.phone, phone2: s.phone2, address: s.address, notes: s.notes };
  const res = s.id ? await sb().from('suppliers').update(body).eq('id', s.id).select().single() : await sb().from('suppliers').insert(body).select().single();
  if (res.error) throw res.error;
  return res.data as Supplier;
}

export interface StatementRow { currency: CurrencyCode; at: string; kind: 'purchase' | 'purchase_return' | 'payment' | 'refund' | 'other'; number: string; ref_id: string | null; debit: number; credit: number; balance: number; note: string | null }

/** كشف حساب المورد: «له» = فواتير الشراء (تزيد ما علينا)، «عليه» = دفعاتنا والمرتجعات */
export async function supplierStatement(supplierId: string, from: string, to: string, currency: CurrencyCode): Promise<{ opening: number; rows: StatementRow[] }> {
  if (IS_DEMO) {
    await demoDelay();
    const db = ddb();
    const entries: Omit<StatementRow, 'balance'>[] = [
      ...db.invoices.filter((i) => i.supplier_id === supplierId && i.status === 'posted' && i.currency === currency).map((i) => ({
        currency: i.currency, at: i.created_at, kind: i.kind === 'purchase_return' ? 'purchase_return' as const : 'purchase' as const, number: i.number, ref_id: i.id,
        debit: i.kind === 'purchase_return' ? 0 : i.total, credit: i.kind === 'purchase_return' ? i.total : 0, note: i.note,
      })),
      ...db.payments.filter((p) => p.supplier_id === supplierId && !p.voided_at && p.currency === currency).map((p) => ({
        currency: p.currency, at: p.created_at, kind: p.direction === 'out' ? 'payment' as const : 'refund' as const, number: p.number, ref_id: p.invoice_id,
        debit: p.direction === 'in' ? p.amount : 0, credit: p.direction === 'out' ? p.amount : 0, note: p.note,
      })),
    ].sort((a, b) => a.at.localeCompare(b.at));
    let bal = 0;
    let opening = 0;
    const rows: StatementRow[] = [];
    for (const e of entries) {
      bal += e.debit - e.credit;
      if (from && e.at < dayStart(from)) { opening = bal; continue; }
      if (to && e.at > dayEnd(to)) continue;
      rows.push({ ...e, balance: bal });
    }
    return { opening, rows };
  }
  // الشكل الفعلي: {supplier_id, opening:{IQD,USD}, rows:[{at, doc_type, doc_id, number, description, currency, debit, credit, balance}], closing:{IQD,USD}}
  const raw = await rpc<{ opening: Record<CurrencyCode, number>; rows: { at: string; doc_type: string; doc_id: string | null; number: string; description: string | null; currency: CurrencyCode; debit: number; credit: number; balance: number }[] }>(
    'supplier_statement', { supplier_id: supplierId, from: from ? dayStart(from) : null, to: to ? dayEnd(to) : null });
  const rows: StatementRow[] = (raw.rows ?? []).filter((r) => r.currency === currency).map((r) => ({
    currency, at: r.at, kind: (r.doc_type === 'purchase' || r.doc_type === 'purchase_return' ? r.doc_type : r.doc_type === 'payment' ? (Number(r.credit) > 0 ? 'payment' : 'refund') : 'other') as StatementRow['kind'],
    number: r.number, ref_id: r.doc_id, debit: Number(r.debit), credit: Number(r.credit), balance: Number(r.balance), note: r.description,
  }));
  const opening = Number(raw.opening?.[currency] ?? 0);
  return { opening, rows };
}

export async function supplierPayments(supplierId: string): Promise<Payment[]> {
  if (IS_DEMO) {
    await demoDelay(100);
    return ddb().payments.filter((p) => p.supplier_id === supplierId).sort((a, b) => b.created_at.localeCompare(a.created_at)).map((p) => ({ ...p }));
  }
  const { data, error } = await sb().from('payments').select('*').eq('supplier_id', supplierId).order('created_at', { ascending: false }).limit(300);
  if (error) throw error;
  return (data ?? []) as Payment[];
}

export interface SupplierPaymentPayload {
  supplier_id: string; amount: number; method: PaymentMethod; currency: CurrencyCode; exchange_rate: number; account_id: string | null;
  invoice_id: string | null; reference: string | null; note: string | null;
}

/** سند صرف لمورد */
export async function recordSupplierPayment(p: SupplierPaymentPayload): Promise<{ payment_id: string; number: string }> {
  if (!(p.amount > 0)) throw new AppError('اكتب مبلغاً أكبر من صفر.');
  const payload = {
    direction: 'out' as const, method: p.method, amount: p.amount, currency: p.currency, exchange_rate: p.currency === 'USD' ? p.exchange_rate : 1, account_id: p.account_id,
    supplier_id: p.supplier_id, invoice_id: p.invoice_id, reference: p.reference, note: p.note,
  };
  if (!IS_DEMO) { const r = await rpc<{ id: string; number: string }>('record_payment', { p: payload }); return { payment_id: r.id, number: r.number }; }
  await demoDelay(220);
  const db = ddb();
  if (p.invoice_id) {
    const inv = db.invoices.find((i) => i.id === p.invoice_id);
    if (!inv) throw new AppError('لم نجد الفاتورة.');
    if (inv.currency !== p.currency) throw new AppError('عملة الدفعة تختلف عن عملة الفاتورة.');
    if (p.amount > inv.total - inv.paid) throw new AppError('المبلغ أكبر من المتبقي على الفاتورة.');
    inv.paid += p.amount;
    inv.due = inv.total - inv.paid;
  }
  const id = demoId();
  const number = nextDocNumber(db, 'voucher');
  db.payments.push({ id, number, ...payload, amount_iqd: Math.round(p.amount * payload.exchange_rate), customer_id: null, order_id: null, cash_session_id: null, created_by: 'demo-owner', created_at: demoNow(), voided_at: null });
  return { payment_id: id, number };
}

// ------------------------------------------------------------------ المشتريات

export interface PurchaseRow extends Invoice { supplier_name: string; warehouse_name: string; lines: number }

export interface PurchaseQuery { q: string; supplier_id: string; status: '' | 'due' | 'paid'; page: number; pageSize: number }

export async function listPurchases(f: PurchaseQuery): Promise<{ rows: PurchaseRow[]; total: number }> {
  const from = (f.page - 1) * f.pageSize;
  if (IS_DEMO) {
    await demoDelay();
    const db = ddb();
    const q = f.q.trim().toLowerCase();
    const list = db.invoices.filter((i) => (i.kind === 'purchase' || i.kind === 'purchase_return')
      && (!f.supplier_id || i.supplier_id === f.supplier_id) && (!f.status || (f.status === 'due' ? i.due > 0 : i.due <= 0))
      && (!q || i.number.toLowerCase().includes(q) || (db.suppliers.find((s) => s.id === i.supplier_id)?.name ?? '').includes(f.q.trim())),
    ).sort((a, b) => b.created_at.localeCompare(a.created_at));
    return {
      rows: list.slice(from, from + f.pageSize).map((i) => ({ ...i, supplier_name: db.suppliers.find((s) => s.id === i.supplier_id)?.name ?? '', warehouse_name: db.warehouses.find((w) => w.id === i.warehouse_id)?.name ?? '', lines: db.invoice_items.filter((x) => x.invoice_id === i.id).length })),
      total: list.length,
    };
  }
  let qb = sb().from('invoices').select('*, suppliers(name), warehouses(name), invoice_items(id)', { count: 'exact' }).in('kind', ['purchase', 'purchase_return']);
  if (f.supplier_id) qb = qb.eq('supplier_id', f.supplier_id);
  if (f.status === 'due') qb = qb.gt('due', 0);
  if (f.status === 'paid') qb = qb.lte('due', 0);
  if (f.q.trim()) qb = qb.ilike('number', like(f.q));
  const { data, error, count } = await qb.order('created_at', { ascending: false }).range(from, from + f.pageSize - 1);
  if (error) throw error;
  return {
    rows: ((data ?? []) as unknown as (Invoice & { suppliers: { name: string } | null; warehouses: { name: string } | null; invoice_items: { id: string }[] })[]).map(({ suppliers, warehouses, invoice_items, ...i }) => ({
      ...i, supplier_name: suppliers?.name ?? '', warehouse_name: warehouses?.name ?? '', lines: invoice_items.length,
    })),
    total: count ?? 0,
  };
}

export async function getInvoiceItems(invoiceId: string): Promise<InvoiceItem[]> {
  if (IS_DEMO) { await demoDelay(80); return ddb().invoice_items.filter((i) => i.invoice_id === invoiceId).map((i) => ({ ...i })); }
  const { data, error } = await sb().from('invoice_items').select('*').eq('invoice_id', invoiceId);
  if (error) throw error;
  return (data ?? []) as InvoiceItem[];
}

export interface PurchasePayload {
  supplier_id: string;
  warehouse_id: string;
  currency: CurrencyCode;
  exchange_rate: number;
  items: { variant_id: string; qty: number; unit_cost: number; serials?: string[]; lot_code?: string; expiry_date?: string }[];
  discount?: number;
  payments?: { method: PaymentMethod; amount: number; account_id?: string | null; reference?: string }[];
  note?: string | null;
}

export async function postPurchase(p: PurchasePayload): Promise<{ invoice_id: string; number: string }> {
  if (!p.supplier_id) throw new AppError('اختر المورد.');
  if (!p.warehouse_id) throw new AppError('اختر المخزن.');
  if (!p.items.length) throw new AppError('أضف منتجاً واحداً على الأقل.');
  if (!IS_DEMO) return rpc('post_purchase', { p });
  await demoDelay(320);
  const db = ddb();
  return demoTransaction(db, () => {
    const id = demoId();
    const number = nextDocNumber(db, 'purchase');
    const now = demoNow();
    const xr = p.currency === 'USD' ? p.exchange_rate : 1;
    let subtotal = 0;
    for (const it of p.items) {
      const v = db.product_variants.find((x) => x.id === it.variant_id);
      const prod = v && db.products.find((x) => x.id === v.product_id);
      if (!v || !prod) throw new AppError('أحد المنتجات غير موجود.');
      if (prod.track_serials && (it.serials?.length ?? 0) !== it.qty) throw new AppError(`«${prod.name}» يتتبع الأرقام التسلسلية: أدخل ${it.qty} رقماً.`);
      const dup = (it.serials ?? []).find((s) => db.serials.some((x) => x.variant_id === v.id && x.serial === s));
      if (dup) throw new AppError(`الرقم التسلسلي ${dup} مسجل من قبل.`);
      if (prod.track_expiry && !it.expiry_date) throw new AppError(`«${prod.name}» يتتبع الصلاحية: اكتب تاريخ الانتهاء.`);
      const line = Math.round(it.qty * it.unit_cost * 100) / 100;
      subtotal += line;
      // التكلفة في المخزون دائماً بالدينار (بسعر صرف الفاتورة)
      const costIqd = Math.round(it.unit_cost * xr * 100) / 100;
      db.invoice_items.push({
        id: demoId(), invoice_id: id, variant_id: v.id, product_id: prod.id, name: prod.name, variant_title: vTitle(v.title), sku: v.sku, qty: it.qty, unit_price: it.unit_cost, discount: 0, line_total: line,
        unit_cost: costIqd, serials: it.serials ?? [], price_tier: 'retail', unit_name: null, unit_factor: 1, lot_code: it.lot_code ?? null, expiry_date: it.expiry_date ?? null,
      });
      demoApplyMovement(db, { variant_id: v.id, warehouse_id: p.warehouse_id, qty: it.qty, kind: 'purchase', unit_cost: costIqd, ref_type: 'invoice', ref_id: id, note: number, lot_code: it.lot_code, expiry_date: it.expiry_date });
      for (const s of it.serials ?? []) db.serials.push({ id: demoId(), variant_id: v.id, serial: s, status: 'in_stock', warehouse_id: p.warehouse_id, purchase_invoice_id: id, sale_invoice_id: null, note: null, created_at: now, updated_at: now });
    }
    subtotal = Math.round(subtotal * 100) / 100;
    const discount = Math.min(p.discount ?? 0, subtotal);
    const total = subtotal - discount;
    const paid = (p.payments ?? []).reduce((s, x) => s + x.amount, 0);
    if (paid > total) throw new AppError('المدفوع أكبر من إجمالي الفاتورة.');
    db.invoices.push({
      id, number, kind: 'purchase', channel: 'manual', status: 'posted', customer_id: null, supplier_id: p.supplier_id, order_id: null, return_of: null, warehouse_id: p.warehouse_id,
      branch_id: demoBranchOf(db, p.warehouse_id), quotation_id: null, currency: p.currency, exchange_rate: xr,
      subtotal, discount, delivery_fee: 0, total, paid, due: Math.round((total - paid) * 100) / 100, cost_total: Math.round(total * xr), note: p.note ?? null, cash_session_id: null, created_by: 'demo-owner', created_at: now, voided_at: null, voided_by: null, void_reason: null,
    });
    for (const pay of p.payments ?? []) {
      if (pay.amount <= 0) continue;
      db.payments.push({
        id: demoId(), number: nextDocNumber(db, 'voucher'), direction: 'out', method: pay.method, amount: pay.amount, currency: p.currency, exchange_rate: xr, amount_iqd: Math.round(pay.amount * xr),
        account_id: pay.account_id ?? null, customer_id: null, supplier_id: p.supplier_id, invoice_id: id, order_id: null, cash_session_id: null, reference: pay.reference ?? null, note: null, created_by: 'demo-owner', created_at: now, voided_at: null });
    }
    return { invoice_id: id, number };
  });
}

