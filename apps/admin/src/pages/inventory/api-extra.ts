/**
 * إضافات القرار ١٨: العملة والصناديق، الدفعات والصلاحية، السندات المخزنية والعينات، إدارة الباركودات ووحدات التعبئة.
 *
 *   post_stock_voucher(p)  p = {kind:'in'|'out'|'sample_out'|'sample_return'|'damage', warehouse_id, customer_id?, reason, note?,
 *                              items:[{variant_id, qty, unit_cost?, lot_code?, expiry_date?}]}   ← يعيد {voucher_id, number}
 *   near_expiry(days, lim) ← صفوف: {lot_id|id, variant_id, product_id, name, variant_title, sku, warehouse_id, warehouse_name, lot_code, expiry_date, qty, days_left?}
 *   variant_units: إضافة/حذف مباشرة على الجدول (products.write)، وتغيير باركود النسخة على product_variants.
 */
import {
  isoDay, isValidGtin, normalizeArabic, tokens,
  type CurrencySettings, type Customer, type MoneyAccount, type MovementKind, type StockLot, type StockVoucher, type StockVoucherKind, type VariantUnit,
} from '@raqeem/shared';
import { IS_DEMO } from '../../lib/env';
import { demoDelay, demoId } from '../../lib/demo-db';
import { AppError, rpc, sb } from '../../lib/supabase';
import { costsOf, like, staffMap, vTitle } from './api';
import { DEMO_STAFF, ddb, demoApplyMovement, demoCurrency, demoNow, demoTransaction, nextDocNumber, type DemoDb } from './demo';

// ------------------------------------------------------------------ العملة والصناديق

export async function getCurrencySettings(): Promise<CurrencySettings> {
  if (IS_DEMO) return demoCurrency();
  const { data } = await sb().from('app_settings').select('value').eq('key', 'currency').maybeSingle();
  const v = data?.value as Partial<CurrencySettings> | undefined;
  return { base: 'IQD', usd_enabled: v?.usd_enabled ?? true, usd_rate: Number(v?.usd_rate ?? 0) || 1310, usd_rate_updated_at: v?.usd_rate_updated_at ?? null };
}

export async function listMoneyAccounts(): Promise<MoneyAccount[]> {
  if (IS_DEMO) return structuredClone(ddb().money_accounts).filter((a) => a.is_active);
  const { data, error } = await sb().from('money_accounts').select('*').eq('is_active', true).order('is_default', { ascending: false }).order('name');
  if (error) return [];
  return (data ?? []) as MoneyAccount[];
}

// ------------------------------------------------------------------ الدفعات والصلاحية

export interface LotRow extends StockLot { product_id: string; name: string; variant_title: string | null; sku: string; warehouse_name: string; days_left: number | null; unit_cost: number | null }

export const daysLeft = (expiry: string | null) => (expiry ? Math.round((Date.parse(`${expiry}T00:00:00+03:00`) - Date.parse(`${isoDay()}T00:00:00+03:00`)) / 86_400_000) : null);

function demoLotRow(db: DemoDb, l: StockLot, withCost: boolean): LotRow {
  const v = db.product_variants.find((x) => x.id === l.variant_id);
  return {
    ...l, product_id: v?.product_id ?? '', name: db.products.find((p) => p.id === v?.product_id)?.name ?? '', variant_title: vTitle(v?.title), sku: v?.sku ?? '',
    warehouse_name: db.warehouses.find((w) => w.id === l.warehouse_id)?.name ?? '', days_left: daysLeft(l.expiry_date),
    unit_cost: withCost ? db.variant_costs.find((c) => c.variant_id === l.variant_id)?.avg_cost ?? 0 : null,
  };
}

/** دفعات منتج (تبويب المخزون في نموذج المنتج) */
export async function productLots(variantIds: string[]): Promise<LotRow[]> {
  if (!variantIds.length) return [];
  if (IS_DEMO) {
    const db = ddb();
    return db.stock_lots.filter((l) => variantIds.includes(l.variant_id) && l.qty > 0).map((l) => demoLotRow(db, l, false)).sort((a, b) => (a.expiry_date ?? '9999').localeCompare(b.expiry_date ?? '9999'));
  }
  const { data, error } = await sb().from('stock_lots').select('*, product_variants(title,sku,product_id,products(name)), warehouses(name)').in('variant_id', variantIds).gt('qty', 0).order('expiry_date', { ascending: true, nullsFirst: false });
  if (error) throw error;
  type Row = StockLot & { product_variants: { title: string; sku: string; product_id: string; products: { name: string } | null } | null; warehouses: { name: string } | null };
  return ((data ?? []) as unknown as Row[]).map(({ product_variants: v, warehouses: w, ...l }) => ({
    ...l, qty: Number(l.qty), product_id: v?.product_id ?? '', name: v?.products?.name ?? '', variant_title: vTitle(v?.title), sku: v?.sku ?? '', warehouse_name: w?.name ?? '', days_left: daysLeft(l.expiry_date), unit_cost: null,
  }));
}

/** الدفعات المنتهية والتي تنتهي خلال N يوماً ← near_expiry(days, lim) */
export async function nearExpiry(days: number, withCost: boolean): Promise<LotRow[]> {
  if (IS_DEMO) {
    await demoDelay();
    const db = ddb();
    const limit = isoDay(Date.now() + days * 86_400_000);
    return db.stock_lots.filter((l) => l.qty > 0 && l.expiry_date && l.expiry_date <= limit).map((l) => demoLotRow(db, l, withCost)).sort((a, b) => (a.expiry_date ?? '').localeCompare(b.expiry_date ?? ''));
  }
  const rows = await rpc<Record<string, unknown>[]>('near_expiry', { days, lim: 500 });
  const out: LotRow[] = rows.map((r) => {
    const expiry = (r.expiry_date as string | null) ?? null;
    return {
      id: String(r.lot_id ?? r.id ?? ''), variant_id: String(r.variant_id ?? ''), warehouse_id: String(r.warehouse_id ?? ''), lot_code: String(r.lot_code ?? ''), expiry_date: expiry,
      qty: Number(r.qty ?? 0), created_at: String(r.created_at ?? ''), product_id: String(r.product_id ?? ''), name: String(r.name ?? ''), variant_title: vTitle(r.variant_title as string | null),
      sku: String(r.sku ?? ''), warehouse_name: String(r.warehouse_name ?? ''), days_left: r.days_left !== undefined && r.days_left !== null ? Number(r.days_left) : daysLeft(expiry), unit_cost: null,
    };
  });
  if (withCost) {
    const costs = await costsOf(out.map((r) => r.variant_id));
    for (const r of out) r.unit_cost = costs[r.variant_id] ?? 0;
  }
  return out;
}

// ------------------------------------------------------------------ السندات المخزنية

export interface VoucherRow extends StockVoucher { warehouse_name: string; customer_name: string | null; lines: number; units: number; staff_name: string | null }
export interface VoucherLine { variant_id: string; qty: number; unit_cost: number | null; lot_code: string | null; expiry_date: string | null; name: string; variant_title: string | null; sku: string }

export async function listVouchers(kinds: StockVoucherKind[], page: number, pageSize: number): Promise<{ rows: VoucherRow[]; total: number }> {
  const from = (page - 1) * pageSize;
  if (IS_DEMO) {
    await demoDelay();
    const db = ddb();
    const list = db.stock_vouchers.filter((v) => kinds.includes(v.kind)).sort((a, b) => b.created_at.localeCompare(a.created_at));
    return {
      rows: list.slice(from, from + pageSize).map((v) => {
        const items = db.stock_voucher_items.filter((i) => i.voucher_id === v.id);
        return {
          ...v, warehouse_name: db.warehouses.find((w) => w.id === v.warehouse_id)?.name ?? '', customer_name: db.customers.find((c) => c.id === v.customer_id)?.name ?? null,
          lines: items.length, units: items.reduce((s, i) => s + i.qty, 0), staff_name: DEMO_STAFF.find((s) => s.id === v.created_by)?.full_name ?? null,
        };
      }),
      total: list.length,
    };
  }
  const { data, error, count } = await sb().from('stock_vouchers').select('*, warehouses(name), customers(name), stock_voucher_items(qty)', { count: 'exact' }).in('kind', kinds).order('created_at', { ascending: false }).range(from, from + pageSize - 1);
  if (error) throw error;
  const staff = await staffMap();
  type Row = StockVoucher & { warehouses: { name: string } | null; customers: { name: string } | null; stock_voucher_items: { qty: number }[] };
  return {
    rows: ((data ?? []) as unknown as Row[]).map(({ warehouses, customers, stock_voucher_items, ...v }) => ({
      ...v, warehouse_name: warehouses?.name ?? '', customer_name: customers?.name ?? null, lines: stock_voucher_items.length, units: stock_voucher_items.reduce((s, i) => s + Number(i.qty), 0), staff_name: v.created_by ? staff[v.created_by] ?? null : null,
    })),
    total: count ?? 0,
  };
}

export async function voucherLines(id: string): Promise<VoucherLine[]> {
  if (IS_DEMO) {
    await demoDelay(80);
    const db = ddb();
    return db.stock_voucher_items.filter((i) => i.voucher_id === id).map((i) => {
      const v = db.product_variants.find((x) => x.id === i.variant_id);
      return { variant_id: i.variant_id, qty: i.qty, unit_cost: i.unit_cost, lot_code: i.lot_code, expiry_date: i.expiry_date, name: db.products.find((p) => p.id === v?.product_id)?.name ?? '', variant_title: vTitle(v?.title), sku: v?.sku ?? '' };
    });
  }
  const { data, error } = await sb().from('stock_voucher_items').select('variant_id,qty,unit_cost,lot_code,expiry_date,product_variants(title,sku,products(name))').eq('voucher_id', id);
  if (error) throw error;
  type Row = Omit<VoucherLine, 'name' | 'variant_title' | 'sku'> & { product_variants: { title: string; sku: string; products: { name: string } | null } | null };
  return ((data ?? []) as unknown as Row[]).map(({ product_variants: v, ...i }) => ({ ...i, qty: Number(i.qty), name: v?.products?.name ?? '', variant_title: vTitle(v?.title), sku: v?.sku ?? '' }));
}

export interface VoucherPayload {
  kind: StockVoucherKind;
  warehouse_id: string;
  customer_id?: string | null;
  reason: string;
  note?: string | null;
  items: { variant_id: string; qty: number; unit_cost?: number | null; lot_code?: string | null; expiry_date?: string | null }[];
}

const VOUCHER_MOVE: Record<StockVoucherKind, { kind: MovementKind; sign: 1 | -1 }> = {
  in: { kind: 'manual_in', sign: 1 },
  out: { kind: 'manual_out', sign: -1 },
  sample_out: { kind: 'sample_out', sign: -1 },
  sample_return: { kind: 'sample_return', sign: 1 },
  damage: { kind: 'damage', sign: -1 },
};

export async function postStockVoucher(p: VoucherPayload): Promise<{ voucher_id: string; number: string }> {
  if (!p.warehouse_id) throw new AppError('اختر المخزن.');
  if (!p.reason.trim()) throw new AppError('اكتب سبب السند.');
  if (!p.items.length) throw new AppError('أضف منتجاً واحداً على الأقل.');
  if ((p.kind === 'sample_out' || p.kind === 'sample_return') && !p.customer_id) throw new AppError('اختر الزبون الذي خرجت له العينة.');
  if (p.items.some((i) => !(i.qty > 0))) throw new AppError('كل الكميات يجب أن تكون أكبر من صفر.');
  if (!IS_DEMO) return rpc('post_stock_voucher', { p });
  await demoDelay(250);
  const db = ddb();
  return demoTransaction(db, () => {
    if (p.kind === 'sample_return') {
      const out = demoOutstanding(db).filter((o) => o.customer_id === p.customer_id);
      for (const it of p.items) {
        const o = out.find((x) => x.variant_id === it.variant_id);
        if (!o || o.outstanding < it.qty) throw new AppError('الكمية الراجعة أكبر من العينات الموجودة عند هذا الزبون.');
      }
    }
    const id = demoId();
    const number = nextDocNumber(db, 'stock_voucher');
    const mv = VOUCHER_MOVE[p.kind];
    for (const it of p.items) {
      const v = db.product_variants.find((x) => x.id === it.variant_id);
      if (mv.sign > 0 && db.products.find((x) => x.id === v?.product_id)?.track_expiry && !it.expiry_date) throw new AppError('منتج يتتبع الصلاحية: اكتب تاريخ الانتهاء للدفعة الداخلة.');
      const cost = it.unit_cost ?? db.variant_costs.find((c) => c.variant_id === it.variant_id)?.avg_cost ?? null;
      demoApplyMovement(db, { variant_id: it.variant_id, warehouse_id: p.warehouse_id, qty: mv.sign * it.qty, kind: mv.kind, unit_cost: cost, ref_type: null, ref_id: id, note: `${number} — ${p.reason.trim()}`, lot_code: it.lot_code, expiry_date: it.expiry_date });
      db.stock_voucher_items.push({ voucher_id: id, variant_id: it.variant_id, qty: it.qty, unit_cost: cost, lot_code: it.lot_code ?? null, expiry_date: it.expiry_date ?? null });
    }
    db.stock_vouchers.push({ id, number, kind: p.kind, warehouse_id: p.warehouse_id, customer_id: p.customer_id ?? null, reason: p.reason.trim(), note: p.note ?? null, created_by: 'demo-owner', created_at: demoNow() });
    return { voucher_id: id, number };
  });
}

/** العينات لكل زبون ونسخة: خرج، رجع، والمتبقي خارج المخزن */
export interface SampleOutstanding {
  customer_id: string; customer_name: string; variant_id: string; name: string; variant_title: string | null; sku: string;
  warehouse_id: string; warehouse_name: string; out_qty: number; returned_qty: number; outstanding: number; last_out_at: string;
}

interface SampleDoc {
  kind: StockVoucherKind; customer_id: string | null; customer_name: string; warehouse_id: string; warehouse_name: string; created_at: string;
  items: { variant_id: string; qty: number; name: string; variant_title: string | null; sku: string }[];
}

function tallySamples(rows: SampleDoc[]): SampleOutstanding[] {
  const map = new Map<string, SampleOutstanding>();
  for (const v of [...rows].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    if (!v.customer_id) continue;
    for (const it of v.items) {
      const k = `${v.customer_id}|${it.variant_id}`;
      const o = map.get(k) ?? { customer_id: v.customer_id, customer_name: v.customer_name, variant_id: it.variant_id, name: it.name, variant_title: it.variant_title, sku: it.sku, warehouse_id: v.warehouse_id, warehouse_name: v.warehouse_name, out_qty: 0, returned_qty: 0, outstanding: 0, last_out_at: v.created_at };
      if (v.kind === 'sample_out') { o.out_qty += it.qty; o.last_out_at = v.created_at; o.warehouse_id = v.warehouse_id; o.warehouse_name = v.warehouse_name; }
      else o.returned_qty += it.qty;
      o.outstanding = o.out_qty - o.returned_qty;
      map.set(k, o);
    }
  }
  return [...map.values()].sort((a, b) => b.outstanding - a.outstanding || b.last_out_at.localeCompare(a.last_out_at));
}

function demoOutstanding(db: DemoDb): SampleOutstanding[] {
  return tallySamples(db.stock_vouchers.filter((v) => v.kind === 'sample_out' || v.kind === 'sample_return').map((v) => ({
    kind: v.kind, customer_id: v.customer_id, customer_name: db.customers.find((c) => c.id === v.customer_id)?.name ?? '', warehouse_id: v.warehouse_id,
    warehouse_name: db.warehouses.find((w) => w.id === v.warehouse_id)?.name ?? '', created_at: v.created_at,
    items: db.stock_voucher_items.filter((i) => i.voucher_id === v.id).map((i) => {
      const pv = db.product_variants.find((x) => x.id === i.variant_id);
      return { variant_id: i.variant_id, qty: i.qty, name: db.products.find((p) => p.id === pv?.product_id)?.name ?? '', variant_title: vTitle(pv?.title), sku: pv?.sku ?? '' };
    }),
  })));
}

export async function outstandingSamples(): Promise<SampleOutstanding[]> {
  if (IS_DEMO) { await demoDelay(); return demoOutstanding(ddb()); }
  const { data, error } = await sb().from('stock_vouchers')
    .select('kind,customer_id,warehouse_id,created_at,customers(name),warehouses(name),stock_voucher_items(variant_id,qty,product_variants(title,sku,products(name)))')
    .in('kind', ['sample_out', 'sample_return']).order('created_at', { ascending: false }).limit(3000);
  if (error) throw error;
  type Row = { kind: StockVoucherKind; customer_id: string | null; warehouse_id: string; created_at: string; customers: { name: string } | null; warehouses: { name: string } | null; stock_voucher_items: { variant_id: string; qty: number; product_variants: { title: string; sku: string; products: { name: string } | null } | null }[] };
  return tallySamples(((data ?? []) as unknown as Row[]).map((v) => ({
    kind: v.kind, customer_id: v.customer_id, customer_name: v.customers?.name ?? '', warehouse_id: v.warehouse_id, warehouse_name: v.warehouses?.name ?? '', created_at: v.created_at,
    items: v.stock_voucher_items.map((i) => ({ variant_id: i.variant_id, qty: Number(i.qty), name: i.product_variants?.products?.name ?? '', variant_title: vTitle(i.product_variants?.title), sku: i.product_variants?.sku ?? '' })),
  })));
}

/** بحث الزبائن (لمن خرجت العينة) */
export async function searchCustomers(q: string): Promise<Pick<Customer, 'id' | 'name' | 'phone'>[]> {
  if (IS_DEMO) {
    const t = normalizeArabic(q);
    return ddb().customers.filter((c) => !c.is_cash_customer && (!t || normalizeArabic(c.name).includes(t) || (c.phone ?? '').includes(q.trim()))).slice(0, 30).map((c) => ({ id: c.id, name: c.name, phone: c.phone }));
  }
  let qb = sb().from('customers').select('id,name,phone').eq('is_cash_customer', false).order('name').limit(30);
  if (q.trim()) qb = qb.ilike('name', like(q));
  const { data, error } = await qb;
  if (error) throw error;
  return (data ?? []) as Pick<Customer, 'id' | 'name' | 'phone'>[];
}

// ------------------------------------------------------------------ إدارة الباركود

export interface BarcodeRow {
  key: string;
  kind: 'variant' | 'unit';
  unit_id: string | null;
  variant_id: string;
  product_id: string;
  name: string;
  variant_title: string | null;
  sku: string;
  barcode: string | null;
  unit_name: string;
  factor: number;
  price: number;
  unit_price: number | null;
}

/** EAN-13 إن كان صالحاً، وإلا Code128 (كما يطبعه الملصق) */
export const symbology = (code: string | null) => (code && /^\d{13}$/.test(code) && isValidGtin(code) ? 'EAN-13' : code && /^\d{8}$/.test(code) && isValidGtin(code) ? 'EAN-8' : 'Code128');

export async function listBarcodes(q: string, onlyMissing: boolean): Promise<BarcodeRow[]> {
  const toks = tokens(q);
  if (IS_DEMO) {
    await demoDelay();
    const db = ddb();
    const rows: BarcodeRow[] = [];
    for (const v of db.product_variants) {
      const p = db.products.find((x) => x.id === v.product_id);
      if (!p || p.archived_at) continue;
      const units = db.variant_units.filter((u) => u.variant_id === v.id);
      const hay = normalizeArabic(`${p.name} ${v.title} ${v.sku} ${v.barcode ?? ''} ${units.map((u) => u.barcode).join(' ')}`);
      if (toks.length && !toks.every((t) => hay.includes(t))) continue;
      const base = { variant_id: v.id, product_id: p.id, name: p.name, variant_title: vTitle(v.title), sku: v.sku, price: v.price };
      rows.push({ ...base, key: v.id, kind: 'variant', unit_id: null, barcode: v.barcode, unit_name: p.unit || 'قطعة', factor: 1, unit_price: null });
      for (const u of units) rows.push({ ...base, key: u.id, kind: 'unit', unit_id: u.id, barcode: u.barcode, unit_name: u.unit_name, factor: u.factor, unit_price: u.price });
    }
    return onlyMissing ? rows.filter((r) => !r.barcode) : rows;
  }
  let qb = sb().from('product_variants').select('id,product_id,title,sku,barcode,price,products!inner(name,unit,archived_at,search_text),variant_units(id,unit_name,factor,barcode,price)').is('products.archived_at', null).order('sku').limit(1000);
  if (/^\d{8,14}$/.test(q.trim())) qb = qb.eq('barcode', q.trim());
  else for (const t of toks) qb = qb.ilike('products.search_text', like(t));
  if (onlyMissing) qb = qb.is('barcode', null);
  const { data, error } = await qb;
  if (error) throw error;
  type Row = { id: string; product_id: string; title: string; sku: string; barcode: string | null; price: number; products: { name: string; unit: string }; variant_units: Pick<VariantUnit, 'id' | 'unit_name' | 'factor' | 'barcode' | 'price'>[] };
  return ((data ?? []) as unknown as Row[]).flatMap((v) => {
    const base = { variant_id: v.id, product_id: v.product_id, name: v.products.name, variant_title: vTitle(v.title), sku: v.sku, price: Number(v.price) };
    return [
      { ...base, key: v.id, kind: 'variant' as const, unit_id: null, barcode: v.barcode, unit_name: v.products.unit || 'قطعة', factor: 1, unit_price: null },
      ...(onlyMissing ? [] : v.variant_units.map((u) => ({ ...base, key: u.id, kind: 'unit' as const, unit_id: u.id, barcode: u.barcode, unit_name: u.unit_name, factor: Number(u.factor), unit_price: u.price === null ? null : Number(u.price) }))),
    ];
  });
}

/** الباركود فريد عبر النسخ ووحدات التعبئة معاً */
async function assertBarcodeFree(code: string, exceptKey?: string) {
  if (IS_DEMO) {
    const db = ddb();
    if (db.product_variants.some((v) => v.barcode === code && v.id !== exceptKey) || db.variant_units.some((u) => u.barcode === code && u.id !== exceptKey)) throw new AppError(`الباركود ${code} مستخدم من قبل.`);
    return;
  }
  const [a, b] = await Promise.all([
    sb().from('product_variants').select('id').eq('barcode', code).neq('id', exceptKey ?? '00000000-0000-0000-0000-000000000000').limit(1),
    sb().from('variant_units').select('id').eq('barcode', code).neq('id', exceptKey ?? '00000000-0000-0000-0000-000000000000').limit(1),
  ]);
  if (a.data?.length || b.data?.length) throw new AppError(`الباركود ${code} مستخدم من قبل.`);
}

export async function setVariantBarcode(variantId: string, barcode: string | null): Promise<void> {
  const code = barcode?.trim() || null;
  if (code) await assertBarcodeFree(code, variantId);
  if (IS_DEMO) {
    await demoDelay(120);
    const v = ddb().product_variants.find((x) => x.id === variantId);
    if (v) { v.barcode = code; v.updated_at = demoNow(); }
    return;
  }
  const { error } = await sb().from('product_variants').update({ barcode: code }).eq('id', variantId);
  if (error) throw error;
}

export interface UnitInput { variant_id: string; unit_name: string; factor: number; barcode: string | null; price: number | null }

export async function addVariantUnit(u: UnitInput): Promise<void> {
  if (!u.unit_name.trim()) throw new AppError('اكتب اسم الوحدة (كرتونة، علبة…).');
  if (!(u.factor > 1)) throw new AppError('عدد القطع في الوحدة يجب أن يكون ٢ أو أكثر.');
  const code = u.barcode?.trim() || null;
  if (code) await assertBarcodeFree(code);
  if (IS_DEMO) {
    await demoDelay(120);
    ddb().variant_units.push({ id: demoId(), variant_id: u.variant_id, unit_name: u.unit_name.trim(), factor: u.factor, barcode: code, price: u.price, created_at: demoNow() });
    return;
  }
  const { error } = await sb().from('variant_units').insert({ variant_id: u.variant_id, unit_name: u.unit_name.trim(), factor: u.factor, barcode: code, price: u.price });
  if (error) throw error;
}

export async function deleteVariantUnit(id: string): Promise<void> {
  if (IS_DEMO) {
    await demoDelay(100);
    const db = ddb();
    db.variant_units = db.variant_units.filter((u) => u.id !== id);
    return;
  }
  const { error } = await sb().from('variant_units').delete().eq('id', id);
  if (error) throw error;
}
