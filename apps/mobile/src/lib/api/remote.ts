/**
 * التنفيذ الحقيقي على Supabase. الأسماء والمعاملات حرفياً من system/06-database.md.
 * الأخطاء العربية من قاعدة البيانات (raise exception) تمر كما هي إلى الشاشات.
 */
import type { AppConfigSettings, CheckoutSettings, OrderPaymentStatus, StoreSettings } from '@raqeem/shared';
import { callFunction, must, sb } from '../supabase';
import type { Api, OrderWithItems } from './api';
import type {
  Address, CartLine, Category, DeliveryZone, Notification, OrderDetail, OrderEvent, OrderItem, ProductRequest, Profile,
  PublicSettings, StoreHome, StoreProductCard, StoreProductDetail, VariantInfo, Brand, Order, PaymentCreateResult,
  PlaceOrderResult, StoreQuote, StoreSearchResult,
} from './types';

const DEFAULT_STORE: StoreSettings = {
  name: 'رقيم', legal_name: null, phone: null, whatsapp: null, email: null, address: null, map_url: null, hours: null,
  socials: {}, currency: 'IQD', digits: 'arab',
};
const DEFAULT_CHECKOUT: CheckoutSettings = {
  cod_enabled: true, office_enabled: true, online_enabled: false, pickup_enabled: true, min_order_total: 0,
  free_delivery_over: null, office_instructions: null,
};
const DEFAULT_APP: AppConfigSettings = {
  min_version: 1, latest_version: 1, maintenance: false, maintenance_message: null, play_store_url: null, apk_url: null,
};

interface VariantRow { id: string; price: number; compare_at_price: number | null; available_qty: number; is_active: boolean }
interface ProductRow {
  id: string; slug: string; name: string; cover_key: string | null; category_id: string | null; brand_id: string | null;
  rating_avg: number; rating_count: number; sold_count: number; created_at: string;
  is_featured: boolean; allow_request: boolean; has_variants: boolean; is_published: boolean; archived_at: string | null;
  brand: { name: string } | null; variants: VariantRow[];
}

function rowToCard(p: ProductRow): StoreProductCard {
  const vs = (p.variants ?? []).filter((v) => v.is_active);
  const cheapest = vs.reduce<VariantRow | null>((a, b) => (!a || b.price < a.price ? b : a), null);
  const available = vs.reduce((s, v) => s + Math.max(0, v.available_qty), 0);
  const cmp = cheapest?.compare_at_price ?? null;
  return {
    id: p.id, slug: p.slug, name: p.name, cover_key: p.cover_key, category_id: p.category_id, brand_id: p.brand_id,
    brand_name: p.brand?.name ?? null, price_min: cheapest?.price ?? 0, price_max: Math.max(0, ...vs.map((v) => v.price)),
    compare_at_price: cmp != null && cheapest && cmp > cheapest.price ? cmp : null, available_qty: available, in_stock: available > 0,
    rating_avg: p.rating_avg, rating_count: p.rating_count, sold_count: p.sold_count, created_at: p.created_at,
    is_featured: p.is_featured, allow_request: p.allow_request, has_variants: p.has_variants,
    variants_count: vs.length, default_variant_id: vs.length === 1 ? vs[0].id : null,
  };
}


export const remoteApi: Api = {
  async home() {
    const data = await must(sb().rpc('store_home'));
    const h = (data ?? {}) as Partial<StoreHome>;
    return { banners: h.banners ?? [], categories: h.categories ?? [], sections: h.sections ?? [] };
  },
  async categories() {
    return must(sb().from('categories').select('*').eq('is_visible', true).order('sort')) as Promise<Category[]>;
  },
  async brands() {
    return must(sb().from('brands').select('*').order('sort')) as Promise<Brand[]>;
  },
  async search(p) {
    const data = await must(sb().rpc('store_search', {
      q: p.q?.trim() || null, category: p.category ?? null, brand: p.brand ?? null, min_price: p.min_price ?? null,
      max_price: p.max_price ?? null, in_stock: p.in_stock ?? false, sort: p.sort ?? 'relevance', lim: p.lim ?? 20, off: p.off ?? 0,
    }));
    const r = (data ?? {}) as Partial<StoreSearchResult>;
    return { total: r.total ?? 0, items: r.items ?? [] };
  },
  async product(slugOrId) {
    const data = await must(sb().rpc('store_product', { slug_or_id: slugOrId }));
    const d = data as StoreProductDetail | null;
    if (!d?.product) return null;
    return { ...d, variants: d.variants ?? [], images: d.images ?? [], reviews: d.reviews ?? [], similar: d.similar ?? [] };
  },
  async productCards(ids) {
    if (!ids.length) return [];
    const rows = await must(sb().from('products')
      .select('id, slug, name, cover_key, category_id, brand_id, rating_avg, rating_count, sold_count, created_at, is_featured, allow_request, has_variants, is_published, archived_at, brand:brands(name), variants:product_variants(id, price, compare_at_price, available_qty, is_active)')
      .in('id', ids));
    const cards = ((rows ?? []) as unknown as ProductRow[]).filter((p) => p.is_published && !p.archived_at).map(rowToCard);
    return ids.map((id) => cards.find((c) => c.id === id)).filter((c): c is StoreProductCard => !!c);
  },
  async variants(ids) {
    if (!ids.length) return [];
    type Row = { id: string; product_id: string; title: string; price: number; compare_at_price: number | null; image_key: string | null; available_qty: number; product: { name: string; slug: string; cover_key: string | null; category_id: string | null } | null };
    const rows = (await must(sb().from('product_variants')
      .select('id, product_id, title, price, compare_at_price, image_key, available_qty, product:products(name, slug, cover_key, category_id)')
      .in('id', ids).eq('is_active', true))) as unknown as Row[];
    return (rows ?? []).filter((r) => r.product).map((r): VariantInfo => ({
      variant_id: r.id, product_id: r.product_id, product_slug: r.product!.slug, name: r.product!.name,
      variant_title: r.title === 'افتراضي' ? null : r.title, price: r.price, compare_at_price: r.compare_at_price,
      image_key: r.image_key ?? r.product!.cover_key, available_qty: r.available_qty, category_id: r.product!.category_id,
    }));
  },
  async settings() {
    const rows = (await must(sb().from('app_settings').select('key, value').in('key', ['store', 'checkout', 'app']))) as { key: string; value: unknown }[];
    const get = <T,>(k: string, d: T): T => ({ ...d, ...((rows ?? []).find((r) => r.key === k)?.value as Partial<T> | undefined) });
    return { store: get('store', DEFAULT_STORE), checkout: get('checkout', DEFAULT_CHECKOUT), app: get('app', DEFAULT_APP) } satisfies PublicSettings;
  },
  async zones() {
    return must(sb().from('delivery_zones').select('*').eq('is_active', true).order('sort')) as Promise<DeliveryZone[]>;
  },
  async quote(items, governorate, coupon) {
    const data = await must(sb().rpc('quote_cart', { items, governorate, coupon_code: coupon?.trim() || null }));
    return data as StoreQuote;
  },

  async profile(uid) {
    return (await must(sb().from('profiles').select('*').eq('id', uid).maybeSingle())) as Profile | null;
  },
  async upsertProfile(input) {
    await must(sb().rpc('upsert_my_profile', { full_name: input.full_name, phone: input.phone, governorate: input.governorate }));
  },
  async deleteAccount() {
    // دالة الخادم account تستدعي delete_my_account بنفسها ثم تحذف مستخدم auth (يحتاج مفتاح الخدمة).
    // لا نستدعي الدالة هنا أولاً: هي توقف الملف (status = blocked) فترفض account الطلب بعدها
    // («حسابك موقوف») ويبقى مستخدم auth بلا حذف.
    await callFunction('account', {});
  },

  async cartGet(uid) {
    return (await must(sb().from('cart_items').select('variant_id, qty').eq('profile_id', uid))) as CartLine[];
  },
  async cartSet(uid, variantId, qty) {
    if (qty <= 0) await must(sb().from('cart_items').delete().eq('profile_id', uid).eq('variant_id', variantId));
    else await must(sb().from('cart_items').upsert({ profile_id: uid, variant_id: variantId, qty, updated_at: new Date().toISOString() }, { onConflict: 'profile_id,variant_id' }));
  },
  async cartClear(uid) {
    await must(sb().from('cart_items').delete().eq('profile_id', uid));
  },
  async favoritesGet(uid) {
    const rows = (await must(sb().from('favorites').select('product_id').eq('profile_id', uid).order('created_at', { ascending: false }))) as { product_id: string }[];
    return rows.map((r) => r.product_id);
  },
  async favoriteSet(uid, productId, on) {
    if (on) await must(sb().from('favorites').upsert({ profile_id: uid, product_id: productId }, { onConflict: 'profile_id,product_id' }));
    else await must(sb().from('favorites').delete().eq('profile_id', uid).eq('product_id', productId));
  },

  async addresses(uid) {
    return (await must(sb().from('addresses').select('*').eq('profile_id', uid).order('is_default', { ascending: false }).order('created_at', { ascending: false }))) as Address[];
  },
  async saveAddress(uid, id, input) {
    // عنوان افتراضي واحد (فهرس فريد جزئي): نلغي الافتراضي القديم أولاً
    if (input.is_default) await must(sb().from('addresses').update({ is_default: false }).eq('profile_id', uid).eq('is_default', true));
    const row = { ...input, profile_id: uid };
    const q = id ? sb().from('addresses').update(row).eq('id', id) : sb().from('addresses').insert(row);
    return (await must(q.select('*').single())) as Address;
  },
  async deleteAddress(uid, id) {
    await must(sb().from('addresses').delete().eq('id', id).eq('profile_id', uid));
  },
  async setDefaultAddress(uid, id) {
    await must(sb().from('addresses').update({ is_default: false }).eq('profile_id', uid).eq('is_default', true));
    await must(sb().from('addresses').update({ is_default: true }).eq('id', id).eq('profile_id', uid));
  },

  async placeOrder(input) {
    const data = await must(sb().rpc('place_order', {
      items: input.items, address_id: input.address_id, fulfillment: input.fulfillment, payment_method: input.payment_method,
      coupon_code: input.coupon_code, note: input.note,
    }));
    return data as PlaceOrderResult;
  },
  async orders(uid) {
    const rows = await must(sb().from('orders').select('*, items:order_items(*)').eq('profile_id', uid).order('created_at', { ascending: false }).limit(60));
    return (rows ?? []) as unknown as OrderWithItems[];
  },
  async order(id) {
    const [o, items, events] = await Promise.all([
      must(sb().from('orders').select('*').eq('id', id).maybeSingle()),
      must(sb().from('order_items').select('*').eq('order_id', id)),
      must(sb().from('order_events').select('*').eq('order_id', id).eq('is_customer_visible', true).order('created_at')),
    ]);
    if (!o) return null;
    return { order: o as Order, items: (items ?? []) as OrderItem[], events: (events ?? []) as OrderEvent[] } satisfies OrderDetail;
  },
  subscribeOrder(id, onChange) {
    const client = sb();
    // اسم فريد لكل اشتراك: channel() تعيد القناة المشتركة نفسها إن تكرر الاسم، و.on() بعد subscribe() ترمي
    // (صفحتا الطلب نفسه مفتوحتان معاً: من إشعار أو العودة من الدفع)
    const ch = client.channel(`order:${id}:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `id=eq.${id}` }, () => onChange())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'order_events', filter: `order_id=eq.${id}` }, () => onChange())
      .subscribe();
    return () => { client.removeChannel(ch); };
  },
  async cancelOrder(id, reason) {
    await must(sb().rpc('cancel_my_order', { order_id: id, reason }));
  },
  async startPayment(orderId, redirectUrl) {
    const r = await callFunction<PaymentCreateResult>('payments', { action: 'create', order_id: orderId, ...(redirectUrl ? { redirect_url: redirectUrl } : {}) });
    return { transaction_id: r?.transaction_id ?? null, checkout_url: r?.checkout_url ?? null, amount: r?.amount ?? 0 };
  },
  async paymentStatus(orderId) {
    const r = await callFunction<{ order_id: string; payment_status: OrderPaymentStatus }>('payments', { action: 'status', order_id: orderId });
    return r.payment_status;
  },
  async submitReview(productId, rating, comment) {
    await must(sb().rpc('submit_review', { product_id: productId, rating, comment }));
  },

  async requests(uid) {
    return (await must(sb().from('product_requests').select('*').eq('profile_id', uid).order('created_at', { ascending: false }))) as ProductRequest[];
  },
  async createRequest(input) {
    const data = await must(sb().rpc('create_product_request', {
      title: input.title, details: input.details, image_key: input.image_key, link_url: input.link_url, qty: input.qty, budget: input.budget,
    }));
    const r = data as { id: string; number: string; status: string };
    return { id: r.id, number: r.number };
  },
  async uploadRequestImage(uid, bytes, contentType, ext) {
    const key = `requests/${uid}/${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}.${ext}`;
    const { error } = await sb().storage.from('private').upload(key, bytes, { contentType, upsert: false });
    if (error) throw new Error(error.message);
    return key;
  },

  async notifications(uid) {
    return (await must(sb().from('notifications').select('*').eq('profile_id', uid).order('created_at', { ascending: false }).limit(100))) as Notification[];
  },
  async markNotificationsRead(ids) {
    await must(sb().rpc('mark_notifications_read', { ids }));
  },
  async savePushToken(_uid, token, platform) {
    // دالة خادم تنقل الرمز للحساب الحالي (حساب ثانٍ على نفس الهاتف كان يُرفض بسياسة RLS فلا تصله إشعارات)
    await must(sb().rpc('register_push_token', { p_token: token, p_platform: platform }));
  },
  async deletePushToken(uid, token) {
    await must(sb().from('push_tokens').delete().eq('profile_id', uid).eq('token', token));
  },
};
