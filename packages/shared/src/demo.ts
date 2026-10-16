/**
 * بيانات تجريبية — يستخدمها «وضع العرض» في لوحة التحكم والتطبيق عندما لا تكون Supabase مضبوطة،
 * حتى يرى صاحب المشروع والعميل كل الشاشات فوراً. ليست بيانات حقيقية ولا تُكتب في قاعدة البيانات.
 * الصور null ← الواجهة ترسم بديلاً بهوية رقيم (أيقونة القسم على خلفية الطين الخفيفة).
 */
import type {
  Banner, Brand, Category, Customer, HomeSection, Order, OrderItem, Product, ProductVariant,
  StockLevel, Supplier, Warehouse, DeliveryZone, StoreSettings, CheckoutSettings, ProductRequest, Coupon,
} from './types';

const NOW = '2026-10-16T09:00:00.000Z';
const uid = (prefix: number, n: number) => `00000000-0000-4000-8${String(prefix).padStart(3, '0')}-${String(n).padStart(12, '0')}`;

export const demoStore: StoreSettings = {
  name: 'رَقيم',
  legal_name: null,
  phone: '+9647700000000',
  whatsapp: '+9647700000000',
  email: null,
  address: 'بغداد — الكرادة، شارع ٦٢',
  map_url: null,
  hours: 'السبت – الخميس · ١٠ صباحاً – ١٠ مساءً',
  socials: { instagram: 'raqeem.iq' },
  currency: 'IQD',
  digits: 'arab',
};

export const demoCheckout: CheckoutSettings = {
  cod_enabled: true,
  office_enabled: true,
  online_enabled: true,
  pickup_enabled: true,
  min_order_total: 10000,
  free_delivery_over: 150000,
  office_instructions: 'نتواصل معك عبر واتساب لتحديد موعد الحضور إلى المكتب والدفع.',
};

export const demoWarehouses: Warehouse[] = [
  { id: uid(1, 1), name: 'المخزن الرئيسي', code: 'MAIN', address: 'بغداد — الكرادة', is_default: true, is_sellable: true, is_active: true, created_at: NOW },
  { id: uid(1, 2), name: 'صالة العرض', code: 'SHOP', address: 'بغداد — المنصور', is_default: false, is_sellable: true, is_active: true, created_at: NOW },
];

const cat = (n: number, name: string, slug: string, icon: string, parent: number | null = null): Category => ({
  id: uid(2, n), parent_id: parent ? uid(2, parent) : null, name, slug, description: null, image_key: null, icon, sort: n, is_visible: true, created_at: NOW,
});

export const demoCategories: Category[] = [
  cat(1, 'هواتف وإكسسوارات', 'phones', 'phone'),
  cat(2, 'سماعات وصوتيات', 'audio', 'activity'),
  cat(3, 'أجهزة منزلية', 'home-appliances', 'home'),
  cat(4, 'المطبخ', 'kitchen', 'box'),
  cat(5, 'العناية الشخصية', 'personal-care', 'heart'),
  cat(6, 'ساعات ذكية', 'watches', 'clock'),
  cat(7, 'الألعاب والأطفال', 'kids', 'gift'),
  cat(8, 'حقائب وسفر', 'bags', 'bag'),
  cat(9, 'شواحن وكابلات', 'chargers', 'zap', 1),
  cat(10, 'أغطية وحمايات', 'cases', 'shield', 1),
];

const brand = (n: number, name: string): Brand => ({ id: uid(3, n), name, slug: name.toLowerCase(), logo_key: null, sort: n, created_at: NOW });
export const demoBrands: Brand[] = [brand(1, 'Anker'), brand(2, 'Samsung'), brand(3, 'Xiaomi'), brand(4, 'JBL'), brand(5, 'Philips'), brand(6, 'Baseus'), brand(7, 'Tefal')];

interface Seed {
  n: number; name: string; cat: number; brand: number | null; price: number; compare?: number; cost: number;
  qty: number; desc: string; variants?: { title: string; options: Record<string, string>; qty: number; price?: number }[];
  featured?: boolean; sold?: number; serials?: boolean; specs?: [string, string][];
}

const seeds: Seed[] = [
  { n: 1, name: 'شاحن سريع ٦٥ واط GaN', cat: 9, brand: 1, price: 45000, compare: 55000, cost: 31000, qty: 42, featured: true, sold: 310, desc: 'شاحن صغير بثلاثة منافذ يشحن الهاتف واللابتوب معاً.', specs: [['القدرة', '65W'], ['المنافذ', '2× USB-C + USB-A']] },
  { n: 2, name: 'كابل USB-C مضفّر ٢ متر', cat: 9, brand: 6, price: 9000, cost: 4500, qty: 160, sold: 920, desc: 'كابل متين بغلاف قماشي يدعم الشحن السريع ١٠٠ واط.' },
  { n: 3, name: 'باور بانك ٢٠٠٠٠ ملي أمبير', cat: 9, brand: 3, price: 38000, cost: 26000, qty: 5, sold: 140, desc: 'بطارية متنقلة بشاشة تعرض النسبة وشحن سريع.', variants: [{ title: 'أسود', options: { اللون: 'أسود' }, qty: 3 }, { title: 'أبيض', options: { اللون: 'أبيض' }, qty: 2 }] },
  { n: 4, name: 'غطاء سيليكون مقاوم للصدمات', cat: 10, brand: null, price: 7000, cost: 2500, qty: 0, sold: 75, desc: 'غطاء ناعم بحواف مرتفعة لحماية الكاميرا.', variants: [{ title: 'أسود', options: { اللون: 'أسود' }, qty: 0 }, { title: 'كحلي', options: { اللون: 'كحلي' }, qty: 0 }] },
  { n: 5, name: 'سماعة لاسلكية بعزل الضوضاء', cat: 2, brand: 4, price: 125000, compare: 150000, cost: 92000, qty: 14, featured: true, sold: 88, desc: 'عزل نشط للضوضاء وبطارية حتى ٤٠ ساعة.', specs: [['البطارية', '40 ساعة'], ['البلوتوث', '5.3']] },
  { n: 6, name: 'سماعات أذن لاسلكية', cat: 2, brand: 3, price: 32000, cost: 19000, qty: 37, sold: 260, desc: 'صوت نقي، علبة شحن صغيرة، مقاومة للتعرق.', variants: [{ title: 'أبيض', options: { اللون: 'أبيض' }, qty: 25 }, { title: 'أسود', options: { اللون: 'أسود' }, qty: 12 }] },
  { n: 7, name: 'مكبر صوت محمول مقاوم للماء', cat: 2, brand: 4, price: 85000, cost: 61000, qty: 9, featured: true, sold: 52, desc: 'صوت قوي وجهير عميق، يتحمل الماء والغبار.' },
  { n: 8, name: 'مكنسة كهربائية لاسلكية', cat: 3, brand: 3, price: 210000, compare: 245000, cost: 160000, qty: 6, serials: true, sold: 21, desc: 'شفط قوي وخفيفة الوزن مع ملحقات للسيارة والكنبة.' },
  { n: 9, name: 'مكواة بخار', cat: 3, brand: 5, price: 54000, cost: 38000, qty: 18, sold: 64, desc: 'بخار مستمر وقاعدة سيراميك لا تلتصق.' },
  { n: 10, name: 'منقي هواء ذكي', cat: 3, brand: 3, price: 175000, cost: 128000, qty: 3, serials: true, sold: 12, desc: 'فلتر HEPA ويعمل من التطبيق.' },
  { n: 11, name: 'قلاية هوائية ٥ لتر', cat: 4, brand: 5, price: 135000, compare: 160000, cost: 99000, qty: 11, featured: true, sold: 97, desc: 'طبخ صحي بلا زيت مع ٨ برامج جاهزة.' },
  { n: 12, name: 'طقم قدور غير لاصقة ٧ قطع', cat: 4, brand: 7, price: 98000, cost: 70000, qty: 8, sold: 33, desc: 'طلاء تيتانيوم يتحمل الاستخدام اليومي.' },
  { n: 13, name: 'خلاط كهربائي', cat: 4, brand: 5, price: 62000, cost: 44000, qty: 0, sold: 41, desc: 'محرك ٧٠٠ واط ووعاء زجاجي.' },
  { n: 14, name: 'ماكينة حلاقة كهربائية', cat: 5, brand: 5, price: 76000, cost: 52000, qty: 22, sold: 58, desc: 'شفرات دوارة وتعمل مبللة أو جافة.' },
  { n: 15, name: 'مجفف شعر أيوني', cat: 5, brand: 3, price: 49000, cost: 33000, qty: 15, sold: 47, desc: 'تجفيف سريع ويحافظ على لمعان الشعر.' },
  { n: 16, name: 'ساعة ذكية بشاشة AMOLED', cat: 6, brand: 2, price: 165000, compare: 190000, cost: 125000, qty: 10, featured: true, serials: true, sold: 36, desc: 'تتبع النوم والنبض والتمارين وبطارية أسبوع.', variants: [{ title: '٤٠ ملم', options: { المقاس: '40mm' }, qty: 6 }, { title: '٤٤ ملم', options: { المقاس: '44mm' }, qty: 4, price: 180000 }] },
  { n: 17, name: 'سوار رياضي', cat: 6, brand: 3, price: 29000, cost: 18000, qty: 44, sold: 210, desc: 'خطوات، نبض، إشعارات، وبطارية أسبوعين.' },
  { n: 18, name: 'مكعبات بناء ٥٠٠ قطعة', cat: 7, brand: null, price: 35000, cost: 21000, qty: 19, sold: 66, desc: 'تنمي الخيال للأعمار ٦ سنوات فما فوق.' },
  { n: 19, name: 'حقيبة ظهر للابتوب', cat: 8, brand: null, price: 42000, cost: 26000, qty: 27, sold: 80, desc: 'مقاومة للماء بجيب مبطّن حتى ١٦ إنش ومنفذ USB.', variants: [{ title: 'رمادي', options: { اللون: 'رمادي' }, qty: 15 }, { title: 'أسود', options: { اللون: 'أسود' }, qty: 12 }] },
  { n: 20, name: 'حقيبة سفر متوسطة', cat: 8, brand: null, price: 89000, cost: 60000, qty: 7, sold: 18, desc: 'هيكل صلب خفيف وعجلات تدور ٣٦٠ درجة.' },
];

export const demoProducts: Product[] = [];
export const demoVariants: ProductVariant[] = [];
export const demoStock: StockLevel[] = [];
/** تكلفة كل نسخة (للوحة التحكم فقط) */
export const demoCosts: Record<string, number> = {};

let vn = 0;
for (const s of seeds) {
  const productId = uid(4, s.n);
  const variants = s.variants ?? [{ title: 'افتراضي', options: {}, qty: s.qty }];
  demoProducts.push({
    id: productId, name: s.name, slug: `p-${s.n}`, description: s.desc, category_id: uid(2, s.cat), brand_id: s.brand ? uid(3, s.brand) : null,
    unit: 'قطعة', tags: [], specs: (s.specs ?? []).map(([label, value]) => ({ label, value })), warranty: s.serials ? 'ضمان سنة' : null,
    option_names: s.variants ? Object.keys(s.variants[0].options) : [], has_variants: !!s.variants, track_serials: !!s.serials,
    is_published: true, is_featured: !!s.featured, allow_request: true, cover_key: null, sold_count: s.sold ?? 0,
    rating_avg: 4 + ((s.n * 7) % 10) / 10, rating_count: (s.sold ?? 0) > 0 ? Math.round((s.sold ?? 0) / 6) : 0,
    created_by: null, created_at: new Date(Date.parse(NOW) - s.n * 86_400_000 * 3).toISOString(), updated_at: NOW, archived_at: null,
  });
  variants.forEach((v, i) => {
    vn += 1;
    const id = uid(5, vn);
    const price = v.price ?? s.price;
    demoVariants.push({
      id, product_id: productId, title: v.title, options: v.options, sku: `RQ-${String(vn).padStart(5, '0')}`, barcode: null,
      price, compare_at_price: s.compare ?? null, wholesale_price: null, min_stock: 5, image_key: null, available_qty: v.qty,
      weight_g: null, is_active: true, sort: i, created_at: NOW, updated_at: NOW,
    });
    demoCosts[id] = s.cost;
    const main = Math.ceil(v.qty * 0.7);
    demoStock.push({ variant_id: id, warehouse_id: demoWarehouses[0].id, qty: main, reserved: 0, updated_at: NOW });
    demoStock.push({ variant_id: id, warehouse_id: demoWarehouses[1].id, qty: v.qty - main, reserved: 0, updated_at: NOW });
  });
}

export const demoBanners: Banner[] = [
  { id: uid(6, 1), title: 'أسبوع الإلكترونيات', subtitle: 'خصومات حتى ٢٥٪ على السماعات والشواحن', image_key: null, link_kind: 'category', link_value: uid(2, 2), placement: 'home_hero', sort: 1, is_active: true, starts_at: null, ends_at: null, created_at: NOW },
  { id: uid(6, 2), title: 'مطبخك أذكى', subtitle: 'القلاية الهوائية بسعر خاص', image_key: null, link_kind: 'product', link_value: uid(4, 11), placement: 'home_hero', sort: 2, is_active: true, starts_at: null, ends_at: null, created_at: NOW },
  { id: uid(6, 3), title: 'توصيل مجاني', subtitle: 'لكل الطلبات فوق ١٥٠ ألف دينار', image_key: null, link_kind: 'none', link_value: null, placement: 'home_strip', sort: 1, is_active: true, starts_at: null, ends_at: null, created_at: NOW },
];

export const demoHomeSections: HomeSection[] = [
  { id: uid(7, 1), title: 'عروض اليوم', kind: 'on_sale', category_id: null, brand_id: null, product_ids: [], max_items: 10, sort: 1, is_active: true, created_at: NOW },
  { id: uid(7, 2), title: 'الأكثر مبيعاً', kind: 'best_sellers', category_id: null, brand_id: null, product_ids: [], max_items: 10, sort: 2, is_active: true, created_at: NOW },
  { id: uid(7, 3), title: 'وصل حديثاً', kind: 'new', category_id: null, brand_id: null, product_ids: [], max_items: 10, sort: 3, is_active: true, created_at: NOW },
  { id: uid(7, 4), title: 'للمطبخ', kind: 'category', category_id: uid(2, 4), brand_id: null, product_ids: [], max_items: 10, sort: 4, is_active: true, created_at: NOW },
];

export const demoZones: DeliveryZone[] = [
  { id: uid(8, 1), governorate: 'baghdad', fee: 5000, eta_text: 'خلال ٢٤ ساعة', is_active: true, sort: 1 },
  { id: uid(8, 2), governorate: 'basra', fee: 8000, eta_text: '٢–٣ أيام', is_active: true, sort: 2 },
  { id: uid(8, 3), governorate: 'najaf', fee: 8000, eta_text: '٢–٣ أيام', is_active: true, sort: 3 },
  { id: uid(8, 4), governorate: 'erbil', fee: 10000, eta_text: '٢–٤ أيام', is_active: true, sort: 4 },
];

export const demoCustomers: Customer[] = [
  { id: uid(9, 1), profile_id: null, name: 'زبون نقدي', phone: null, phone2: null, governorate: null, city: null, address: null, notes: null, tags: [], credit_limit: null, is_cash_customer: true, created_by: null, created_at: NOW, updated_at: NOW },
  { id: uid(9, 2), profile_id: uid(10, 2), name: 'علي حسين كاظم', phone: '+9647701234567', phone2: null, governorate: 'baghdad', city: 'بغداد', address: 'المنصور', notes: null, tags: ['دائم'], credit_limit: 500000, is_cash_customer: false, created_by: null, created_at: NOW, updated_at: NOW },
  { id: uid(9, 3), profile_id: uid(10, 3), name: 'زينب عبد الله', phone: '+9647812345678', phone2: null, governorate: 'basra', city: 'البصرة', address: 'العشار', notes: null, tags: [], credit_limit: null, is_cash_customer: false, created_by: null, created_at: NOW, updated_at: NOW },
  { id: uid(9, 4), profile_id: null, name: 'محل النور للموبايل', phone: '+9647509876543', phone2: null, governorate: 'baghdad', city: 'بغداد', address: 'شارع الصناعة', notes: 'تاجر جملة', tags: ['جملة'], credit_limit: 2000000, is_cash_customer: false, created_by: null, created_at: NOW, updated_at: NOW },
];

export const demoSuppliers: Supplier[] = [
  { id: uid(11, 1), name: 'شركة الرافدين للإلكترونيات', company: 'الرافدين', phone: '+9647801112233', phone2: null, address: 'بغداد — السنك', notes: null, created_at: NOW, updated_at: NOW },
  { id: uid(11, 2), name: 'مؤسسة دجلة للأجهزة المنزلية', company: 'دجلة', phone: '+9647712223344', phone2: null, address: 'بغداد — الشورجة', notes: null, created_at: NOW, updated_at: NOW },
];

const orderOf = (n: number, customer: number, status: Order['status'], pm: Order['payment_method'], items: [number, number][], minutesAgo: number): { order: Order; items: OrderItem[] } => {
  const id = uid(12, n);
  const lines: OrderItem[] = items.map(([vIdx, qty], i) => {
    const v = demoVariants[vIdx];
    const p = demoProducts.find((x) => x.id === v.product_id)!;
    return { id: uid(13, n * 10 + i), order_id: id, product_id: p.id, variant_id: v.id, name: p.name, variant_title: v.title === 'افتراضي' ? null : v.title, sku: v.sku, image_key: null, qty, unit_price: v.price, line_total: v.price * qty };
  });
  const subtotal = lines.reduce((s, l) => s + l.line_total, 0);
  const fee = subtotal >= 150000 ? 0 : 5000;
  const created = new Date(Date.parse(NOW) - minutesAgo * 60_000).toISOString();
  const c = demoCustomers[customer];
  return {
    order: {
      id, number: `O-${String(1000 + n).padStart(6, '0')}`, profile_id: c.profile_id, customer_id: c.id, status, payment_method: pm,
      payment_status: status === 'delivered' || pm === 'online' ? 'paid' : 'unpaid', fulfillment: 'delivery',
      address: { recipient_name: c.name, phone: c.phone ?? '', governorate: c.governorate ?? 'baghdad', city: c.city, area: c.address, street: null, landmark: 'قرب جامع الرحمن', lat: null, lng: null },
      delivery_zone_id: demoZones[0].id, warehouse_id: demoWarehouses[0].id, subtotal, discount: 0, coupon_code: null, delivery_fee: fee, total: subtotal + fee,
      customer_note: null, staff_note: null, invoice_id: null, cancel_reason: null, created_at: created, updated_at: created,
      confirmed_at: status !== 'pending' ? created : null, delivered_at: status === 'delivered' ? created : null, cancelled_at: null,
    },
    items: lines,
  };
};

const ordersBuilt = [
  orderOf(1, 1, 'pending', 'cod', [[0, 1], [1, 2]], 12),
  orderOf(2, 2, 'pending', 'online', [[5, 1]], 40),
  orderOf(3, 1, 'preparing', 'office', [[13, 1]], 180),
  orderOf(4, 2, 'out_for_delivery', 'cod', [[10, 1], [1, 1]], 420),
  orderOf(5, 1, 'delivered', 'cod', [[16, 2]], 2900),
];
export const demoOrders: Order[] = ordersBuilt.map((o) => o.order);
export const demoOrderItems: OrderItem[] = ordersBuilt.flatMap((o) => o.items);

export const demoRequests: ProductRequest[] = [
  { id: uid(14, 1), number: 'RQ-000001', profile_id: uid(10, 2), customer_id: uid(9, 2), title: 'شاحن سيارة مغناطيسي', details: 'يدعم الشحن اللاسلكي ويثبت على فتحة التكييف', image_key: null, link_url: null, qty: 2, budget: 40000, status: 'new', staff_reply: null, product_id: null, created_at: NOW, updated_at: NOW },
  { id: uid(14, 2), number: 'RQ-000002', profile_id: uid(10, 3), customer_id: uid(9, 3), title: 'ماكينة قهوة كبسولات', details: null, image_key: null, link_url: null, qty: 1, budget: null, status: 'sourcing', staff_reply: 'نوفرها خلال أسبوع إن شاء الله', product_id: null, created_at: NOW, updated_at: NOW },
];

export const demoCoupons: Coupon[] = [
  { id: uid(15, 1), code: 'WELCOME10', kind: 'percent', value: 10, min_subtotal: 25000, max_discount: 20000, usage_limit: null, per_customer_limit: 1, used_count: 37, starts_at: null, ends_at: null, is_active: true, created_at: NOW },
  { id: uid(15, 2), code: 'FREESHIP', kind: 'free_delivery', value: 0, min_subtotal: 50000, max_discount: null, usage_limit: 200, per_customer_limit: null, used_count: 64, starts_at: null, ends_at: null, is_active: true, created_at: NOW },
];

/** أدوات صغيرة للبحث داخل البيانات التجريبية */
export const demo = {
  variantsOf: (productId: string) => demoVariants.filter((v) => v.product_id === productId),
  productOf: (variantId: string) => demoProducts.find((p) => p.id === demoVariants.find((v) => v.id === variantId)?.product_id),
  priceRange: (productId: string) => {
    const vs = demoVariants.filter((v) => v.product_id === productId);
    const prices = vs.map((v) => v.price);
    return { min: Math.min(...prices), max: Math.max(...prices), compare: vs[0]?.compare_at_price ?? null, available: vs.reduce((s, v) => s + v.available_qty, 0) };
  },
};
