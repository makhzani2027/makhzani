/**
 * مسودة نموذج المنتج: تحويل ProductFull ↔ مسودة ↔ حمولة upsert_product، وتوليد مصفوفة النسخ من الخيارات، والتحقق.
 */
import type { ProductSpec } from '@raqeem/shared';
import type { ProductFull, UnitDraft, UpsertProductPayload } from '../api';

export interface OptionDraft { name: string; values: string[] }

export interface VariantDraft {
  /** مفتاح محلي ثابت للصف */
  k: string;
  id?: string;
  title: string;
  options: Record<string, string>;
  sku: string;
  barcode: string;
  price: number | null;
  compare_at_price: number | null;
  wholesale_price: number | null;
  cost: number | null;
  min_stock: number | null;
  is_active: boolean;
  units: UnitDraft[];
  /** للنسخ الجديدة: الرصيد الافتتاحي لكل مخزن */
  opening: Record<string, { qty: number | null; lot_code: string; expiry_date: string }>;
}

export interface ImageDraft { key: string; alt: string | null }

export interface ProductDraft {
  id?: string;
  name: string;
  slug: string;
  description: string;
  category_id: string;
  brand_id: string;
  unit: string;
  tags: string[];
  specs: ProductSpec[];
  warranty: string;
  options: OptionDraft[];
  track_serials: boolean;
  track_expiry: boolean;
  is_published: boolean;
  is_featured: boolean;
  allow_request: boolean;
  images: ImageDraft[];
  variants: VariantDraft[];
}

let seq = 0;
export const localKey = () => `k${Date.now().toString(36)}${(seq++).toString(36)}`;

export const DEFAULT_TITLE = 'افتراضي';

export function emptyVariant(over: Partial<VariantDraft> = {}): VariantDraft {
  return {
    k: localKey(), title: DEFAULT_TITLE, options: {}, sku: '', barcode: '', price: null, compare_at_price: null, wholesale_price: null, cost: null,
    min_stock: 0, is_active: true, units: [], opening: {}, ...over,
  };
}

export function emptyDraft(): ProductDraft {
  return {
    name: '', slug: '', description: '', category_id: '', brand_id: '', unit: 'قطعة', tags: [], specs: [], warranty: '', options: [],
    track_serials: false, track_expiry: false, is_published: true, is_featured: false, allow_request: true, images: [], variants: [emptyVariant()],
  };
}

export function toDraft(f: ProductFull): ProductDraft {
  const p = f.product;
  const options: OptionDraft[] = p.option_names.map((name) => ({
    name, values: [...new Set(f.variants.map((v) => v.options[name]).filter((x): x is string => !!x))],
  }));
  return {
    id: p.id, name: p.name, slug: p.slug, description: p.description ?? '', category_id: p.category_id ?? '', brand_id: p.brand_id ?? '', unit: p.unit || 'قطعة',
    tags: [...p.tags], specs: p.specs.map((s) => ({ ...s })), warranty: p.warranty ?? '', options, track_serials: p.track_serials, track_expiry: p.track_expiry,
    is_published: p.is_published, is_featured: p.is_featured, allow_request: p.allow_request,
    images: f.images.map((i) => ({ key: i.key, alt: i.alt })),
    variants: (f.variants.length ? f.variants : []).map((v) => ({
      k: v.id, id: v.id, title: v.title, options: { ...v.options }, sku: v.sku, barcode: v.barcode ?? '', price: v.price, compare_at_price: v.compare_at_price,
      wholesale_price: v.wholesale_price, cost: f.costs ? f.costs[v.id] ?? 0 : null, min_stock: v.min_stock, is_active: v.is_active,
      units: f.units.filter((u) => u.variant_id === v.id).map((u) => ({ id: u.id, unit_name: u.unit_name, factor: u.factor, barcode: u.barcode, price: u.price })),
      opening: {},
    })),
  };
}

/** كل التركيبات من قيم الخيارات (اللون × المقاس…) */
function combos(options: OptionDraft[]): Record<string, string>[] {
  const opts = options.filter((o) => o.name.trim() && o.values.length);
  return opts.reduce<Record<string, string>[]>((acc, o) => acc.flatMap((c) => o.values.map((v) => ({ ...c, [o.name.trim()]: v }))), [{}]);
}

export const titleOf = (options: OptionDraft[], combo: Record<string, string>) =>
  options.filter((o) => o.name.trim() && combo[o.name.trim()]).map((o) => combo[o.name.trim()]).join(' / ') || DEFAULT_TITLE;

/**
 * يعيد بناء النسخ بعد تغيير الخيارات: يحتفظ بالنسخة التي تطابق تركيبتها (بسعرها وباركودها)، ويضيف الجديدة بسعر أول نسخة،
 * والنسخ المحفوظة التي خرجت من المصفوفة تبقى معطّلة (لها حركات محتملة) بدل أن تختفي.
 */
export function rebuildVariants(d: ProductDraft): VariantDraft[] {
  const list = combos(d.options);
  const names = d.options.filter((o) => o.name.trim() && o.values.length).map((o) => o.name.trim());
  const sameCombo = (a: Record<string, string>, b: Record<string, string>) => names.length > 0 && names.every((n) => a[n] === b[n]);
  const template = d.variants[0];
  const used = new Set<string>();
  const out: VariantDraft[] = list.map((c) => {
    const hit = d.variants.find((v) => !used.has(v.k) && (names.length ? sameCombo(v.options, c) : Object.keys(v.options).length === 0 || v.title === DEFAULT_TITLE))
      ?? (!names.length ? d.variants.find((v) => !used.has(v.k)) : undefined);
    if (hit) { used.add(hit.k); return { ...hit, options: c, title: titleOf(d.options, c), is_active: hit.is_active }; }
    return emptyVariant({
      options: c, title: titleOf(d.options, c), price: template?.price ?? null, compare_at_price: template?.compare_at_price ?? null,
      wholesale_price: template?.wholesale_price ?? null, cost: template?.cost ?? null, min_stock: template?.min_stock ?? 0,
    });
  });
  for (const v of d.variants) if (!used.has(v.k) && v.id) out.push({ ...v, is_active: false });
  return out;
}

export type TabKey = 'basic' | 'images' | 'pricing' | 'stock' | 'specs' | 'serials' | 'store' | 'codes';

export interface DraftErrors {
  name?: string;
  options?: string;
  variants: Record<string, { sku?: string; barcode?: string; price?: string; units?: string }>;
  byTab: Partial<Record<TabKey, number>>;
}

export function validate(d: ProductDraft): DraftErrors {
  const e: DraftErrors = { variants: {}, byTab: {} };
  const bump = (t: TabKey) => { e.byTab[t] = (e.byTab[t] ?? 0) + 1; };
  if (!d.name.trim()) { e.name = 'اسم المنتج إلزامي'; bump('basic'); }
  if (d.options.some((o) => o.name.trim() && !o.values.length)) { e.options = 'أضف قيمة واحدة على الأقل لكل خيار'; bump('pricing'); }
  const skus = new Map<string, number>();
  const codes = new Map<string, number>();
  for (const v of d.variants) {
    skus.set(v.sku.trim().toLowerCase(), (skus.get(v.sku.trim().toLowerCase()) ?? 0) + 1);
    for (const c of [v.barcode, ...v.units.map((u) => u.barcode ?? '')]) if (c.trim()) codes.set(c.trim(), (codes.get(c.trim()) ?? 0) + 1);
  }
  for (const v of d.variants) {
    const ve: DraftErrors['variants'][string] = {};
    if (!v.sku.trim()) ve.sku = 'SKU إلزامي';
    else if ((skus.get(v.sku.trim().toLowerCase()) ?? 0) > 1) ve.sku = 'مكرر';
    if (v.barcode.trim() && !/^[\w-]{3,}$/.test(v.barcode.trim())) ve.barcode = 'رمز غير صالح';
    else if (v.barcode.trim() && (codes.get(v.barcode.trim()) ?? 0) > 1) ve.barcode = 'مكرر';
    if (v.is_active && (v.price === null || v.price < 0)) ve.price = 'السعر إلزامي';
    if (v.compare_at_price !== null && v.price !== null && v.compare_at_price > 0 && v.compare_at_price <= v.price) ve.price = 'السعر قبل الخصم يجب أن يكون أعلى';
    if (v.units.some((u) => !u.unit_name.trim() || !(u.factor > 1))) ve.units = 'اسم الوحدة وعدد قطعها (أكثر من ١) إلزاميان';
    else if (v.units.some((u) => u.barcode && (codes.get(u.barcode.trim()) ?? 0) > 1)) ve.units = 'باركود وحدة مكرر';
    if (Object.keys(ve).length) {
      e.variants[v.k] = ve;
      if (ve.sku || ve.price) bump('pricing');
      if (ve.barcode || ve.units) bump('codes');
    }
  }
  return e;
}

export const hasErrors = (e: DraftErrors) => Object.values(e.byTab).some((n) => (n ?? 0) > 0);

export function toPayload(d: ProductDraft, withCosts: boolean): UpsertProductPayload {
  const optionNames = d.options.filter((o) => o.name.trim() && o.values.length).map((o) => o.name.trim());
  return {
    ...(d.id ? { id: d.id } : {}),
    name: d.name.trim(), ...(d.slug.trim() ? { slug: d.slug.trim() } : {}), description: d.description.trim() || null,
    category_id: d.category_id || null, brand_id: d.brand_id || null, unit: d.unit.trim() || 'قطعة', tags: d.tags, specs: d.specs.filter((s) => s.label.trim() && s.value.trim()),
    warranty: d.warranty.trim() || null, option_names: optionNames, has_variants: optionNames.length > 0, track_serials: d.track_serials, track_expiry: d.track_expiry,
    is_published: d.is_published, is_featured: d.is_featured, allow_request: d.allow_request,
    images: d.images.map((im, i) => ({ key: im.key, alt: im.alt, sort: i })),
    variants: d.variants.map((v, i) => {
      const opening = Object.entries(v.opening).filter(([, o]) => (o.qty ?? 0) > 0).map(([warehouse_id, o]) => ({
        warehouse_id, qty: o.qty ?? 0, ...(d.track_expiry && o.lot_code.trim() ? { lot_code: o.lot_code.trim() } : {}), ...(d.track_expiry && o.expiry_date ? { expiry_date: o.expiry_date } : {}),
      }));
      return {
        ...(v.id ? { id: v.id } : {}), title: v.title, options: v.options, sku: v.sku.trim(), barcode: v.barcode.trim() || null, price: v.price ?? 0,
        compare_at_price: v.compare_at_price || null, wholesale_price: v.wholesale_price || null, ...(withCosts && v.cost !== null ? { cost: v.cost } : {}),
        min_stock: v.min_stock ?? 0, is_active: v.is_active, sort: i,
        units: v.units.map((u) => ({ ...(u.id ? { id: u.id } : {}), unit_name: u.unit_name.trim(), factor: u.factor, barcode: u.barcode?.trim() || null, price: u.price })),
        ...(!v.id && opening.length ? { opening } : {}),
      };
    }),
  };
}
