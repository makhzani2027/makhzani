/**
 * أشكال نتائج دوال المتجر كما يتوقعها التطبيق.
 * الجداول نفسها من @raqeem/shared (types.ts) حرفياً؛ هنا فقط ما تعيده store_home / store_search / store_product
 * وغيرها كـ JSON، لأنها غير معرّفة في العقد المشترك بعد (طلب للقائد بنقلها إلى shared).
 */
import type {
  AppConfigSettings, Banner, Brand, CartQuote, Category, CheckoutSettings, DeliveryZone, Fulfillment, HomeSectionKind,
  Notification, Order, OrderEvent, OrderItem, OrderPaymentMethod, Product, ProductImage, ProductRequest, ProductVariant,
  StoreSettings, Address, Profile, Money,
} from '@raqeem/shared';

/** صف منتج في القوائم (store_search، أقسام الرئيسية، المشابهة) */
export interface StoreProductCard {
  id: string;
  slug: string;
  name: string;
  cover_key: string | null;
  category_id: string | null;
  brand_id: string | null;
  brand_name: string | null;
  price_min: Money;
  price_max: Money;
  /** السعر قبل الخصم لأرخص نسخة (null = لا خصم) */
  compare_at_price: Money | null;
  /** مجموع المتوفر في كل النسخ الفعالة */
  available_qty: number;
  rating_avg: number;
  rating_count: number;
  sold_count: number;
  created_at: string;
  in_stock: boolean;
  is_featured: boolean;
  allow_request: boolean;
  has_variants: boolean;
  /** عدد النسخ الفعالة؛ إن كانت واحدة فهذه هي (للإضافة السريعة من البطاقة) */
  variants_count: number;
  default_variant_id: string | null;
}

/** بانر كما يعيده store_home */
export type StoreBanner = Pick<Banner, 'id' | 'title' | 'subtitle' | 'image_key' | 'link_kind' | 'link_value' | 'placement' | 'sort'>;
/** قسم كما يعيده store_home */
export type StoreCategory = Pick<Category, 'id' | 'parent_id' | 'name' | 'slug' | 'image_key' | 'icon' | 'sort'>;

/** store_search(...) */
export interface StoreSearchResult {
  total: number;
  items: StoreProductCard[];
}

export interface StoreHomeSection {
  id: string;
  title: string;
  kind: HomeSectionKind;
  category_id: string | null;
  brand_id: string | null;
  products: StoreProductCard[];
}

/** store_home() */
export interface StoreHome {
  banners: StoreBanner[];
  categories: StoreCategory[];
  sections: StoreHomeSection[];
}

export type SearchSort = 'relevance' | 'newest' | 'price_asc' | 'price_desc' | 'best';

export interface SearchParams {
  q?: string | null;
  category?: string | null;
  brand?: string | null;
  min_price?: number | null;
  max_price?: number | null;
  in_stock?: boolean | null;
  sort?: SearchSort;
  lim?: number;
  off?: number;
}

/** نسخة كما يراها الزبون (بلا تكلفة ولا سعر جملة) */
export type PublicVariant = Pick<
  ProductVariant,
  'id' | 'title' | 'options' | 'sku' | 'barcode' | 'price' | 'compare_at_price' | 'image_key' | 'available_qty' | 'weight_g' | 'sort'
>;

export interface StoreReview {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  /** الاسم الأول للزبون أو «زبون» */
  author: string;
}

/** store_product(slug_or_id) */
export interface StoreProductDetail {
  product: Omit<Product, 'created_by'>;
  variants: PublicVariant[];
  images: Pick<ProductImage, 'id' | 'key' | 'alt' | 'sort'>[];
  brand: Pick<Brand, 'id' | 'name' | 'slug' | 'logo_key'> | null;
  category: Pick<Category, 'id' | 'name' | 'slug' | 'parent_id'> | null;
  reviews: StoreReview[];
  similar: StoreProductCard[];
}

/** الإعدادات العامة (app_settings حيث is_public) */
export interface PublicSettings {
  store: StoreSettings;
  checkout: CheckoutSettings;
  app: AppConfigSettings;
}

/** معلومات نسخة للسلة (قراءة مباشرة من product_variants + products) */
export interface VariantInfo {
  variant_id: string;
  product_id: string;
  product_slug: string;
  name: string;
  variant_title: string | null;
  price: Money;
  compare_at_price: Money | null;
  image_key: string | null;
  available_qty: number;
  category_id: string | null;
}

export interface CartLine {
  variant_id: string;
  qty: number;
  /** السعر الذي رآه الزبون عند الإضافة — للتنبيه إن تغيّر */
  price_seen?: Money;
}

export interface PlaceOrderInput {
  items: { variant_id: string; qty: number }[];
  address_id: string | null;
  fulfillment: Fulfillment;
  payment_method: OrderPaymentMethod;
  coupon_code: string | null;
  note: string | null;
}

/** place_order(...) */
export interface PlaceOrderResult {
  order_id: string;
  number: string;
  total: Money;
  status: 'pending';
  payment_method: OrderPaymentMethod;
}

/** quote_cart(...) = CartQuote + سبب تعذّر التوصيل + عدد القطع */
export interface StoreQuote extends CartQuote {
  delivery_error: string | null;
  items_count: number;
}

/** payments {action:'create'} */
export interface PaymentCreateResult {
  transaction_id: string | null;
  checkout_url: string | null;
  amount: Money;
  /** وضع العرض فقط: لا بوابة، يُعتبر مدفوعاً */
  paid?: boolean;
}

export interface OrderDetail {
  order: Order;
  items: OrderItem[];
  events: OrderEvent[];
}

export type AddressInput = Omit<Address, 'id' | 'profile_id' | 'created_at' | 'lat' | 'lng'> & { lat?: number | null; lng?: number | null };

export interface RequestInput {
  title: string;
  details: string | null;
  image_key: string | null;
  link_url: string | null;
  qty: number;
  budget: Money | null;
}

export interface ProfileInput {
  full_name: string;
  phone: string;
  governorate: string;
}

export type { Address, CartQuote, DeliveryZone, Notification, Order, OrderItem, OrderEvent, Profile, ProductRequest, Category, Brand, Banner };
