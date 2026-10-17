/**
 * عقد البيانات — أنواع جداول قاعدة البيانات كما هي حرفياً (نفس أسماء الأعمدة).
 * المرجع الكامل: system/06-database.md. أي تغيير هنا يقابله migration جديد، والعكس.
 *
 * اصطلاحات:
 * - كل المعرفات uuid كنص. التواريخ نص ISO (timestamptz).
 * - المبالغ numeric(14,2) تصل من Supabase كـ number. العملة الافتراضية دينار عراقي (بلا كسور).
 * - الكميات numeric(14,3) (لدعم الوزن بالكيلو) — تُعرض بلا كسور للقطع.
 * - `image_key` مفتاح في التخزين بلا امتداد؛ الرابط يُبنى بـ mediaUrl().
 */

export type UUID = string;
export type ISODate = string;
export type Money = number;
export type Qty = number;

// ============================================================ القيم الثابتة (enums في Postgres)

/** العملات: الدينار أساس الحسابات، والدولار عملة ثانية بسعر صرف لكل مستند */
export const CURRENCIES = ['IQD', 'USD'] as const;
export type CurrencyCode = (typeof CURRENCIES)[number];

export const MONEY_ACCOUNT_KINDS = ['cash', 'bank', 'wallet'] as const;
export type MoneyAccountKind = (typeof MONEY_ACCOUNT_KINDS)[number];

export const QUOTATION_STATUSES = ['draft', 'sent', 'accepted', 'converted', 'expired', 'cancelled'] as const;
export type QuotationStatus = (typeof QUOTATION_STATUSES)[number];

export const STOCK_VOUCHER_KINDS = ['in', 'out', 'sample_out', 'sample_return', 'damage'] as const;
export type StockVoucherKind = (typeof STOCK_VOUCHER_KINDS)[number];

export const PRICE_TIERS = ['retail', 'wholesale'] as const;
export type PriceTier = (typeof PRICE_TIERS)[number];

export const PROFILE_KINDS = ['customer', 'staff'] as const;
export type ProfileKind = (typeof PROFILE_KINDS)[number];

export const PROFILE_STATUSES = ['active', 'blocked'] as const;
export type ProfileStatus = (typeof PROFILE_STATUSES)[number];

export const MOVEMENT_KINDS = [
  'opening', // رصيد افتتاحي
  'purchase', // شراء من مورد
  'purchase_return', // إرجاع لمورد
  'sale', // بيع (نقطة البيع أو طلب سُلّم)
  'sale_return', // إرجاع من زبون
  'adjustment', // تعديل يدوي
  'damage', // تالف/مفقود
  'transfer_in', // نقل وارد
  'transfer_out', // نقل صادر
  'stocktake', // فرق الجرد
  'manual_in', // سند إدخال مخزني (هدية، تصحيح، إنتاج…)
  'manual_out', // سند إخراج مخزني (استعمال داخلي…)
  'sample_out', // خروج عينة (لزبون أو معرض)
  'sample_return', // رجوع عينة
] as const;
export type MovementKind = (typeof MOVEMENT_KINDS)[number];

export const INVOICE_KINDS = ['sale', 'sale_return', 'purchase', 'purchase_return'] as const;
export type InvoiceKind = (typeof INVOICE_KINDS)[number];

export const INVOICE_CHANNELS = ['pos', 'online', 'manual'] as const;
export type InvoiceChannel = (typeof INVOICE_CHANNELS)[number];

export const INVOICE_STATUSES = ['posted', 'void'] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const PAYMENT_METHODS = [
  'cash', // نقداً
  'card', // بطاقة (جهاز POS في المكتب)
  'zaincash',
  'fib', // المصرف العراقي الأول
  'qicard',
  'asiapay',
  'wayl', // بوابة الدفع الإلكتروني (رابط دفع)
  'bank_transfer',
  'other',
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_DIRECTIONS = ['in', 'out'] as const;
export type PaymentDirection = (typeof PAYMENT_DIRECTIONS)[number];

export const ORDER_STATUSES = [
  'pending', // بانتظار التأكيد
  'confirmed', // مؤكد
  'preparing', // قيد التجهيز
  'ready', // جاهز (للاستلام أو للتوصيل)
  'out_for_delivery', // مع المندوب
  'delivered', // تم التسليم
  'cancelled', // ملغي
  'returned', // مُرجع بعد التسليم
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** طريقة دفع الطلب من التطبيق */
export const ORDER_PAYMENT_METHODS = [
  'cod', // الدفع عند الاستلام (نقداً للمندوب)
  'office', // الدفع حضورياً في المكتب (تواصل واتساب/اتصال)
  'online', // دفع إلكتروني عبر البوابة
] as const;
export type OrderPaymentMethod = (typeof ORDER_PAYMENT_METHODS)[number];

export const ORDER_PAYMENT_STATUSES = ['unpaid', 'pending', 'paid', 'refunded', 'failed'] as const;
export type OrderPaymentStatus = (typeof ORDER_PAYMENT_STATUSES)[number];

export const FULFILLMENTS = ['delivery', 'pickup'] as const;
export type Fulfillment = (typeof FULFILLMENTS)[number];

export const REQUEST_STATUSES = ['new', 'reviewing', 'sourcing', 'available', 'fulfilled', 'rejected', 'cancelled'] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const SERIAL_STATUSES = ['in_stock', 'sold', 'returned', 'defective'] as const;
export type SerialStatus = (typeof SERIAL_STATUSES)[number];

export const COUPON_KINDS = ['percent', 'fixed', 'free_delivery'] as const;
export type CouponKind = (typeof COUPON_KINDS)[number];

export const BANNER_LINK_KINDS = ['none', 'product', 'category', 'brand', 'search', 'url'] as const;
export type BannerLinkKind = (typeof BANNER_LINK_KINDS)[number];

export const BANNER_PLACEMENTS = ['home_hero', 'home_strip', 'category_top'] as const;
export type BannerPlacement = (typeof BANNER_PLACEMENTS)[number];

export const HOME_SECTION_KINDS = ['featured', 'new', 'best_sellers', 'on_sale', 'category', 'brand', 'manual'] as const;
export type HomeSectionKind = (typeof HOME_SECTION_KINDS)[number];

export const PAYMENT_TX_STATUSES = ['created', 'pending', 'paid', 'failed', 'cancelled', 'refunded'] as const;
export type PaymentTxStatus = (typeof PAYMENT_TX_STATUSES)[number];

export const CASH_SESSION_STATUSES = ['open', 'closed'] as const;
export type CashSessionStatus = (typeof CASH_SESSION_STATUSES)[number];

export const DOC_STATUSES = ['draft', 'applied', 'cancelled'] as const;
export type DocStatus = (typeof DOC_STATUSES)[number];

export const NOTIFICATION_KINDS = ['order', 'request', 'promo', 'system'] as const;
export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

// ============================================================ المستخدمون والصلاحيات

export interface Profile {
  id: UUID; // = auth.users.id
  kind: ProfileKind;
  full_name: string | null;
  phone: string | null; // بصيغة +9647XXXXXXXXX
  email: string | null; // نسخة من auth للعرض
  avatar_key: string | null;
  role_id: UUID | null; // للموظفين فقط
  is_owner: boolean; // صاحب المتجر: كل الصلاحيات دائماً
  status: ProfileStatus;
  onboarded: boolean; // أكمل الزبون بياناته بعد Google
  governorate: string | null; // مفتاح من iraq.ts
  prefs: Record<string, unknown>;
  last_seen_at: ISODate | null;
  created_at: ISODate;
  updated_at: ISODate;
}

export interface StaffRole {
  id: UUID;
  name: string;
  description: string | null;
  permissions: string[]; // مفاتيح من permissions.ts
  is_system: boolean; // الأدوار الافتراضية لا تُحذف
  created_at: ISODate;
}

// ============================================================ الأطراف

export interface Customer {
  id: UUID;
  profile_id: UUID | null; // مرتبط بحساب التطبيق، أو null لزبون المحل
  name: string;
  phone: string | null;
  phone2: string | null;
  governorate: string | null;
  city: string | null;
  address: string | null;
  notes: string | null;
  tags: string[];
  credit_limit: Money | null; // حد الدين المسموح (null = بلا حد)
  is_cash_customer: boolean; // «زبون نقدي» الافتراضي لنقطة البيع (صف واحد)
  created_by: UUID | null;
  created_at: ISODate;
  updated_at: ISODate;
}

export interface Supplier {
  id: UUID;
  name: string;
  company: string | null;
  phone: string | null;
  phone2: string | null;
  address: string | null;
  notes: string | null;
  created_at: ISODate;
  updated_at: ISODate;
}

/** view: customer_balances — موجب = على الزبون دين لنا */
export interface CustomerBalance {
  customer_id: UUID;
  sales_total: Money;
  returns_total: Money;
  paid_total: Money; // ما دفعه (صافي بعد المسترد)
  balance: Money;
  balance_usd: Money; // رصيد مستندات الدولار منفصل (لا يُخلط بالدينار)
  last_activity_at: ISODate | null;
}

/** view: supplier_balances — موجب = علينا دين للمورد */
export interface SupplierBalance {
  supplier_id: UUID;
  purchases_total: Money;
  returns_total: Money;
  paid_total: Money;
  balance: Money;
  balance_usd: Money; // رصيد مستندات الدولار منفصل (لا يُخلط بالدينار)
  last_activity_at: ISODate | null;
}

// ============================================================ الكتالوج

export interface Category {
  id: UUID;
  parent_id: UUID | null;
  name: string;
  slug: string;
  description: string | null;
  image_key: string | null;
  icon: string | null; // IconName من icons.ts
  sort: number;
  is_visible: boolean; // يظهر في المتجر
  created_at: ISODate;
}

export interface Brand {
  id: UUID;
  name: string;
  slug: string;
  logo_key: string | null;
  sort: number;
  created_at: ISODate;
}

export interface ProductSpec {
  label: string;
  value: string;
}

export interface Product {
  id: UUID;
  name: string;
  slug: string;
  description: string | null; // Markdown بسيط
  category_id: UUID | null;
  brand_id: UUID | null;
  unit: string; // قطعة، علبة، كيلو…
  tags: string[];
  specs: ProductSpec[];
  warranty: string | null;
  option_names: string[]; // أسماء الخيارات بالترتيب: ['اللون','المقاس']
  has_variants: boolean;
  track_serials: boolean; // تتبع الأرقام التسلسلية (أجهزة)
  track_expiry: boolean; // تتبع الدفعات وتواريخ الصلاحية (يُباع الأقرب انتهاءً أولاً FEFO)
  is_published: boolean; // يظهر في المتجر
  is_featured: boolean;
  allow_request: boolean; // زر «اطلب توفيره» عند النفاد
  cover_key: string | null; // نسخة من أول صورة (للقوائم السريعة)
  sold_count: number; // مخزّن (يُحدَّث بمشغّل)
  rating_avg: number;
  rating_count: number;
  created_by: UUID | null;
  created_at: ISODate;
  updated_at: ISODate;
  archived_at: ISODate | null; // مؤرشف (لا يُحذف أبداً إن كان له حركات)
}

export interface ProductVariant {
  id: UUID;
  product_id: UUID;
  title: string; // «أحمر / XL» أو «افتراضي»
  options: Record<string, string>; // {"اللون":"أحمر","المقاس":"XL"}
  sku: string; // فريد
  barcode: string | null; // فريد إن وُجد (EAN-13 أو أي رمز)
  price: Money; // سعر البيع
  compare_at_price: Money | null; // السعر قبل الخصم (يُعرض مشطوباً)
  wholesale_price: Money | null; // سعر الجملة (اختياري، لنقطة البيع)
  min_stock: Qty; // حد التنبيه
  image_key: string | null;
  available_qty: Qty; // مخزّن: مجموع (qty - reserved) في المخازن القابلة للبيع
  weight_g: number | null;
  is_active: boolean;
  sort: number;
  created_at: ISODate;
  updated_at: ISODate;
}

/** للموظفين بصلاحية costs.view فقط — منفصل حتى لا يراه الزبون أبداً */
export interface VariantCost {
  variant_id: UUID;
  avg_cost: Money; // متوسط مرجّح
  last_cost: Money;
  updated_at: ISODate;
}

export interface ProductImage {
  id: UUID;
  product_id: UUID;
  key: string;
  alt: string | null;
  sort: number;
  created_at: ISODate;
}

// ============================================================ الفروع والحسابات المالية

export interface Branch {
  id: UUID;
  name: string; // «فرع بغداد الرئيسي»
  address: string | null;
  phone: string | null;
  is_default: boolean;
  is_active: boolean;
  created_at: ISODate;
}

/** صندوق نقدي أو حساب مصرفي أو محفظة (زين كاش…) — لكل واحد عملة */
export interface MoneyAccount {
  id: UUID;
  name: string;
  kind: MoneyAccountKind;
  currency: CurrencyCode;
  branch_id: UUID | null;
  opening_balance: Money;
  is_default: boolean; // الصندوق الافتراضي لنقطة البيع
  is_active: boolean;
  created_at: ISODate;
}

/** view: money_account_balances */
export interface MoneyAccountBalance {
  account_id: UUID;
  balance: Money; // بعملة الحساب
  balance_iqd: Money;
}

export interface AccountTransfer {
  id: UUID;
  number: string;
  from_account_id: UUID;
  to_account_id: UUID;
  amount: Money; // بعملة حساب المصدر
  exchange_rate: number; // عند اختلاف العملتين
  note: string | null;
  created_by: UUID | null;
  created_at: ISODate;
}

// ============================================================ المخزون

/** وحدات التعبئة: باركود الكرتونة = ١٢ قطعة مثلاً */
export interface VariantUnit {
  id: UUID;
  variant_id: UUID;
  unit_name: string; // كرتونة، علبة، درزن
  factor: number; // عدد القطع
  barcode: string | null; // فريد عبر كل الباركودات
  price: Money | null; // سعر الوحدة (null = factor × سعر القطعة)
  created_at: ISODate;
}

/** دفعة بتاريخ صلاحية (للمنتجات track_expiry) */
export interface StockLot {
  id: UUID;
  variant_id: UUID;
  warehouse_id: UUID;
  lot_code: string;
  expiry_date: string | null; // YYYY-MM-DD
  qty: Qty;
  created_at: ISODate;
}

/** سند مخزني يدوي: إدخال، إخراج، عينة، تالف */
export interface StockVoucher {
  id: UUID;
  number: string; // SV-000123
  kind: StockVoucherKind;
  warehouse_id: UUID;
  customer_id: UUID | null; // لمن خرجت العينة
  reason: string;
  note: string | null;
  created_by: UUID | null;
  created_at: ISODate;
}

export interface StockVoucherItem {
  voucher_id: UUID;
  variant_id: UUID;
  qty: Qty;
  unit_cost: Money | null;
  lot_code: string | null;
  expiry_date: string | null;
}

export interface Warehouse {
  id: UUID;
  name: string;
  code: string; // قصير: MAIN، SHOP…
  branch_id: UUID | null;
  address: string | null;
  is_default: boolean;
  is_sellable: boolean; // يدخل رصيده في «المتوفر» بالمتجر
  is_active: boolean;
  created_at: ISODate;
}

export interface StockLevel {
  variant_id: UUID;
  warehouse_id: UUID;
  qty: Qty;
  reserved: Qty; // محجوز لطلبات التطبيق غير المسلّمة
  updated_at: ISODate;
}

export interface StockMovement {
  id: number;
  variant_id: UUID;
  warehouse_id: UUID;
  kind: MovementKind;
  qty: Qty; // موجب = دخول، سالب = خروج
  balance_after: Qty;
  unit_cost: Money | null;
  ref_type: 'invoice' | 'order' | 'adjustment' | 'transfer' | 'stocktake' | null;
  ref_id: UUID | null;
  note: string | null;
  created_by: UUID | null;
  created_at: ISODate;
}

export interface Serial {
  id: UUID;
  variant_id: UUID;
  serial: string;
  status: SerialStatus;
  warehouse_id: UUID | null;
  purchase_invoice_id: UUID | null;
  sale_invoice_id: UUID | null;
  note: string | null;
  created_at: ISODate;
  updated_at: ISODate;
}

export interface Transfer {
  id: UUID;
  number: string;
  from_warehouse_id: UUID;
  to_warehouse_id: UUID;
  note: string | null;
  created_by: UUID | null;
  created_at: ISODate;
}

export interface TransferItem {
  transfer_id: UUID;
  variant_id: UUID;
  qty: Qty;
}

export interface Stocktake {
  id: UUID;
  number: string;
  warehouse_id: UUID;
  status: DocStatus;
  note: string | null;
  created_by: UUID | null;
  created_at: ISODate;
  applied_at: ISODate | null;
}

export interface StocktakeItem {
  stocktake_id: UUID;
  variant_id: UUID;
  expected_qty: Qty; // الرصيد في النظام لحظة الإضافة
  counted_qty: Qty | null; // العدّ الفعلي
}

// ============================================================ عروض الأسعار

export interface Quotation {
  id: UUID;
  number: string; // Q-000123
  status: QuotationStatus;
  customer_id: UUID | null;
  customer_name: string | null; // لزبون غير مسجل
  warehouse_id: UUID;
  currency: CurrencyCode;
  exchange_rate: number;
  subtotal: Money;
  discount: Money;
  total: Money;
  valid_until: string | null; // YYYY-MM-DD
  note: string | null;
  invoice_id: UUID | null; // بعد التحويل لفاتورة
  created_by: UUID | null;
  created_at: ISODate;
}

export interface QuotationItem {
  id: UUID;
  quotation_id: UUID;
  variant_id: UUID;
  name: string;
  variant_title: string | null;
  qty: Qty;
  unit_price: Money;
  discount: Money;
  line_total: Money;
  price_tier: PriceTier;
}

// ============================================================ الفواتير والمال

export interface Invoice {
  id: UUID;
  number: string; // S-000123 …
  kind: InvoiceKind;
  channel: InvoiceChannel;
  status: InvoiceStatus;
  customer_id: UUID | null;
  supplier_id: UUID | null;
  order_id: UUID | null;
  return_of: UUID | null; // الفاتورة الأصلية للإرجاع
  warehouse_id: UUID;
  branch_id: UUID | null;
  quotation_id: UUID | null; // إن حُوّلت من عرض سعر
  currency: CurrencyCode; // عملة الفاتورة
  exchange_rate: number; // دينار لكل دولار وقت الفاتورة (للتحويل والتقارير)
  subtotal: Money; // مجموع البنود بعد خصوماتها
  discount: Money; // خصم على الفاتورة كلها
  delivery_fee: Money;
  total: Money; // subtotal - discount + delivery_fee
  paid: Money; // مخزّن: مجموع الدفعات المرتبطة
  due: Money; // عمود محسوب: total - paid
  cost_total: Money; // مخزّن: تكلفة البضاعة (للربح)
  note: string | null;
  cash_session_id: UUID | null;
  created_by: UUID | null;
  created_at: ISODate;
  voided_at: ISODate | null;
  voided_by: UUID | null;
  void_reason: string | null;
}

export interface InvoiceItem {
  id: UUID;
  invoice_id: UUID;
  variant_id: UUID;
  product_id: UUID;
  name: string; // لقطة وقت البيع
  variant_title: string | null;
  sku: string;
  qty: Qty;
  unit_price: Money;
  discount: Money; // خصم على البند كله
  line_total: Money; // qty * unit_price - discount
  unit_cost: Money; // متوسط التكلفة لحظة البيع (بالدينار)
  serials: string[];
  price_tier: PriceTier; // مفرد أو جملة
  unit_name: string | null; // وحدة التعبئة إن بيعت بالكرتونة مثلاً
  unit_factor: number; // كم قطعة في الوحدة (١ للقطعة)
  lot_code: string | null; // الدفعة (للمنتجات بتاريخ صلاحية)
  expiry_date: string | null; // YYYY-MM-DD
}

export interface Payment {
  id: UUID;
  number: string; // RC-000123 (قبض) / PV-000123 (صرف)
  direction: PaymentDirection;
  method: PaymentMethod;
  amount: Money; // موجب دائماً، بعملة الدفعة
  currency: CurrencyCode;
  exchange_rate: number;
  amount_iqd: Money; // المكافئ بالدينار (عمود محسوب)
  account_id: UUID | null; // الصندوق أو الحساب المصرفي أو المحفظة
  customer_id: UUID | null;
  supplier_id: UUID | null;
  invoice_id: UUID | null;
  order_id: UUID | null;
  cash_session_id: UUID | null;
  reference: string | null; // رقم العملية الإلكترونية
  note: string | null;
  created_by: UUID | null;
  created_at: ISODate;
  voided_at: ISODate | null;
}

export interface Expense {
  id: UUID;
  category: string;
  amount: Money;
  currency: CurrencyCode;
  exchange_rate: number;
  account_id: UUID | null;
  method: PaymentMethod;
  note: string | null;
  spent_at: ISODate;
  cash_session_id: UUID | null;
  created_by: UUID | null;
  created_at: ISODate;
}

export interface CashSession {
  id: UUID;
  status: CashSessionStatus;
  opened_by: UUID;
  opened_at: ISODate;
  opening_float: Money;
  closed_by: UUID | null;
  closed_at: ISODate | null;
  expected_cash: Money | null; // يُحسب عند الإغلاق
  counted_cash: Money | null;
  note: string | null;
}

// ============================================================ المتجر والطلبات

export interface Address {
  id: UUID;
  profile_id: UUID;
  label: string | null; // البيت، العمل…
  recipient_name: string;
  phone: string;
  governorate: string;
  city: string | null;
  area: string | null; // المنطقة/الحي
  street: string | null;
  landmark: string | null; // أقرب نقطة دالة — أساسي في العراق
  lat: number | null;
  lng: number | null;
  is_default: boolean;
  created_at: ISODate;
}

/** لقطة العنوان داخل الطلب */
export type OrderAddress = Pick<Address, 'recipient_name' | 'phone' | 'governorate' | 'city' | 'area' | 'street' | 'landmark' | 'lat' | 'lng'>;

export interface DeliveryZone {
  id: UUID;
  governorate: string; // مفتاح من iraq.ts (فريد)
  fee: Money;
  eta_text: string | null; // «خلال ٢٤ ساعة»
  is_active: boolean;
  sort: number;
}

export interface Order {
  id: UUID;
  number: string; // O-000123
  profile_id: UUID | null;
  customer_id: UUID;
  status: OrderStatus;
  payment_method: OrderPaymentMethod;
  payment_status: OrderPaymentStatus;
  fulfillment: Fulfillment;
  address: OrderAddress | null; // null للاستلام من المكتب
  delivery_zone_id: UUID | null;
  warehouse_id: UUID;
  subtotal: Money;
  discount: Money;
  coupon_code: string | null;
  delivery_fee: Money;
  total: Money;
  customer_note: string | null;
  staff_note: string | null;
  invoice_id: UUID | null; // تُنشأ عند التسليم
  cancel_reason: string | null;
  created_at: ISODate;
  updated_at: ISODate;
  confirmed_at: ISODate | null;
  delivered_at: ISODate | null;
  cancelled_at: ISODate | null;
}

export interface OrderItem {
  id: UUID;
  order_id: UUID;
  product_id: UUID;
  variant_id: UUID;
  name: string;
  variant_title: string | null;
  sku: string;
  image_key: string | null;
  qty: Qty;
  unit_price: Money;
  line_total: Money;
}

export interface OrderEvent {
  id: UUID;
  order_id: UUID;
  status: OrderStatus | null; // null = ملاحظة فقط
  note: string | null;
  is_customer_visible: boolean;
  actor_id: UUID | null;
  created_at: ISODate;
}

export interface PaymentTransaction {
  id: UUID;
  order_id: UUID;
  provider: string; // 'wayl' أو 'mock'
  provider_ref: string | null;
  amount: Money;
  currency: string;
  status: PaymentTxStatus;
  checkout_url: string | null;
  raw: Record<string, unknown>;
  created_at: ISODate;
  updated_at: ISODate;
}

export interface CartItem {
  profile_id: UUID;
  variant_id: UUID;
  qty: Qty;
  updated_at: ISODate;
}

export interface Favorite {
  profile_id: UUID;
  product_id: UUID;
  created_at: ISODate;
}

export interface Coupon {
  id: UUID;
  code: string; // أحرف كبيرة
  kind: CouponKind;
  value: number; // نسبة (٠–١٠٠) أو مبلغ
  min_subtotal: Money;
  max_discount: Money | null;
  usage_limit: number | null;
  per_customer_limit: number | null;
  used_count: number;
  starts_at: ISODate | null;
  ends_at: ISODate | null;
  is_active: boolean;
  created_at: ISODate;
}

export interface Banner {
  id: UUID;
  title: string | null;
  subtitle: string | null;
  image_key: string | null; // null = بانر نصي بألوان الهوية (عنوان + وصف على كتلة الطين أو الحبر)
  link_kind: BannerLinkKind;
  link_value: string | null;
  placement: BannerPlacement;
  sort: number;
  is_active: boolean;
  starts_at: ISODate | null;
  ends_at: ISODate | null;
  created_at: ISODate;
}

export interface HomeSection {
  id: UUID;
  title: string;
  kind: HomeSectionKind;
  category_id: UUID | null;
  brand_id: UUID | null;
  product_ids: UUID[];
  max_items: number;
  sort: number;
  is_active: boolean;
  created_at: ISODate;
}

export interface ProductRequest {
  id: UUID;
  number: string; // RQ-000123
  profile_id: UUID | null;
  customer_id: UUID | null;
  title: string; // اسم المنتج المطلوب
  details: string | null;
  image_key: string | null; // في الحاوية الخاصة
  link_url: string | null;
  qty: Qty;
  budget: Money | null;
  status: RequestStatus;
  staff_reply: string | null;
  product_id: UUID | null; // إن صار متوفراً في المتجر
  created_at: ISODate;
  updated_at: ISODate;
}

export interface Review {
  id: UUID;
  product_id: UUID;
  profile_id: UUID;
  order_id: UUID | null;
  rating: 1 | 2 | 3 | 4 | 5;
  comment: string | null;
  is_visible: boolean;
  created_at: ISODate;
}

export interface Notification {
  id: UUID;
  profile_id: UUID;
  kind: NotificationKind;
  title: string;
  body: string | null;
  data: Record<string, unknown>; // {order_id} …
  read_at: ISODate | null;
  created_at: ISODate;
}

export interface NotificationCampaign {
  id: UUID;
  title: string;
  body: string | null;
  image_key: string | null;
  link_kind: BannerLinkKind;
  link_value: string | null;
  sent_at: ISODate | null;
  created_by: UUID | null;
  created_at: ISODate;
}

export interface PushToken {
  id: UUID;
  profile_id: UUID;
  token: string;
  platform: 'android' | 'ios' | 'web';
  updated_at: ISODate;
}

export interface AppSetting<T = unknown> {
  key: string;
  value: T;
  is_public: boolean; // يقرؤه الزبون
  updated_at: ISODate;
  updated_by: UUID | null;
}

export interface AuditEntry {
  id: number;
  actor_id: UUID | null;
  action: 'insert' | 'update' | 'delete' | string;
  entity: string; // اسم الجدول أو العملية
  entity_id: string | null;
  data: Record<string, unknown>;
  created_at: ISODate;
}

// ============================================================ قيم الإعدادات (app_settings.value)

/** app_settings.currency */
export interface CurrencySettings {
  base: 'IQD';
  usd_enabled: boolean; // إظهار الدولار في الفواتير والدفعات والأرصدة
  usd_rate: number; // سعر صرف اليوم (دينار لكل دولار) — يتغير يومياً من اللوحة
  usd_rate_updated_at: ISODate | null;
}

export interface StoreSettings {
  name: string;
  legal_name: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  address: string | null;
  map_url: string | null;
  hours: string | null; // «السبت–الخميس ٩ص–٩م»
  socials: { instagram?: string; facebook?: string; tiktok?: string; telegram?: string };
  currency: 'IQD' | 'USD';
  digits: 'arab' | 'latn'; // شكل الأرقام في الواجهات
}

export interface CheckoutSettings {
  cod_enabled: boolean;
  office_enabled: boolean;
  online_enabled: boolean;
  pickup_enabled: boolean;
  min_order_total: Money;
  free_delivery_over: Money | null;
  office_instructions: string | null; // تظهر عند اختيار الدفع في المكتب
}

export interface InventorySettings {
  allow_negative_stock: boolean;
  default_warehouse_id: UUID | null;
  low_stock_default: Qty;
}

export interface InvoiceSettings {
  receipt_width: 58 | 80; // ملم — طابعة حرارية
  show_logo: boolean;
  header_note: string | null;
  footer_note: string | null; // «شكراً لتسوقكم…»
  return_policy: string | null;
  show_qr: boolean; // رمز QR برقم الفاتورة
  label_size: { width_mm: number; height_mm: number }; // ملصق الباركود
}

export interface AppConfigSettings {
  min_version: number; // أقل نسخة مسموحة من التطبيق
  latest_version: number;
  maintenance: boolean;
  maintenance_message: string | null;
  play_store_url: string | null;
  apk_url: string | null;
}

// ============================================================ نتائج دوال RPC

export interface CartQuoteLine {
  variant_id: UUID;
  qty: Qty;
  unit_price: Money;
  line_total: Money;
  available_qty: Qty;
  ok: boolean; // false = غير متوفر بالكمية المطلوبة أو غير منشور
}

export interface CartQuote {
  lines: CartQuoteLine[];
  subtotal: Money;
  discount: Money;
  delivery_fee: Money;
  total: Money;
  coupon_code: string | null;
  coupon_error: string | null; // سبب رفض الكوبون (نص عربي)
  min_order_total: Money;
  ok: boolean;
}

export interface DashboardSummary {
  sales_total: Money;
  sales_count: number;
  returns_total: Money;
  profit: Money | null; // null إن لم يملك costs.view
  orders_new: number; // pending
  orders_open: number; // confirmed..out_for_delivery
  requests_new: number;
  low_stock_count: number;
  out_of_stock_count: number;
  receivables: Money; // ديون الزبائن
  payables: Money; // ديون الموردين
  purchases_total: Money;
  cash_balance: Money; // مجموع أرصدة الصناديق والحسابات بالدينار المكافئ
  cash_in: Money;
  cash_out: Money;
  expenses_total: Money;
}

export interface SalesPoint {
  bucket: ISODate; // بداية اليوم/الأسبوع/الشهر
  sales: Money;
  returns: Money;
  profit: Money | null;
  invoices: number;
}

export interface TopProductRow {
  product_id: UUID;
  variant_id: UUID;
  name: string;
  variant_title: string | null;
  qty: Qty;
  revenue: Money;
  profit: Money | null;
}

export interface InventoryValuationRow {
  warehouse_id: UUID;
  items: number;
  units: Qty;
  cost_value: Money;
  retail_value: Money;
}

export interface LowStockRow {
  variant_id: UUID;
  product_id: UUID;
  name: string;
  variant_title: string | null;
  sku: string;
  qty: Qty;
  min_stock: Qty;
}
