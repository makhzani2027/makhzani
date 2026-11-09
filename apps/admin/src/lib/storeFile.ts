/**
 * ملف بيانات المتجر (raqeem-store) — ينقل المتجر من اللوحة أونلاين إلى برنامج الحاسوب:
 *   الاسم والشعار، الأقسام، العلامات التجارية، المنتجات بأنواعها وأسعارها وكلفتها وكمياتها.
 * التصدير: من صفحة «برنامج الحاسوب» أونلاين. الاستيراد: عند إنشاء حساب شركة في برنامج الحاسوب.
 * لا يحوي كلمات سر ولا زبائن ولا فواتير.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { defaultMediaBase, mediaUrl } from '@raqeem/shared';
import { sb } from './supabase';
import { ONLINE_SUPABASE_ANON_KEY, ONLINE_SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_URL } from './env';
import { imgUrl } from './media';

export const STORE_FILE_FORMAT = 'raqeem-store/1';

export interface StoreFileVariant {
  title: string; options: Record<string, string>; sku: string | null; barcode: string | null;
  price: number; compare_at_price: number | null; wholesale_price: number | null; min_stock: number;
  is_active: boolean; sort: number; cost: number | null; qty: number;
}
export interface StoreFileProduct {
  name: string; description: string | null; category: string | null; brand: string | null; unit: string | null;
  tags: string[]; specs: unknown[]; warranty: string | null; option_names: string[]; is_published: boolean; is_featured: boolean;
  variants: StoreFileVariant[];
}
export interface StoreFile {
  format: typeof STORE_FILE_FORMAT;
  exported_at: string;
  store: { name: string; logo: { data: string; type: string } | null };
  categories: { key: string; parent: string | null; name: string; description: string | null; icon: string | null; sort: number; is_visible: boolean }[];
  brands: { key: string; name: string; sort: number }[];
  products: StoreFileProduct[];
}

async function all<T>(q: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await q(from, from + 999);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < 1000) return out;
  }
}

const blobToB64 = (b: Blob) => new Promise<string>((resolve, reject) => {
  const rd = new FileReader();
  rd.onload = () => resolve(String(rd.result).split(',')[1] ?? '');
  rd.onerror = () => reject(new Error('تعذّرت قراءة الشعار.'));
  rd.readAsDataURL(b);
});

/** يجمع بيانات متجر المستخدم الحالي (RLS: متجره وحده) */
export async function exportStoreFile(store: { name: string; logo_key: string | null }, opts: { client?: SupabaseClient; mediaBase?: string } = {}): Promise<StoreFile> {
  const db = opts.client ?? sb();
  let logo: StoreFile['store']['logo'] = null;
  const url = opts.mediaBase ? mediaUrl(store.logo_key, 'lg', opts.mediaBase) : imgUrl(store.logo_key, 'lg');
  if (url) {
    try {
      const r = await fetch(url);
      if (r.ok) { const b = await r.blob(); logo = { data: await blobToB64(b), type: b.type || 'image/webp' }; }
    } catch { /* بلا شعار */ }
  }
  type Cat = { id: string; parent_id: string | null; name: string; description: string | null; icon: string | null; sort: number; is_visible: boolean };
  type Br = { id: string; name: string; sort: number };
  type Var = { id: string; title: string; options: Record<string, string> | null; sku: string | null; barcode: string | null; price: number; compare_at_price: number | null;
    wholesale_price: number | null; min_stock: number; is_active: boolean; sort: number; available_qty: number };
  type Prod = { id: string; name: string; description: string | null; category_id: string | null; brand_id: string | null; unit: string | null; tags: string[] | null;
    specs: unknown[] | null; warranty: string | null; option_names: string[] | null; is_published: boolean; is_featured: boolean; product_variants: Var[] };
  const [cats, brands, prods] = await Promise.all([
    all<Cat>((a, b) => db.from('categories').select('id, parent_id, name, description, icon, sort, is_visible').order('sort').range(a, b)),
    all<Br>((a, b) => db.from('brands').select('id, name, sort').order('sort').range(a, b)),
    all<Prod>((a, b) => db.from('products').select('id, name, description, category_id, brand_id, unit, tags, specs, warranty, option_names, is_published, is_featured, product_variants(id, title, options, sku, barcode, price, compare_at_price, wholesale_price, min_stock, is_active, sort, available_qty)')
      .is('archived_at', null).order('created_at').range(a, b)),
  ]);
  // الكلفة لمن يملك صلاحيتها؛ غيرهم يصدّر بلا كلفة
  const costs = new Map<string, number>();
  try {
    const rows = await all<{ variant_id: string; avg_cost: number }>((a, b) => db.from('variant_costs').select('variant_id, avg_cost').range(a, b));
    rows.forEach((r) => costs.set(r.variant_id, Number(r.avg_cost)));
  } catch { /* بلا كلفة */ }
  return {
    format: STORE_FILE_FORMAT,
    exported_at: new Date().toISOString(),
    store: { name: store.name, logo },
    categories: cats.map((c) => ({ key: c.id, parent: c.parent_id, name: c.name, description: c.description, icon: c.icon, sort: c.sort, is_visible: c.is_visible })),
    brands: brands.map((b) => ({ key: b.id, name: b.name, sort: b.sort })),
    products: prods.map((p) => ({
      name: p.name, description: p.description, category: p.category_id, brand: p.brand_id,
      unit: p.unit, tags: p.tags ?? [], specs: p.specs ?? [], warranty: p.warranty, option_names: p.option_names ?? [], is_published: p.is_published, is_featured: p.is_featured,
      variants: [...(p.product_variants ?? [])].sort((a, b) => a.sort - b.sort).map((v) => ({
        title: v.title, options: v.options ?? {}, sku: v.sku, barcode: v.barcode, price: Number(v.price), compare_at_price: v.compare_at_price == null ? null : Number(v.compare_at_price),
        wholesale_price: v.wholesale_price == null ? null : Number(v.wholesale_price), min_stock: Number(v.min_stock ?? 0), is_active: v.is_active, sort: v.sort,
        cost: costs.get(v.id) ?? null, qty: Math.max(0, Number(v.available_qty ?? 0)),
      })),
    })),
  };
}

export function downloadStoreFile(f: StoreFile): void {
  const blob = new Blob([JSON.stringify(f)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  const day = f.exported_at.slice(0, 10);
  a.download = `raqeem-store-${day}.raqeem.json`;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

export async function readStoreFile(file: File): Promise<StoreFile> {
  let j: StoreFile;
  try { j = JSON.parse(await file.text()) as StoreFile; } catch { throw new Error('الملف ليس ملف بيانات متجر من رقيم.'); }
  if (!j || j.format !== STORE_FILE_FORMAT || !j.store || !Array.isArray(j.products)) throw new Error('الملف ليس ملف بيانات متجر من رقيم.');
  return j;
}

/** يستورد الأقسام والعلامات والمنتجات إلى حساب برنامج الحاسوب صاحب الجلسة token (قبل فتح اللوحة). يعيد عدد المنتجات المستوردة والفاشلة. */
export async function importStoreFile(f: StoreFile, token: string, onProgress?: (done: number, total: number) => void): Promise<{ ok: number; failed: string[] }> {
  const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false, storageKey: 'rq.import' },
  });
  const slug = (s: string) => `${s.toLowerCase().replace(/[^a-z0-9؀-ۿ]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'x'}-${Math.random().toString(36).slice(2, 6)}`;
  const { data: exCats } = await db.from('categories').select('id, name, parent_id');
  const { data: exBrands } = await db.from('brands').select('id, name');
  const catId = new Map<string, string>();
  const brandId = new Map<string, string>();
  // الأقسام الرئيسية أولاً ثم الفرعية
  const cats = [...(f.categories ?? [])].sort((a, b) => Number(!!a.parent) - Number(!!b.parent));
  for (const c of cats) {
    const parent = c.parent ? catId.get(c.parent) ?? null : null;
    const same = (exCats ?? []).find((x) => x.name === c.name && (x.parent_id ?? null) === parent);
    if (same) { catId.set(c.key, same.id); continue; }
    const { data, error } = await db.from('categories').insert({ name: c.name, slug: slug(c.name), parent_id: parent, description: c.description, icon: c.icon, sort: c.sort, is_visible: c.is_visible }).select('id').single();
    if (!error && data) catId.set(c.key, data.id as string);
  }
  for (const b of f.brands ?? []) {
    const same = (exBrands ?? []).find((x) => x.name === b.name);
    if (same) { brandId.set(b.key, same.id); continue; }
    const { data, error } = await db.from('brands').insert({ name: b.name, slug: slug(b.name), sort: b.sort }).select('id').single();
    if (!error && data) brandId.set(b.key, data.id as string);
  }
  let ok = 0;
  const failed: string[] = [];
  const total = f.products.length;
  for (const [i, p] of f.products.entries()) {
    const body = {
      name: p.name, description: p.description, unit: p.unit, tags: p.tags, specs: p.specs, warranty: p.warranty, option_names: p.option_names,
      is_published: p.is_published, is_featured: p.is_featured,
      category_id: p.category ? catId.get(p.category) ?? null : null, brand_id: p.brand ? brandId.get(p.brand) ?? null : null,
      variants: p.variants.map((v) => ({
        title: v.title, options: v.options, sku: v.sku, barcode: v.barcode, price: v.price, compare_at_price: v.compare_at_price, wholesale_price: v.wholesale_price,
        min_stock: v.min_stock, is_active: v.is_active, sort: v.sort, ...(v.cost != null ? { cost: v.cost } : {}), ...(v.qty > 0 ? { opening_qty: v.qty } : {}),
      })),
    };
    const { error } = await db.rpc('upsert_product', { p: body });
    if (error) failed.push(`${p.name}: ${error.message}`); else ok++;
    onProgress?.(i + 1, total);
  }
  return { ok, failed };
}

/** هل يمكن جلب بيانات المتجر من رقيم أونلاين؟ (نسخة الحاسوب المبنية بعنوان المنصة) */
export const CAN_FETCH_ONLINE = !!(ONLINE_SUPABASE_URL && ONLINE_SUPABASE_ANON_KEY);

/**
 * نسخة الحاسوب: يدخل بحساب صاحب المتجر أونلاين (بريد أو هاتف + كلمة السر) مرة واحدة، ويجلب بيانات متجره
 * بنفس صيغة ملف المتجر، ثم يخرج. لا تُحفظ كلمة السر ولا الجلسة أونلاين في البرنامج.
 */
export async function fetchOnlineStore(identifier: string, password: string): Promise<StoreFile> {
  if (!CAN_FETCH_ONLINE) throw new Error('هذه النسخة لا تحوي عنوان رقيم أونلاين.');
  const online = createClient(ONLINE_SUPABASE_URL, ONLINE_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false, storageKey: 'rq.online-import' } });
  const id = identifier.trim();
  try {
    if (id.includes('@')) {
      const { error } = await online.auth.signInWithPassword({ email: id, password });
      if (error) throw new Error(/invalid/i.test(error.message) ? 'البريد أو كلمة السر غير صحيحة.' : error.message);
    } else {
      const { data, error } = await online.functions.invoke('login', { body: { identifier: id, password } });
      if (error || !data?.access_token) throw new Error('رقم الهاتف أو كلمة السر غير صحيحة.');
      const { error: e2 } = await online.auth.setSession({ access_token: data.access_token, refresh_token: data.refresh_token });
      if (e2) throw e2;
    }
    const { data: st, error: se } = await online.rpc('my_store');
    if (se || !st) throw new Error('لم نجد متجراً مرتبطاً بهذا الحساب.');
    const store = st as { name: string; logo_key: string | null; status?: string };
    return await exportStoreFile({ name: store.name, logo_key: store.logo_key }, { client: online, mediaBase: defaultMediaBase(ONLINE_SUPABASE_URL) });
  } catch (e) {
    if (e instanceof TypeError) throw new Error('تعذّر الاتصال بالإنترنت. تأكد من الاتصال وحاول مجدداً.');
    throw e;
  } finally {
    await online.auth.signOut({ scope: 'local' }).catch(() => {});
  }
}
