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
  /** عدد النسخ الفعالة؛ إن كانت واحدة فهذه هي (للإضافة السريعة من البطاقة) */
  variant_count: number;
  default_variant_id: string | null;
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
  banners: Banner[];
  categories: Category[];
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
  'id' | 'product_id' | 'title' | 'options' | 'sku' | 'price' | 'compare_at_price' | 'image_key' | 'available_qty' | 'is_active' | 'sort'
>;

export interface StoreReview {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  author_name: string | null;
}

/** store_product(slug_or_id) */
export interface StoreProductDetail {
  product: Product;
  variants: PublicVariant[];
  images: ProductImage[];
  brand: Brand | null;
  category: Category | null;
  reviews: StoreReview[];
  related: StoreProductCard[];
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
