/**
 * بيانات المنتجات والأقسام والعلامات — كل دالة تفرّع بين وضع العرض (demoDb) وSupabase.
 *
 * ===================== عقد upsert_product(p jsonb) — ما نرسله حرفياً =====================
 * {
 *   id?: uuid,                       // غيابه = منتج جديد
 *   name: text, slug?: text,         // slug اختياري: الخادم يولّده من الاسم إن غاب
 *   description: text|null, category_id: uuid|null, brand_id: uuid|null, unit: text,
 *   tags: text[], specs: [{label, value}], warranty: text|null,
 *   option_names: text[],            // ['اللون','المقاس'] — فارغة للمنتج البسيط
 *   has_variants: bool, track_serials: bool, track_expiry: bool, is_published: bool, is_featured: bool, allow_request: bool,
 *   images: [{key, alt, sort}],      // بالترتيب؛ الأولى = الغلاف (cover_key). ما غاب منها يُحذف
 *   variants: [{
 *     id?: uuid,                     // غيابه = نسخة جديدة. النسخ الموجودة التي لم تُرسل: تُحذف إن لم تكن لها حركات وإلا is_active=false
 *     title, options: {اسم الخيار: القيمة}, sku, barcode|null,
 *     price, compare_at_price|null, wholesale_price|null,
 *     cost?: number,                 // يُرسل فقط إن كان للموظف costs.view (وإلا لا يُلمس variant_costs)
 *     min_stock, is_active, sort,
 *     units: [{id?, unit_name, factor, barcode|null, price|null}],  // وحدات التعبئة (variant_units) — تُستبدل كلها؛ الباركود فريد عبر النسخ والوحدات
 *     opening?: [{warehouse_id, qty, lot_code?, expiry_date?}]     // للنسخ الجديدة فقط ← حركات opening بتكلفة cost
 *   }]
 * }
 * يعيد: product_full = صف products + variants[] (مع units وcost) + images[] — نقرأ منه id.
 * ===========================================================================================
 */
import {
  internalEan13, matchScore, normalizeArabic, slugify, suggestSku, tokens,
  type Brand, type Category, type InvoiceSettings, type VariantUnit, type Product, type ProductImage, type ProductSpec, type ProductVariant, type Serial, type SerialStatus,
} from '@raqeem/shared';
import { IS_DEMO } from '../../lib/env';
import { demoDelay, demoId } from '../../lib/demo-db';
import { AppError, rpc, sb } from '../../lib/supabase';
import { DEFAULT_LABEL_SIZE, ddb, demoApplyMovement, demoNow, demoTransaction } from '../inventory/demo';
import { fetchAll } from '../inventory/api';
import { getSetting } from '../sales/data/app-settings';

// ------------------------------------------------------------------ الأنواع

export interface ProductListItem extends Product { variants: ProductVariant[] }

export type StockFilter = '' | 'out' | 'low' | 'ok';
export type ProductSort = 'newest' | 'oldest' | 'name' | 'sold' | 'updated';

export interface ProductQuery {
  q: string;
  category_id: string;
  brand_id: string;
  stock: StockFilter;
  published: '' | 'yes' | 'no';
  archived: boolean;
  sort: ProductSort;
  page: number;
  pageSize: number;
}

export interface UpsertVariant {
  id?: string;
  title: string;
  options: Record<string, string>;
  sku: string;
  barcode: string | null;
  price: number;
  compare_at_price: number | null;
  wholesale_price: number | null;
  cost?: number;
  min_stock: number;
  is_active: boolean;
  sort: number;
  units: UnitDraft[];
  opening?: { warehouse_id: string; qty: number; lot_code?: string; expiry_date?: string }[];
}

export interface UnitDraft { id?: string; unit_name: string; factor: number; barcode: string | null; price: number | null }

export interface UpsertProductPayload {
  id?: string;
  name: string;
  slug?: string;
  description: string | null;
  category_id: string | null;
  brand_id: string | null;
  unit: string;
  tags: string[];
  specs: ProductSpec[];
  warranty: string | null;
  option_names: string[];
  has_variants: boolean;
  track_serials: boolean;
  track_expiry: boolean;
  is_published: boolean;
  is_featured: boolean;
  allow_request: boolean;
  images: { key: string; alt: string | null; sort: number }[];
  variants: UpsertVariant[];
}

export interface ProductFull {
  product: Product;
  variants: ProductVariant[];
  images: ProductImage[];
  units: VariantUnit[];
  /** متوسط التكلفة لكل نسخة — null إن لم يملك costs.view */
  costs: Record<string, number> | null;
}

/** نتيجة بحث عن نسخة (لنقطة الإدخال بالباركود/البحث في الشراء والنقل والجرد) */
export interface VariantHit {
  variant_id: string;
  product_id: string;
  name: string;
  title: string;
  sku: string;
  barcode: string | null;
  price: number;
  cover_key: string | null;
  track_serials: boolean;
  track_expiry: boolean;
  min_stock: number;
  available_qty: number;
  /** إن مُسح باركود وحدة تعبئة (كرتونة…): اسمها وعدد قطعها. القطعة: null و١ */
  unit_name: string | null;
  factor: number;
}

const variantLabel = (title: string) => (title === 'افتراضي' ? '' : title);
export const variantName = (name: string, title: string | null | undefined) => (title && title !== 'افتراضي' ? `${name} — ${title}` : name);

// ------------------------------------------------------------------ أدوات صغيرة

export function priceRange(vs: ProductVariant[]) {
  const active = vs.filter((v) => v.is_active);
  const list = active.length ? active : vs;
  const prices = list.map((v) => v.price);
  const compare = list.map((v) => v.compare_at_price).filter((x): x is number => x !== null && x > 0);
  return {
    min: prices.length ? Math.min(...prices) : 0,
    max: prices.length ? Math.max(...prices) : 0,
    compare: compare.length ? Math.max(...compare) : null,
    available: list.reduce((s, v) => s + v.available_qty, 0),
    minStock: list.length ? Math.min(...list.map((v) => v.min_stock)) : 0,
  };
}

/** حالة مخزون المنتج ككل: نفد إن كانت كل النسخ صفراً، قليل إن كانت إحداها تحت الحد */
/** lowDefault: حد التنبيه الافتراضي من الإعدادات للنسخ بلا حد خاص (كما في low_stock على الخادم) */
export function productStockKey(vs: ProductVariant[], lowDefault = 0): 'out' | 'low' | 'ok' {
  const active = vs.filter((v) => v.is_active);
  if (!active.length || active.every((v) => v.available_qty <= 0)) return 'out';
  if (active.some((v) => v.available_qty <= (v.min_stock || lowDefault))) return 'low';
  return 'ok';
}

const like = (s: string) => `%${s.replace(/[%_,()]/g, ' ').trim()}%`;
const isBarcodeLike = (q: string) => /^\d{8,14}$/.test(q.trim());

/** القسم وأقسامه الفرعية */
export function categoryWithChildren(cats: Category[], id: string): string[] {
  return [id, ...cats.filter((c) => c.parent_id === id).map((c) => c.id)];
}

// ------------------------------------------------------------------ المنتجات

export async function listProducts(f: ProductQuery, cats: Category[]): Promise<{ rows: ProductListItem[]; total: number }> {
  const from = (f.page - 1) * f.pageSize;
  if (IS_DEMO) {
    await demoDelay();
    const db = ddb();
    const lowDefault = f.stock ? Number((await getSetting('inventory')).low_stock_default) || 0 : 0;
    const catIds = f.category_id ? new Set(categoryWithChildren(cats, f.category_id)) : null;
    let rows = db.products
      .filter((p) => (f.archived ? !!p.archived_at : !p.archived_at))
      .filter((p) => !catIds || (p.category_id && catIds.has(p.category_id)))
      .filter((p) => !f.brand_id || p.brand_id === f.brand_id)
      .filter((p) => !f.published || p.is_published === (f.published === 'yes'))
      .map((p) => ({ ...p, variants: db.product_variants.filter((v) => v.product_id === p.id).sort((a, b) => a.sort - b.sort) }))
      .filter((p) => !f.stock || productStockKey(p.variants, lowDefault) === f.stock);
    let scores: Map<string, number> | null = null;
    if (f.q.trim()) {
      scores = new Map();
      for (const p of rows) {
        const brand = db.brands.find((b) => b.id === p.brand_id)?.name ?? '';
        const s = matchScore(f.q, `${p.name} ${p.tags.join(' ')} ${brand} ${p.variants.map((v) => v.title).join(' ')}`, p.variants.flatMap((v) => [v.sku, v.barcode ?? '']));
        if (s > 0) scores.set(p.id, s);
      }
      rows = rows.filter((p) => scores!.has(p.id));
    }
    rows.sort((a, b) => {
      if (scores && f.sort === 'newest') return (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0);
      switch (f.sort) {
        case 'oldest': return a.created_at.localeCompare(b.created_at);
        case 'name': return a.name.localeCompare(b.name, 'ar');
        case 'sold': return b.sold_count - a.sold_count;
        case 'updated': return b.updated_at.localeCompare(a.updated_at);
        default: return b.created_at.localeCompare(a.created_at);
      }
    });
    return { rows: rows.slice(from, from + f.pageSize).map((r) => structuredClone(r)), total: rows.length };
  }
  let qb = sb().from('products').select('*, product_variants(*)', { count: 'exact' });
  qb = f.archived ? qb.not('archived_at', 'is', null) : qb.is('archived_at', null);
  const q = f.q.trim();
  if (q) {
    if (isBarcodeLike(q)) {
      const { data, error } = await sb().from('product_variants').select('product_id').eq('barcode', q).limit(50);
      if (error) throw error;
      const ids = (data ?? []).map((r) => r.product_id as string);
      // الباركود غير موجود في search_text؛ نبحث بالاثنين
      qb = ids.length ? qb.or(`id.in.(${ids.join(',')}),search_text.ilike.${like(normalizeArabic(q))}`) : qb.ilike('search_text', like(normalizeArabic(q)));
    } else {
      for (const t of tokens(q)) qb = qb.ilike('search_text', like(t));
    }
  }
  if (f.category_id) qb = qb.in('category_id', categoryWithChildren(cats, f.category_id));
  if (f.brand_id) qb = qb.eq('brand_id', f.brand_id);
  if (f.published) qb = qb.eq('is_published', f.published === 'yes');
  if (f.stock) {
    // نفس قاعدة وضع العرض (productStockKey على النسخ الفعالة): نصنّف كل منتج من أرصدة نسخه
    const [vs, inv] = await Promise.all([
      fetchAll<Pick<ProductVariant, 'product_id' | 'available_qty' | 'min_stock' | 'is_active'>>((a, b) => sb().from('product_variants').select('product_id,available_qty,min_stock,is_active').order('id').range(a, b)),
      getSetting('inventory'),
    ]);
    const lowDefault = Number(inv.low_stock_default) || 0;
    const byProduct = new Map<string, ProductVariant[]>();
    for (const v of vs) {
      const list = byProduct.get(v.product_id) ?? [];
      list.push({ ...v, available_qty: Number(v.available_qty), min_stock: Number(v.min_stock) } as ProductVariant);
      byProduct.set(v.product_id, list);
    }
    const match: string[] = [];
    const rest: string[] = [];
    for (const [pid, list] of byProduct) (productStockKey(list, lowDefault) === f.stock ? match : rest).push(pid);
    if (!match.length) return { rows: [], total: 0 };
    // القائمة الأقصر في الرابط
    if (match.length <= rest.length) qb = qb.in('id', match);
    else if (rest.length) qb = qb.not('id', 'in', `(${rest.join(',')})`);
  }
  const order: Record<ProductSort, [string, boolean]> = { newest: ['created_at', false], oldest: ['created_at', true], name: ['name', true], sold: ['sold_count', false], updated: ['updated_at', false] };
  const [col, asc] = order[f.sort];
  const { data, error, count } = await qb.order(col, { ascending: asc }).range(from, from + f.pageSize - 1);
  if (error) throw error;
  const rows = ((data ?? []) as (Product & { product_variants: ProductVariant[] })[]).map(({ product_variants, ...p }) => ({ ...p, variants: [...(product_variants ?? [])].sort((a, b) => a.sort - b.sort) }));
  return { rows, total: count ?? rows.length };
}

/** كل المنتجات المطابقة (للتصدير) — حتى ٥٠٠٠ */
export async function listAllProducts(f: ProductQuery, cats: Category[]) {
  return (await listProducts({ ...f, page: 1, pageSize: 5000 }, cats)).rows;
}

export async function getProduct(id: string, withCosts: boolean): Promise<ProductFull> {
  if (IS_DEMO) {
    await demoDelay();
    const db = ddb();
    const product = db.products.find((p) => p.id === id);
    if (!product) throw new AppError('لم نجد هذا المنتج. ربما حُذف أو الرابط غير صحيح.');
    const variants = db.product_variants.filter((v) => v.product_id === id).sort((a, b) => a.sort - b.sort);
    const costs = withCosts ? Object.fromEntries(variants.map((v) => [v.id, db.variant_costs.find((c) => c.variant_id === v.id)?.avg_cost ?? 0])) : null;
    const units = db.variant_units.filter((u) => variants.some((v) => v.id === u.variant_id));
    return structuredClone({ product, variants, images: db.product_images.filter((i) => i.product_id === id).sort((a, b) => a.sort - b.sort), units, costs });
  }
  const [p, v, im] = await Promise.all([
    sb().from('products').select('*').eq('id', id).maybeSingle(),
    sb().from('product_variants').select('*').eq('product_id', id).order('sort'),
    sb().from('product_images').select('*').eq('product_id', id).order('sort'),
  ]);
  if (p.error) throw p.error;
  if (!p.data) throw new AppError('لم نجد هذا المنتج. ربما حُذف أو الرابط غير صحيح.');
  if (v.error) throw v.error;
  const variants = (v.data ?? []) as ProductVariant[];
  let costs: Record<string, number> | null = null;
  if (withCosts && variants.length) {
    const { data } = await sb().from('variant_costs').select('variant_id,avg_cost').in('variant_id', variants.map((x) => x.id));
    costs = Object.fromEntries((data ?? []).map((c) => [c.variant_id as string, Number(c.avg_cost)]));
  }
  let units: VariantUnit[] = [];
  if (variants.length) {
    const { data, error: ue } = await sb().from('variant_units').select('*').in('variant_id', variants.map((x) => x.id)).order('factor');
    if (ue) throw ue;
    units = (data ?? []) as VariantUnit[];
  }
  return { product: p.data as Product, variants, images: (im.data ?? []) as ProductImage[], units, costs };
}

/** حفظ المنتج كاملاً باستدعاء واحد (انظر العقد أعلى الملف). يعيد معرّف المنتج */
export async function upsertProduct(p: UpsertProductPayload): Promise<string> {
  if (!IS_DEMO) {
    const r = await rpc<{ id: string } | string>('upsert_product', { p });
    return typeof r === 'string' ? r : r.id;
  }
  await demoDelay(260);
  const db = ddb();
  // القيود الفريدة كما في قاعدة البيانات
  const others = db.product_variants.filter((v) => v.product_id !== p.id);
  const otherIds = new Set(others.map((o) => o.id));
  const takenCodes = new Set([...others.map((o) => o.barcode), ...db.variant_units.filter((u) => otherIds.has(u.variant_id)).map((u) => u.barcode)].filter(Boolean));
  for (const v of p.variants) {
    if (others.some((o) => o.sku.toLowerCase() === v.sku.toLowerCase())) throw new AppError(`رمز SKU «${v.sku}» مستخدم في منتج آخر. غيّره وحاول مجدداً.`);
    for (const code of [v.barcode, ...v.units.map((u) => u.barcode)]) if (code && takenCodes.has(code)) throw new AppError(`الباركود ${code} مستخدم في منتج آخر.`);
  }
  const now = demoNow();
  const existing = p.id ? db.products.find((x) => x.id === p.id) : undefined;
  if (p.id && !existing) throw new AppError('لم نجد هذا المنتج.');
  const id = existing?.id ?? demoId();
  let slug = (p.slug?.trim() || slugify(p.name)).toLowerCase();
  if (db.products.some((x) => x.slug === slug && x.id !== id)) slug = `${slug}-${id.slice(-4)}`;
  const base = {
    name: p.name.trim(), slug, description: p.description, category_id: p.category_id, brand_id: p.brand_id, unit: p.unit, tags: p.tags, specs: p.specs,
    warranty: p.warranty, option_names: p.option_names, has_variants: p.has_variants, track_serials: p.track_serials, track_expiry: p.track_expiry, is_published: p.is_published,
    is_featured: p.is_featured, allow_request: p.allow_request, cover_key: p.images[0]?.key ?? null, updated_at: now,
  };
  return demoTransaction(db, () => {
    if (existing) Object.assign(existing, base);
    else db.products.unshift({ id, ...base, sold_count: 0, rating_avg: 0, rating_count: 0, created_by: 'demo-owner', created_at: now, archived_at: null });
    // النسخ
    const keep = new Set<string>();
    for (const v of p.variants) {
      const cur = v.id ? db.product_variants.find((x) => x.id === v.id && x.product_id === id) : undefined;
      const fields = {
        title: v.title, options: v.options, sku: v.sku.trim(), barcode: v.barcode || null, price: v.price, compare_at_price: v.compare_at_price,
        wholesale_price: v.wholesale_price, min_stock: v.min_stock, is_active: v.is_active, sort: v.sort, updated_at: now,
      };
      let vid: string;
      if (cur) { Object.assign(cur, fields); vid = cur.id; }
      else {
        vid = demoId();
        db.product_variants.push({ id: vid, product_id: id, ...fields, image_key: null, available_qty: 0, weight_g: null, created_at: now });
      }
      keep.add(vid);
      db.variant_units = db.variant_units.filter((u) => u.variant_id !== vid);
      for (const u of v.units) db.variant_units.push({ id: u.id ?? demoId(), variant_id: vid, unit_name: u.unit_name, factor: u.factor, barcode: u.barcode, price: u.price, created_at: now });
      if (v.cost !== undefined) {
        const c = db.variant_costs.find((x) => x.variant_id === vid);
        if (c) { if (c.avg_cost !== v.cost) { c.avg_cost = v.cost; c.last_cost = v.cost; c.updated_at = now; } }
        else db.variant_costs.push({ variant_id: vid, avg_cost: v.cost, last_cost: v.cost, updated_at: now });
      }
    }
    // النسخ المحذوفة: ذات الحركات تُعطَّل، والباقي يُحذف
    for (const v of db.product_variants.filter((x) => x.product_id === id && !keep.has(x.id))) {
      if (db.stock_movements.some((m) => m.variant_id === v.id)) v.is_active = false;
      else db.product_variants.splice(db.product_variants.indexOf(v), 1);
    }
    // الصور
    db.product_images = db.product_images.filter((i) => i.product_id !== id);
    p.images.forEach((im, i) => db.product_images.push({ id: demoId(), product_id: id, key: im.key, alt: im.alt, sort: i, created_at: now }));
    // الرصيد الافتتاحي للجديد فقط
    if (!existing) {
      for (const pv of p.variants) {
        const v = db.product_variants.find((x) => x.product_id === id && x.sku === pv.sku.trim());
        for (const o of pv.opening ?? []) if (v && o.qty > 0) demoApplyMovement(db, { variant_id: v.id, warehouse_id: o.warehouse_id, qty: o.qty, kind: 'opening', unit_cost: pv.cost ?? null, ref_type: 'adjustment', note: 'رصيد افتتاحي', lot_code: o.lot_code ?? null, expiry_date: o.expiry_date ?? null });
      }
    }
    return id;
  });
}

export async function setPublished(ids: string[], value: boolean): Promise<void> {
  if (IS_DEMO) {
    await demoDelay(120);
    for (const p of ddb().products) if (ids.includes(p.id)) { p.is_published = value; p.updated_at = demoNow(); }
    return;
  }
  const { error } = await sb().from('products').update({ is_published: value }).in('id', ids);
  if (error) throw error;
}

export interface PriceChange { variant_id: string; product_id: string; sku: string; title: string; price: number; compare_at_price: number | null }

/** تعديل الأسعار جماعياً (نسخ كثيرة في طلب واحد) */
export async function applyPrices(changes: PriceChange[]): Promise<void> {
  if (!changes.length) return;
  if (IS_DEMO) {
    await demoDelay(200);
    for (const c of changes) {
      const v = ddb().product_variants.find((x) => x.id === c.variant_id);
      if (v) { v.price = c.price; v.compare_at_price = c.compare_at_price; v.updated_at = demoNow(); }
    }
    return;
  }
  // تحديث صف لكل نسخة (مجموعات من ١٠ بالتوازي) — لا upsert حتى لا يُنشأ صف ناقص بالخطأ
  for (let i = 0; i < changes.length; i += 10) {
    const res = await Promise.all(changes.slice(i, i + 10).map((c) => sb().from('product_variants').update({ price: c.price, compare_at_price: c.compare_at_price }).eq('id', c.variant_id)));
    const bad = res.find((r) => r.error);
    if (bad?.error) throw bad.error;
  }
}

export async function archiveProduct(id: string, archive: boolean): Promise<void> {
  if (IS_DEMO) {
    await demoDelay(150);
    const p = ddb().products.find((x) => x.id === id);
    if (p) { p.archived_at = archive ? demoNow() : null; if (archive) p.is_published = false; }
    return;
  }
  await rpc(archive ? 'archive_product' : 'restore_product', { id });
}

/** تسلسل جديد من قاعدة البيانات ← باركود داخلي EAN-13 يبدأ بـ 20 */
export async function nextBarcode(): Promise<string> {
  if (IS_DEMO) {
    const db = ddb();
    db.barcode_seq += 1;
    return internalEan13(db.barcode_seq);
  }
  // الخادم يعيد الباركود كاملاً (EAN-13 يبدأ بـ 20، فريد)
  const code = await rpc<string | number>('next_barcode');
  return /^\d{13}$/.test(String(code)) ? String(code) : internalEan13(Number(code));
}

/** رقم تسلسلي لاقتراح SKU (عدد النسخ + ١) */
export async function skuSeqStart(): Promise<number> {
  if (IS_DEMO) return ddb().product_variants.length + 1;
  const { count } = await sb().from('product_variants').select('id', { count: 'exact', head: true });
  return (count ?? 0) + 1;
}

/** بادئة SKU من القسم: slug لاتيني أو «RQ» */
export function skuPrefix(cat: Category | undefined): string {
  const s = (cat?.slug ?? '').replace(/[^a-z0-9]/gi, '').toUpperCase();
  return s ? s.slice(0, 3) : 'RQ';
}
export { suggestSku };

// ------------------------------------------------------------------ البحث عن نسخة (بالباركود أو الاسم)

export async function searchVariants(q: string, limit = 12): Promise<VariantHit[]> {
  const term = q.trim();
  if (!term) return [];
  if (IS_DEMO) {
    await demoDelay(60);
    const db = ddb();
    const out: { h: VariantHit; s: number }[] = [];
    for (const v of db.product_variants) {
      const p = db.products.find((x) => x.id === v.product_id);
      if (!p || p.archived_at) continue;
      const s = matchScore(term, `${p.name} ${variantLabel(v.title)}`, [v.sku, v.barcode ?? '']);
      if (s > 0) out.push({ s, h: hitOf(p, v) });
    }
    return out.sort((a, b) => b.s - a.s).slice(0, limit).map((x) => x.h);
  }
  const sel = 'id,product_id,title,sku,barcode,price,min_stock,available_qty,products!inner(name,cover_key,track_serials,track_expiry,archived_at)';
  type Row = ProductVariant & { products: Pick<Product, 'name' | 'cover_key' | 'track_serials' | 'track_expiry' | 'archived_at'> };
  const toHit = (r: Row): VariantHit => hitOf({ ...r.products, id: r.product_id }, r);
  const [byCode, byName] = await Promise.all([
    sb().from('product_variants').select(sel).or(`sku.ilike.${like(term)},barcode.eq.${term.replace(/[^\w-]/g, '')}`).is('products.archived_at', null).limit(limit),
    (() => {
      let qb = sb().from('product_variants').select(sel).is('products.archived_at', null);
      for (const t of tokens(term)) qb = qb.ilike('products.search_text', like(t));
      return qb.limit(limit);
    })(),
  ]);
  if (byCode.error) throw byCode.error;
  const seen = new Set<string>();
  const hits: VariantHit[] = [];
  for (const r of [...((byCode.data ?? []) as unknown as Row[]), ...((byName.data ?? []) as unknown as Row[])]) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    hits.push(toHit(r));
  }
  return hits.slice(0, limit);
}

type HitProduct = Pick<Product, 'id' | 'name' | 'cover_key' | 'track_serials'> & { track_expiry?: boolean };
function hitOf(p: HitProduct, v: Pick<ProductVariant, 'id' | 'title' | 'sku' | 'barcode' | 'price' | 'min_stock' | 'available_qty'>, unit?: Pick<VariantUnit, 'unit_name' | 'factor'> | null): VariantHit {
  return {
    variant_id: v.id, product_id: p.id, name: p.name, title: variantLabel(v.title), sku: v.sku, barcode: v.barcode, price: Number(v.price), cover_key: p.cover_key,
    track_serials: p.track_serials, track_expiry: !!p.track_expiry, min_stock: Number(v.min_stock), available_qty: Number(v.available_qty),
    unit_name: unit?.unit_name ?? null, factor: unit ? Number(unit.factor) : 1,
  };
}

/** مطابقة تامة لرمز ممسوح (باركود أو SKU) */
export async function findVariantByCode(code: string): Promise<VariantHit | null> {
  const c = code.trim();
  if (!c) return null;
  if (IS_DEMO) {
    const db = ddb();
    const unit = db.variant_units.find((u) => u.barcode === c);
    const v = unit ? db.product_variants.find((x) => x.id === unit.variant_id) : db.product_variants.find((x) => x.barcode === c || x.sku.toLowerCase() === c.toLowerCase());
    const p = v && db.products.find((x) => x.id === v.product_id);
    return v && p && !p.archived_at ? hitOf(p, v, unit) : null;
  }
  // باركود وحدة تعبئة (كرتونة = عدة قطع)
  if (/^[\w-]{4,}$/.test(c)) {
    const { data: u } = await sb().from('variant_units').select('unit_name,factor,product_variants!inner(id,product_id,title,sku,barcode,price,min_stock,available_qty,products!inner(name,cover_key,track_serials,track_expiry,archived_at))').eq('barcode', c).is('product_variants.products.archived_at', null).limit(1);
    const row = (u?.[0] ?? null) as unknown as ({ unit_name: string; factor: number; product_variants: ProductVariant & { products: Pick<Product, 'name' | 'cover_key' | 'track_serials' | 'track_expiry'> } }) | null;
    if (row) return hitOf({ ...row.product_variants.products, id: row.product_variants.product_id }, row.product_variants, row);
  }
  // المؤرشف لا يُطابَق (كوضع العرض). الباركود مطابقة تامة، ثم SKU بلا حالة أحرف مع تهريب أحرف LIKE (SKU قد يحوي _ أو %)
  const sel = 'id,product_id,title,sku,barcode,price,min_stock,available_qty,products!inner(name,cover_key,track_serials,track_expiry,archived_at)';
  const byBarcode = await sb().from('product_variants').select(sel).eq('barcode', c).is('products.archived_at', null).limit(1);
  if (byBarcode.error) throw byBarcode.error;
  let data = byBarcode.data;
  if (!data?.length) {
    const bySku = await sb().from('product_variants').select(sel).ilike('sku', c.replace(/[\\%_]/g, (x) => `\\${x}`)).is('products.archived_at', null).limit(1);
    if (bySku.error) throw bySku.error;
    data = bySku.data;
  }
  const r = (data?.[0] ?? null) as unknown as (ProductVariant & { products: Pick<Product, 'name' | 'cover_key' | 'track_serials' | 'track_expiry'> }) | null;
  return r ? hitOf({ ...r.products, id: r.product_id }, r) : null;
}

/** نسخ بالمعرّفات (لملء فاتورة الشراء من «النواقص») */
export async function variantsByIds(ids: string[]): Promise<VariantHit[]> {
  if (!ids.length) return [];
  if (IS_DEMO) {
    const db = ddb();
    return ids.flatMap((id) => {
      const v = db.product_variants.find((x) => x.id === id);
      const p = v && db.products.find((x) => x.id === v.product_id);
      return v && p ? [hitOf(p, v)] : [];
    });
  }
  const { data, error } = await sb().from('product_variants').select('id,product_id,title,sku,barcode,price,min_stock,available_qty,products!inner(name,cover_key,track_serials,track_expiry)').in('id', ids);
  if (error) throw error;
  return ((data ?? []) as unknown as (ProductVariant & { products: Pick<Product, 'name' | 'cover_key' | 'track_serials' | 'track_expiry'> })[]).map((r) => hitOf({ ...r.products, id: r.product_id }, r));
}

// ------------------------------------------------------------------ الأقسام والعلامات

export async function listCategories(): Promise<Category[]> {
  if (IS_DEMO) { await demoDelay(80); return structuredClone(ddb().categories).sort((a, b) => a.sort - b.sort); }
  const { data, error } = await sb().from('categories').select('*').order('sort').order('name');
  if (error) throw error;
  return (data ?? []) as Category[];
}

export async function listBrands(): Promise<Brand[]> {
  if (IS_DEMO) { await demoDelay(80); return structuredClone(ddb().brands).sort((a, b) => a.sort - b.sort); }
  const { data, error } = await sb().from('brands').select('*').order('sort').order('name');
  if (error) throw error;
  return (data ?? []) as Brand[];
}

/** عدد المنتجات (غير المؤرشفة) لكل قسم ولكل علامة */
export async function catalogCounts(): Promise<{ byCategory: Record<string, number>; byBrand: Record<string, number> }> {
  const tally = (rows: { category_id: string | null; brand_id: string | null }[]) => {
    const byCategory: Record<string, number> = {};
    const byBrand: Record<string, number> = {};
    for (const r of rows) {
      if (r.category_id) byCategory[r.category_id] = (byCategory[r.category_id] ?? 0) + 1;
      if (r.brand_id) byBrand[r.brand_id] = (byBrand[r.brand_id] ?? 0) + 1;
    }
    return { byCategory, byBrand };
  };
  if (IS_DEMO) return tally(ddb().products.filter((p) => !p.archived_at));
  return tally(await fetchAll<{ category_id: string | null; brand_id: string | null }>((a, b) => sb().from('products').select('category_id,brand_id').is('archived_at', null).order('id').range(a, b)));
}

export type CategoryDraft = Pick<Category, 'name' | 'parent_id' | 'description' | 'image_key' | 'icon' | 'is_visible'> & { id?: string; slug?: string; sort?: number };

export async function saveCategory(c: CategoryDraft): Promise<Category> {
  const name = c.name.trim();
  if (!name) throw new AppError('اكتب اسم القسم.');
  if (IS_DEMO) {
    await demoDelay(150);
    const db = ddb();
    if (c.parent_id && db.categories.find((x) => x.id === c.parent_id)?.parent_id) throw new AppError('الأقسام بمستويين فقط: لا يمكن إضافة قسم تحت قسم فرعي.');
    if (c.id) {
      const cur = db.categories.find((x) => x.id === c.id);
      if (!cur) throw new AppError('لم نجد هذا القسم.');
      if (c.parent_id && db.categories.some((x) => x.parent_id === c.id)) throw new AppError('هذا القسم له أقسام فرعية، فلا يمكن جعله فرعياً.');
      Object.assign(cur, { ...c, name, slug: c.slug?.trim() || cur.slug });
      return structuredClone(cur);
    }
    let slug = c.slug?.trim() || slugify(name);
    if (db.categories.some((x) => x.slug === slug)) slug = `${slug}-${Math.random().toString(36).slice(2, 5)}`;
    const row: Category = { id: demoId(), parent_id: c.parent_id, name, slug, description: c.description, image_key: c.image_key, icon: c.icon, sort: c.sort ?? db.categories.length + 1, is_visible: c.is_visible, created_at: demoNow() };
    db.categories.push(row);
    return structuredClone(row);
  }
  const body = { parent_id: c.parent_id, name, description: c.description, image_key: c.image_key, icon: c.icon, is_visible: c.is_visible, ...(c.sort !== undefined ? { sort: c.sort } : {}) };
  if (c.id) {
    const { data, error } = await sb().from('categories').update({ ...body, ...(c.slug ? { slug: c.slug } : {}) }).eq('id', c.id).select().single();
    if (error) throw error;
    return data as Category;
  }
  const slug = c.slug?.trim() || slugify(name);
  let res = await sb().from('categories').insert({ ...body, slug }).select().single();
  if (res.error?.code === '23505') res = await sb().from('categories').insert({ ...body, slug: `${slug}-${Math.random().toString(36).slice(2, 5)}` }).select().single();
  if (res.error) throw res.error;
  return res.data as Category;
}

export async function deleteCategory(id: string): Promise<void> {
  if (IS_DEMO) {
    await demoDelay(120);
    const db = ddb();
    if (db.categories.some((c) => c.parent_id === id)) throw new AppError('احذف الأقسام الفرعية أولاً أو انقلها لقسم آخر.');
    // مثل قاعدة البيانات: products.category_id on delete set null
    for (const p of db.products) if (p.category_id === id) p.category_id = null;
    db.categories = db.categories.filter((c) => c.id !== id);
    return;
  }
  const { error } = await sb().from('categories').delete().eq('id', id);
  // categories.parent_id on delete restrict: القسم الذي له فروع لا يُحذف
  if (error?.code === '23503') throw new AppError('احذف الأقسام الفرعية أولاً أو انقلها لقسم آخر.');
  if (error) throw error;
}

/** حفظ الترتيب (والأب عند السحب بين الأقسام) */
export async function reorderCategories(rows: { id: string; sort: number; parent_id: string | null }[]): Promise<void> {
  if (IS_DEMO) {
    await demoDelay(100);
    for (const r of rows) { const c = ddb().categories.find((x) => x.id === r.id); if (c) { c.sort = r.sort; c.parent_id = r.parent_id; } }
    return;
  }
  const results = await Promise.all(rows.map((r) => sb().from('categories').update({ sort: r.sort, parent_id: r.parent_id }).eq('id', r.id)));
  const bad = results.find((r) => r.error);
  if (bad?.error) throw bad.error;
}

export type BrandDraft = Pick<Brand, 'name' | 'logo_key'> & { id?: string; sort?: number };

export async function saveBrand(b: BrandDraft): Promise<Brand> {
  const name = b.name.trim();
  if (!name) throw new AppError('اكتب اسم العلامة التجارية.');
  if (IS_DEMO) {
    await demoDelay(120);
    const db = ddb();
    if (db.brands.some((x) => x.name.toLowerCase() === name.toLowerCase() && x.id !== b.id)) throw new AppError('هذه العلامة موجودة من قبل.');
    if (b.id) {
      const cur = db.brands.find((x) => x.id === b.id);
      if (!cur) throw new AppError('لم نجد هذه العلامة.');
      Object.assign(cur, { name, logo_key: b.logo_key });
      return structuredClone(cur);
    }
    const row: Brand = { id: demoId(), name, slug: slugify(name), logo_key: b.logo_key, sort: b.sort ?? db.brands.length + 1, created_at: demoNow() };
    db.brands.push(row);
    return structuredClone(row);
  }
  if (b.id) {
    const { data, error } = await sb().from('brands').update({ name, logo_key: b.logo_key }).eq('id', b.id).select().single();
    if (error) throw error;
    return data as Brand;
  }
  const { data, error } = await sb().from('brands').insert({ name, slug: slugify(name), logo_key: b.logo_key, sort: b.sort ?? 0 }).select().single();
  if (error) throw error;
  return data as Brand;
}

export async function deleteBrand(id: string): Promise<void> {
  if (IS_DEMO) {
    await demoDelay(120);
    const db = ddb();
    if (db.products.some((p) => p.brand_id === id)) throw new AppError('لا يمكن حذف علامة عليها منتجات.');
    db.brands = db.brands.filter((b) => b.id !== id);
    return;
  }
  const { error } = await sb().from('brands').delete().eq('id', id);
  if (error) throw error;
}

export async function reorderBrands(rows: { id: string; sort: number }[]): Promise<void> {
  if (IS_DEMO) {
    for (const r of rows) { const b = ddb().brands.find((x) => x.id === r.id); if (b) b.sort = r.sort; }
    return;
  }
  const results = await Promise.all(rows.map((r) => sb().from('brands').update({ sort: r.sort }).eq('id', r.id)));
  const bad = results.find((r) => r.error);
  if (bad?.error) throw bad.error;
}

// ------------------------------------------------------------------ الأرقام التسلسلية

export interface SerialRow extends Serial { variant_title: string; sku: string; warehouse_name: string | null }

export async function listSerials(variantIds: string[]): Promise<SerialRow[]> {
  if (!variantIds.length) return [];
  if (IS_DEMO) {
    await demoDelay(100);
    const db = ddb();
    return db.serials.filter((s) => variantIds.includes(s.variant_id)).map((s) => {
      const v = db.product_variants.find((x) => x.id === s.variant_id);
      return { ...s, variant_title: v?.title ?? '', sku: v?.sku ?? '', warehouse_name: db.warehouses.find((w) => w.id === s.warehouse_id)?.name ?? null };
    }).sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
  const data = await fetchAll<Serial & { product_variants: { title: string; sku: string } | null; warehouses: { name: string } | null }>((a, b) => sb().from('serials').select('*, product_variants(title,sku), warehouses(name)').in('variant_id', variantIds).order('created_at', { ascending: false }).order('id').range(a, b));
  return data.map(({ product_variants, warehouses, ...s }) => ({
    ...s, variant_title: product_variants?.title ?? '', sku: product_variants?.sku ?? '', warehouse_name: warehouses?.name ?? null,
  }));
}

/** إضافة سريالات لقطع موجودة فعلاً في المخزن (بلا حركة مخزون) */
export async function addSerials(variantId: string, warehouseId: string, serials: string[]): Promise<number> {
  const list = [...new Set(serials.map((s) => s.trim()).filter(Boolean))];
  if (!list.length) throw new AppError('لم تُدخل أي رقم تسلسلي.');
  if (IS_DEMO) {
    await demoDelay(150);
    const db = ddb();
    const dup = list.filter((s) => db.serials.some((x) => x.variant_id === variantId && x.serial === s));
    if (dup.length) throw new AppError(`هذه الأرقام مسجلة من قبل: ${dup.slice(0, 3).join('، ')}${dup.length > 3 ? '…' : ''}`);
    const now = demoNow();
    for (const s of list) db.serials.push({ id: demoId(), variant_id: variantId, serial: s, status: 'in_stock', warehouse_id: warehouseId, purchase_invoice_id: null, sale_invoice_id: null, note: null, created_at: now, updated_at: now });
    return list.length;
  }
  // للقطع الموجودة فعلاً (لا يتغير الرصيد): الخادم يرفض المكرر وما يزيد عن رصيد المخزن
  const r = await rpc<{ added: number }>('add_serials', { p_variant: variantId, p_warehouse: warehouseId, p_serials: list });
  return Number(r?.added ?? list.length);
}

export async function setSerialStatus(id: string, status: SerialStatus): Promise<void> {
  if (IS_DEMO) {
    const s = ddb().serials.find((x) => x.id === id);
    if (s) { s.status = status; s.updated_at = demoNow(); }
    return;
  }
  // على الخادم: «معيب» فقط، ويُخرج القطعة من الرصيد كتالف (لا عودة للمخزن من هنا)
  if (status !== 'defective') throw new AppError('إرجاع القطعة المعيبة للمخزن يتم بسند إدخال.');
  await rpc('mark_serial_defective', { p_id: id });
}

// ------------------------------------------------------------------ الإعدادات

/** مقاس ملصق الباركود من إعدادات الفواتير */
export async function getLabelSize(): Promise<{ width_mm: number; height_mm: number }> {
  if (IS_DEMO) return (ddb().settings.invoice as InvoiceSettings | undefined)?.label_size ?? DEFAULT_LABEL_SIZE;
  const { data } = await sb().from('app_settings').select('value').eq('key', 'invoice').maybeSingle();
  const size = (data?.value as InvoiceSettings | undefined)?.label_size;
  return size?.width_mm && size?.height_mm ? size : DEFAULT_LABEL_SIZE;
}
