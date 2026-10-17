/**
 * وضع العرض: نفس واجهة الخادم على بيانات @raqeem/shared/demo في الذاكرة.
 * الكتابة محاكاة: السلة والمفضلة والعناوين والطلبات تبقى ما دام التطبيق مفتوحاً،
 * والطلب الجديد يتقدّم وحده عبر حالاته خلال دقيقة تقريباً حتى يتحرك الخط الزمني.
 */
import {
  computeTotals, matchScore, normalizeIraqiPhone, type Address, type AppConfigSettings, type Category, type Notification,
  type Order, type OrderEvent, type OrderItem, type OrderStatus, type Product, type ProductRequest, type Profile,
} from '@raqeem/shared';
import {
  demo, demoBanners, demoBrands, demoCategories, demoCheckout, demoCoupons, demoHomeSections, demoOrderItems, demoOrders,
  demoProducts, demoRequests, demoStore, demoVariants, demoZones,
} from '@raqeem/shared/demo';
import type { Api, OrderWithItems } from './api';
import type { CartLine, PublicVariant, SearchParams, StoreProductCard, StoreReview, VariantInfo } from './types';

export const DEMO_UID = '00000000-0000-4000-8010-000000000099';

const wait = (ms = 160) => new Promise((r) => setTimeout(r, ms));
const nowIso = () => new Date().toISOString();
const rid = () => `${Math.random().toString(16).slice(2, 10)}-0000-4000-8000-${Date.now().toString(16).padStart(12, '0').slice(-12)}`;

function fail(message: string): never {
  throw new Error(message);
}

// ---------------------------------------------------------------- الكتالوج

const brandName = (id: string | null) => demoBrands.find((b) => b.id === id)?.name ?? null;

function toCard(p: Product): StoreProductCard {
  const vs = demoVariants.filter((v) => v.product_id === p.id && v.is_active);
  const prices = vs.map((v) => v.price);
  const cheapest = vs.reduce((a, b) => (b.price < a.price ? b : a), vs[0]);
  return {
    id: p.id, slug: p.slug, name: p.name, cover_key: p.cover_key, category_id: p.category_id, brand_id: p.brand_id,
    brand_name: brandName(p.brand_id), price_min: Math.min(...prices), price_max: Math.max(...prices),
    compare_at_price: cheapest?.compare_at_price ?? null, available_qty: vs.reduce((s, v) => s + Math.max(v.available_qty, 0), 0),
    rating_avg: p.rating_avg, rating_count: p.rating_count, sold_count: p.sold_count, created_at: p.created_at,
    variant_count: vs.length, default_variant_id: vs.length === 1 ? vs[0].id : null,
  };
}

const published = () => demoProducts.filter((p) => p.is_published && !p.archived_at);

/** القسم وأقسامه الفرعية */
function categoryTree(id: string): string[] {
  return [id, ...demoCategories.filter((c) => c.parent_id === id).map((c) => c.id)];
}

function search(p: SearchParams): StoreProductCard[] {
  let list = published();
  if (p.category) {
    const ids = categoryTree(p.category);
    list = list.filter((x) => x.category_id && ids.includes(x.category_id));
  }
  if (p.brand) list = list.filter((x) => x.brand_id === p.brand);
  let cards = list.map(toCard);
  if (p.min_price != null) cards = cards.filter((c) => c.price_max >= (p.min_price ?? 0));
  if (p.max_price != null) cards = cards.filter((c) => c.price_min <= (p.max_price ?? Infinity));
  if (p.in_stock) cards = cards.filter((c) => c.available_qty > 0);
  const q = (p.q ?? '').trim();
  const scores = new Map<string, number>();
  if (q) {
    for (const c of cards) {
      const prod = demoProducts.find((x) => x.id === c.id)!;
      const cat = demoCategories.find((x) => x.id === prod.category_id)?.name ?? '';
      const skus = demoVariants.filter((v) => v.product_id === c.id).map((v) => v.sku);
      scores.set(c.id, matchScore(q, `${prod.name} ${prod.tags.join(' ')} ${c.brand_name ?? ''} ${cat}`, skus));
    }
    cards = cards.filter((c) => (scores.get(c.id) ?? 0) > 0);
  }
  const sort = p.sort ?? 'relevance';
  cards.sort((a, b) => {
    if (sort === 'newest') return b.created_at.localeCompare(a.created_at);
    if (sort === 'price_asc') return a.price_min - b.price_min;
    if (sort === 'price_desc') return b.price_min - a.price_min;
    if (sort === 'best') return b.sold_count - a.sold_count;
    // الأنسب: التطابق ثم المتوفر ثم الأكثر مبيعاً
    return (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0) || Number(b.available_qty > 0) - Number(a.available_qty > 0) || b.sold_count - a.sold_count;
  });
  const off = p.off ?? 0;
  return cards.slice(off, off + (p.lim ?? 20));
}

const REVIEWERS = ['أحمد', 'سارة', 'حسين', 'مريم', 'علي', 'نور'];
const COMMENTS = ['منتج ممتاز ووصل بسرعة', 'جودة جيدة مقابل السعر', 'التغليف ممتاز والتوصيل خلال يوم', 'أنصح به', null];

function reviewsOf(p: Product): StoreReview[] {
  if (!p.rating_count) return [];
  const n = Number(p.id.slice(-2));
  return Array.from({ length: 3 }, (_, i) => ({
    id: `${p.id}-r${i}`,
    rating: i === 2 ? 4 : 5,
    comment: COMMENTS[(n + i) % COMMENTS.length],
    created_at: new Date(Date.now() - (i + 1) * 4 * 86_400_000).toISOString(),
    author_name: REVIEWERS[(n + i) % REVIEWERS.length],
  }));
}

// ---------------------------------------------------------------- الحالة القابلة للكتابة

interface DemoState {
  profile: Profile | null;
  cart: Map<string, number>;
  favorites: Set<string>;
  addresses: Address[];
  orders: Order[];
  items: OrderItem[];
  events: OrderEvent[];
  requests: ProductRequest[];
  notifications: Notification[];
  available: Map<string, number>;
}

const state: DemoState = {
  profile: null,
  cart: new Map(),
  favorites: new Set(),
  addresses: [],
  orders: [],
  items: [],
  events: [],
  requests: [],
  notifications: [],
  available: new Map(demoVariants.map((v) => [v.id, v.available_qty])),
};

const avail = (variantId: string) => state.available.get(variantId) ?? 0;

/** طلبات وطلبات توفير سابقة للمستخدم التجريبي حتى لا تكون الشاشات فارغة */
function seedHistory() {
  const mine = [demoOrders[4], demoOrders[2]];
  for (const o of mine) {
    state.orders.push({ ...o, profile_id: DEMO_UID });
    state.items.push(...demoOrderItems.filter((i) => i.order_id === o.id));
    const steps: OrderStatus[] = o.status === 'delivered' ? ['pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered'] : ['pending', 'confirmed', 'preparing'];
    steps.forEach((s, i) => state.events.push({
      id: rid(), order_id: o.id, status: s, note: null, is_customer_visible: true, actor_id: null,
      created_at: new Date(Date.parse(o.created_at) + i * 40 * 60_000).toISOString(),
    }));
  }
  state.requests.push(...demoRequests.map((r, i) => ({ ...r, profile_id: DEMO_UID, status: i === 0 ? ('available' as const) : r.status, product_id: i === 0 ? demoProducts[0].id : null, staff_reply: i === 0 ? 'وفّرناه لك، تجده الآن في المتجر' : r.staff_reply })));
  state.notifications.push(
    { id: rid(), profile_id: DEMO_UID, kind: 'order', title: 'تم تسليم طلبك', body: `طلبك ${demoOrders[4].number} وصل. نتمنى أن يعجبك.`, data: { order_id: demoOrders[4].id }, read_at: nowIso(), created_at: demoOrders[4].created_at },
    { id: rid(), profile_id: DEMO_UID, kind: 'promo', title: 'أسبوع الإلكترونيات', body: 'خصومات حتى ٢٥٪ على السماعات والشواحن.', data: {}, read_at: null, created_at: new Date(Date.now() - 3 * 3600_000).toISOString() },
    { id: rid(), profile_id: DEMO_UID, kind: 'request', title: 'صار طلبك متوفراً', body: 'شاحن سيارة مغناطيسي متوفر الآن في المتجر.', data: { request_id: demoRequests[0].id }, read_at: null, created_at: new Date(Date.now() - 26 * 3600_000).toISOString() },
  );
}
seedHistory();

// ---------------------------------------------------------------- محاكاة اللحظية

const orderListeners = new Map<string, Set<() => void>>();
function emitOrder(id: string) {
  orderListeners.get(id)?.forEach((cb) => cb());
}

const STATUS_NOTE: Partial<Record<OrderStatus, string>> = {
  confirmed: 'تم تأكيد طلبك',
  preparing: 'بدأنا تجهيز طلبك',
  ready: 'طلبك جاهز للاستلام من المكتب',
  out_for_delivery: 'طلبك مع المندوب في الطريق إليك',
  delivered: 'تم تسليم طلبك',
};

function setStatus(orderId: string, status: OrderStatus) {
  const o = state.orders.find((x) => x.id === orderId);
  if (!o || o.status === 'cancelled') return;
  const at = nowIso();
  Object.assign(o, {
    status, updated_at: at,
    confirmed_at: status === 'confirmed' ? at : o.confirmed_at,
    delivered_at: status === 'delivered' ? at : o.delivered_at,
    payment_status: status === 'delivered' && o.payment_method !== 'online' ? 'paid' : o.payment_status,
  });
  state.events.push({ id: rid(), order_id: orderId, status, note: null, is_customer_visible: true, actor_id: null, created_at: at });
  const title = STATUS_NOTE[status];
  if (title) state.notifications.unshift({ id: rid(), profile_id: DEMO_UID, kind: 'order', title, body: `الطلب ${o.number}`, data: { order_id: orderId }, read_at: null, created_at: at });
  emitOrder(orderId);
}

function simulateProgress(order: Order) {
  const path: OrderStatus[] = order.fulfillment === 'pickup'
    ? ['confirmed', 'preparing', 'ready', 'delivered']
    : ['confirmed', 'preparing', 'out_for_delivery', 'delivered'];
  path.forEach((s, i) => setTimeout(() => setStatus(order.id, s), (i + 1) * 14_000));
}

let orderSeq = 1006;
let requestSeq = 3;

const DEFAULT_APP: AppConfigSettings = {
  min_version: 1, latest_version: 1, maintenance: false, maintenance_message: null, play_store_url: null, apk_url: null,
};

function card(id: string) {
  const p = demoProducts.find((x) => x.id === id);
  return p ? toCard(p) : null;
}

function variantInfo(id: string): VariantInfo | null {
  const v = demoVariants.find((x) => x.id === id);
  const p = v ? demoProducts.find((x) => x.id === v.product_id) : null;
  if (!v || !p) return null;
  return {
    variant_id: v.id, product_id: p.id, product_slug: p.slug, name: p.name, variant_title: v.title === 'افتراضي' ? null : v.title,
    price: v.price, compare_at_price: v.compare_at_price, image_key: v.image_key ?? p.cover_key, available_qty: avail(v.id), category_id: p.category_id,
  };
}

function quoteOf(items: { variant_id: string; qty: number }[], governorate: string | null, coupon: string | null) {
  const lines = items.map((it) => {
    const v = demoVariants.find((x) => x.id === it.variant_id);
    const a = v ? avail(v.id) : 0;
    const price = v?.price ?? 0;
    return { variant_id: it.variant_id, qty: it.qty, unit_price: price, line_total: price * it.qty, available_qty: a, ok: !!v && a >= it.qty };
  });
  const zone = governorate ? demoZones.find((z) => z.governorate === governorate && z.is_active) : null;
  const code = coupon?.trim().toUpperCase() || null;
  const c = code ? demoCoupons.find((x) => x.code === code && x.is_active) : null;
  const totals = computeTotals({
    lines: lines.map((l) => ({ unit_price: l.unit_price, qty: l.qty })),
    coupon: c ? { code: c.code, kind: c.kind, value: c.value, min_subtotal: c.min_subtotal, max_discount: c.max_discount } : null,
    deliveryFee: zone?.fee ?? 0,
    freeDeliveryOver: demoCheckout.free_delivery_over,
  });
  const couponError = code && !c ? 'هذا الكوبون غير صالح' : totals.couponError;
  return {
    lines, subtotal: totals.subtotal, discount: totals.discount, delivery_fee: totals.deliveryFee, total: totals.total,
    coupon_code: c && !totals.couponError ? c.code : null, coupon_error: couponError, min_order_total: demoCheckout.min_order_total,
    ok: lines.every((l) => l.ok) && totals.subtotal - totals.discount >= demoCheckout.min_order_total && (!governorate || !!zone),
  };
}

// ---------------------------------------------------------------- التنفيذ

export const demoApi: Api & { signIn(): Profile; signOut(): void; currentProfile(): Profile | null } = {
  signIn() {
    state.profile ??= {
      id: DEMO_UID, kind: 'customer', full_name: null, phone: null, email: 'demo@raqeem.iq', avatar_key: null, role_id: null,
      is_owner: false, status: 'active', onboarded: false, governorate: null, prefs: {}, last_seen_at: null, created_at: nowIso(), updated_at: nowIso(),
    };
    return state.profile;
  },
  signOut() {
    state.cart.clear();
    state.favorites.clear();
  },
  currentProfile: () => state.profile,

  async home() {
    await wait();
    const sections = demoHomeSections.filter((s) => s.is_active).sort((a, b) => a.sort - b.sort).map((s) => {
      let list = published().map(toCard);
      if (s.kind === 'on_sale') list = list.filter((c) => c.compare_at_price && c.compare_at_price > c.price_min);
      if (s.kind === 'featured') list = list.filter((c) => demoProducts.find((p) => p.id === c.id)?.is_featured);
      if (s.kind === 'best_sellers') list.sort((a, b) => b.sold_count - a.sold_count);
      if (s.kind === 'new') list.sort((a, b) => b.created_at.localeCompare(a.created_at));
      if (s.kind === 'category' && s.category_id) { const ids = categoryTree(s.category_id); list = list.filter((c) => c.category_id && ids.includes(c.category_id)); }
      if (s.kind === 'brand') list = list.filter((c) => c.brand_id === s.brand_id);
      if (s.kind === 'manual') list = s.product_ids.map(card).filter((x): x is StoreProductCard => !!x);
      return { id: s.id, title: s.title, kind: s.kind, category_id: s.category_id, brand_id: s.brand_id, products: list.slice(0, s.max_items) };
    });
    return { banners: demoBanners.filter((b) => b.is_active), categories: demoCategories.filter((c) => c.is_visible), sections };
  },
  async categories() {
    await wait(80);
    return demoCategories.filter((c) => c.is_visible) as Category[];
  },
  async brands() {
    return demoBrands;
  },
  async search(p) {
    await wait(140);
    return search(p);
  },
  async product(slugOrId) {
    await wait();
    const p = published().find((x) => x.slug === slugOrId || x.id === slugOrId);
    if (!p) return null;
    const variants: PublicVariant[] = demo.variantsOf(p.id).map((v) => ({
      id: v.id, product_id: v.product_id, title: v.title, options: v.options, sku: v.sku, price: v.price, compare_at_price: v.compare_at_price,
      image_key: v.image_key, available_qty: avail(v.id), is_active: v.is_active, sort: v.sort,
    }));
    const related = published().filter((x) => x.category_id === p.category_id && x.id !== p.id).map(toCard).slice(0, 8);
    const more = related.length < 4 ? published().filter((x) => x.id !== p.id && !related.some((r) => r.id === x.id)).map(toCard).slice(0, 6 - related.length) : [];
    return {
      product: p, variants, images: [], brand: demoBrands.find((b) => b.id === p.brand_id) ?? null,
      category: demoCategories.find((c) => c.id === p.category_id) ?? null, reviews: reviewsOf(p), related: [...related, ...more],
    };
  },
  async productCards(ids) {
    await wait(80);
    return ids.map(card).filter((x): x is StoreProductCard => !!x);
  },
  async variants(ids) {
    return ids.map(variantInfo).filter((x): x is VariantInfo => !!x);
  },
  async settings() {
    return { store: demoStore, checkout: demoCheckout, app: DEFAULT_APP };
  },
  async zones() {
    return demoZones;
  },
  async quote(items, governorate, coupon) {
    await wait(120);
    return quoteOf(items, governorate, coupon);
  },

  async profile() {
    return state.profile;
  },
  async upsertProfile(input) {
    await wait(300);
    const phone = normalizeIraqiPhone(input.phone);
    if (!phone) fail('رقم الهاتف غير صحيح');
    if (!state.profile) fail('سجّل الدخول أولاً');
    Object.assign(state.profile, { full_name: input.full_name.trim(), phone, governorate: input.governorate, onboarded: true, updated_at: nowIso() });
  },
  async deleteAccount() {
    await wait(400);
    state.profile = null;
    state.addresses = [];
    state.cart.clear();
    state.favorites.clear();
  },

  async cartGet() {
    return [...state.cart.entries()].map(([variant_id, qty]): CartLine => ({ variant_id, qty }));
  },
  async cartSet(_uid, variantId, qty) {
    if (qty <= 0) state.cart.delete(variantId);
    else state.cart.set(variantId, qty);
  },
  async cartClear() {
    state.cart.clear();
  },
  async favoritesGet() {
    return [...state.favorites];
  },
  async favoriteSet(_uid, productId, on) {
    if (on) state.favorites.add(productId);
    else state.favorites.delete(productId);
  },

  async addresses() {
    await wait(80);
    return [...state.addresses].sort((a, b) => Number(b.is_default) - Number(a.is_default));
  },
  async saveAddress(uid, id, input) {
    await wait(220);
    const first = state.addresses.length === 0;
    if (input.is_default || first) state.addresses.forEach((a) => { a.is_default = false; });
    if (id) {
      const a = state.addresses.find((x) => x.id === id) ?? fail('العنوان غير موجود');
      Object.assign(a, input, { is_default: input.is_default || first || a.is_default });
      return a;
    }
    const a: Address = { id: rid(), profile_id: uid, lat: null, lng: null, created_at: nowIso(), ...input, is_default: input.is_default || first };
    state.addresses.push(a);
    return a;
  },
  async deleteAddress(_uid, id) {
    state.addresses = state.addresses.filter((a) => a.id !== id);
    if (state.addresses.length && !state.addresses.some((a) => a.is_default)) state.addresses[0].is_default = true;
  },
  async setDefaultAddress(_uid, id) {
    state.addresses.forEach((a) => { a.is_default = a.id === id; });
  },

  async placeOrder(input) {
    await wait(600);
    const profile = state.profile ?? fail('سجّل الدخول لإتمام الطلب');
    if (!profile.onboarded) fail('أكمل بياناتك أولاً');
    const address = input.address_id ? state.addresses.find((a) => a.id === input.address_id) : null;
    if (input.fulfillment === 'delivery' && !address) fail('اختر عنوان التوصيل');
    const q = quoteOf(input.items, address?.governorate ?? null, input.coupon_code);
    const bad = q.lines.find((l) => !l.ok);
    if (bad) fail(`${variantInfo(bad.variant_id)?.name ?? 'منتج'}: المتوفر ${bad.available_qty} فقط`);
    if (q.subtotal - q.discount < q.min_order_total) fail('لم يصل الطلب إلى الحد الأدنى');
    const id = rid();
    const number = `O-${String(orderSeq++).padStart(6, '0')}`;
    const at = nowIso();
    const order: Order = {
      id, number, profile_id: DEMO_UID, customer_id: DEMO_UID, status: 'pending', payment_method: input.payment_method,
      payment_status: input.payment_method === 'online' ? 'pending' : 'unpaid', fulfillment: input.fulfillment,
      address: address ? { recipient_name: address.recipient_name, phone: address.phone, governorate: address.governorate, city: address.city, area: address.area, street: address.street, landmark: address.landmark, lat: null, lng: null } : null,
      delivery_zone_id: address ? demoZones.find((z) => z.governorate === address.governorate)?.id ?? null : null,
      warehouse_id: '', subtotal: q.subtotal, discount: q.discount, coupon_code: q.coupon_code, delivery_fee: q.delivery_fee, total: q.total,
      customer_note: input.note, staff_note: null, invoice_id: null, cancel_reason: null, created_at: at, updated_at: at,
      confirmed_at: null, delivered_at: null, cancelled_at: null,
    };
    state.orders.unshift(order);
    for (const l of q.lines) {
      const info = variantInfo(l.variant_id)!;
      state.available.set(l.variant_id, avail(l.variant_id) - l.qty); // الحجز
      state.items.push({ id: rid(), order_id: id, product_id: info.product_id, variant_id: l.variant_id, name: info.name, variant_title: info.variant_title, sku: demoVariants.find((v) => v.id === l.variant_id)?.sku ?? '', image_key: info.image_key, qty: l.qty, unit_price: l.unit_price, line_total: l.line_total });
    }
    state.events.push({ id: rid(), order_id: id, status: 'pending', note: 'استلمنا طلبك', is_customer_visible: true, actor_id: null, created_at: at });
    state.cart.clear();
    if (input.payment_method !== 'online') simulateProgress(order);
    return { order_id: id, number };
  },
  async orders() {
    await wait(120);
    return state.orders.map((o): OrderWithItems => ({ ...o, items: state.items.filter((i) => i.order_id === o.id) }));
  },
  async order(id) {
    await wait(100);
    const o = state.orders.find((x) => x.id === id);
    if (!o) return null;
    return { order: { ...o }, items: state.items.filter((i) => i.order_id === id), events: state.events.filter((e) => e.order_id === id).sort((a, b) => a.created_at.localeCompare(b.created_at)) };
  },
  subscribeOrder(id, onChange) {
    const set = orderListeners.get(id) ?? new Set();
    set.add(onChange);
    orderListeners.set(id, set);
    return () => { set.delete(onChange); };
  },
  async cancelOrder(id, reason) {
    await wait(300);
    const o = state.orders.find((x) => x.id === id) ?? fail('الطلب غير موجود');
    if (o.status !== 'pending' && o.status !== 'confirmed') fail('لا يمكن إلغاء الطلب بعد بدء تجهيزه');
    const at = nowIso();
    Object.assign(o, { status: 'cancelled', cancel_reason: reason, cancelled_at: at, updated_at: at });
    state.items.filter((i) => i.order_id === id).forEach((i) => state.available.set(i.variant_id, avail(i.variant_id) + i.qty));
    state.events.push({ id: rid(), order_id: id, status: 'cancelled', note: reason, is_customer_visible: true, actor_id: null, created_at: at });
    emitOrder(id);
  },
  async startPayment(orderId) {
    // لا بوابة في وضع العرض: نعتبر الدفع ناجحاً ونكمل المحاكاة
    await wait(700);
    const o = state.orders.find((x) => x.id === orderId) ?? fail('الطلب غير موجود');
    o.payment_status = 'paid';
    simulateProgress(o);
    emitOrder(orderId);
    return { checkout_url: null, paid: true };
  },
  async paymentStatus(orderId) {
    return state.orders.find((x) => x.id === orderId)?.payment_status ?? 'unpaid';
  },
  async submitReview() {
    await wait(300);
  },

  async requests() {
    await wait(100);
    return [...state.requests].sort((a, b) => b.created_at.localeCompare(a.created_at));
  },
  async createRequest(input) {
    await wait(400);
    if (!input.title.trim()) fail('اكتب اسم المنتج');
    const id = rid();
    const number = `RQ-${String(requestSeq++).padStart(6, '0')}`;
    state.requests.unshift({ id, number, profile_id: DEMO_UID, customer_id: DEMO_UID, ...input, status: 'new', staff_reply: null, product_id: null, created_at: nowIso(), updated_at: nowIso() });
    return { id, number };
  },
  async uploadRequestImage(uid, _bytes, _type, ext) {
    await wait(300);
    return `requests/${uid}/${Date.now().toString(36)}.${ext}`;
  },

  async notifications() {
    await wait(80);
    return [...state.notifications];
  },
  async markNotificationsRead(ids) {
    const at = nowIso();
    state.notifications.forEach((n) => { if (!ids || ids.includes(n.id)) n.read_at ??= at; });
  },
  async savePushToken() {},
  async deletePushToken() {},
};
