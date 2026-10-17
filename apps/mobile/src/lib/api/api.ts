import type { OrderPaymentStatus } from '@raqeem/shared';
import type {
  Address, AddressInput, Brand, CartLine, CartQuote, Category, DeliveryZone, Notification, Order, OrderDetail, OrderItem,
  PlaceOrderInput, PlaceOrderResult, Profile, ProfileInput, ProductRequest, PublicSettings, RequestInput, SearchParams,
  StoreHome, StoreProductCard, StoreProductDetail, VariantInfo,
} from './types';

export type OrderWithItems = Order & { items: OrderItem[] };

/**
 * كل ما يحتاجه التطبيق من الخادم، بتنفيذين: Supabase الحقيقي، ووضع العرض (ذاكرة فقط).
 * الشاشات لا تعرف أيهما يعمل.
 */
export interface Api {
  // ------------------------------------------------ الكتالوج (للضيف أيضاً)
  home(): Promise<StoreHome>;
  categories(): Promise<Category[]>;
  brands(): Promise<Brand[]>;
  search(p: SearchParams): Promise<StoreProductCard[]>;
  product(slugOrId: string): Promise<StoreProductDetail | null>;
  productCards(ids: string[]): Promise<StoreProductCard[]>;
  variants(ids: string[]): Promise<VariantInfo[]>;
  settings(): Promise<PublicSettings>;
  zones(): Promise<DeliveryZone[]>;
  quote(items: { variant_id: string; qty: number }[], governorate: string | null, coupon: string | null): Promise<CartQuote>;

  // ------------------------------------------------ الحساب
  profile(uid: string): Promise<Profile | null>;
  upsertProfile(input: ProfileInput): Promise<void>;
  deleteAccount(): Promise<void>;

  // ------------------------------------------------ السلة والمفضلة (المسجّل)
  cartGet(uid: string): Promise<CartLine[]>;
  cartSet(uid: string, variantId: string, qty: number): Promise<void>;
  cartClear(uid: string): Promise<void>;
  favoritesGet(uid: string): Promise<string[]>;
  favoriteSet(uid: string, productId: string, on: boolean): Promise<void>;

  // ------------------------------------------------ العناوين
  addresses(uid: string): Promise<Address[]>;
  saveAddress(uid: string, id: string | null, input: AddressInput): Promise<Address>;
  deleteAddress(uid: string, id: string): Promise<void>;
  setDefaultAddress(uid: string, id: string): Promise<void>;

  // ------------------------------------------------ الطلبات
  placeOrder(input: PlaceOrderInput): Promise<PlaceOrderResult>;
  orders(uid: string): Promise<OrderWithItems[]>;
  order(id: string): Promise<OrderDetail | null>;
  /** يستدعي onChange عند أي تغيّر في الطلب أو أحداثه (لحظياً) — يعيد دالة الإلغاء */
  subscribeOrder(id: string, onChange: () => void): () => void;
  cancelOrder(id: string, reason: string | null): Promise<void>;
  startPayment(orderId: string): Promise<{ checkout_url: string | null; paid?: boolean }>;
  paymentStatus(orderId: string): Promise<OrderPaymentStatus>;
  submitReview(productId: string, rating: number, comment: string | null): Promise<void>;

  // ------------------------------------------------ طلبات التوفير
  requests(uid: string): Promise<ProductRequest[]>;
  createRequest(input: RequestInput): Promise<{ id: string; number: string }>;
  uploadRequestImage(uid: string, bytes: Uint8Array, contentType: string, ext: string): Promise<string>;

  // ------------------------------------------------ الإشعارات
  notifications(uid: string): Promise<Notification[]>;
  markNotificationsRead(ids: string[] | null): Promise<void>;
  savePushToken(uid: string, token: string, platform: 'android' | 'ios' | 'web'): Promise<void>;
  deletePushToken(uid: string, token: string): Promise<void>;
}
