/** النصوص العربية لكل قيمة ثابتة + لون الحالة (tone من theme.ts) */
import type { Tone } from './theme';
import type {
  Fulfillment,
  InvoiceChannel,
  InvoiceKind,
  MovementKind,
  OrderPaymentMethod,
  OrderPaymentStatus,
  OrderStatus,
  PaymentMethod,
  RequestStatus,
  SerialStatus,
  CouponKind,
  BannerLinkKind,
  HomeSectionKind,
  QuotationStatus,
  StockVoucherKind,
  MoneyAccountKind,
  PriceTier,
} from './types';

type L = { label: string; tone: Tone };

export const ORDER_STATUS: Record<OrderStatus, L & { staffAction?: string }> = {
  pending: { label: 'جديد — بانتظار التأكيد', tone: 'accent', staffAction: 'إعادة للانتظار' },
  confirmed: { label: 'مؤكد', tone: 'info', staffAction: 'تأكيد الطلب' },
  preparing: { label: 'قيد التجهيز', tone: 'info', staffAction: 'بدء التجهيز' },
  ready: { label: 'جاهز', tone: 'warning', staffAction: 'جاهز' },
  out_for_delivery: { label: 'مع المندوب', tone: 'warning', staffAction: 'تسليم للمندوب' },
  delivered: { label: 'تم التسليم', tone: 'success', staffAction: 'تم التسليم' },
  cancelled: { label: 'ملغي', tone: 'danger', staffAction: 'إلغاء الطلب' },
  returned: { label: 'مُرجَع', tone: 'neutral', staffAction: 'تسجيل إرجاع' },
};

export const ORDER_PAYMENT_METHOD: Record<OrderPaymentMethod, { label: string; hint: string }> = {
  cod: { label: 'الدفع عند الاستلام', hint: 'تدفع نقداً للمندوب عند وصول طلبك' },
  office: { label: 'الدفع في المكتب', hint: 'تدفع حضورياً في مكتبنا، ونتواصل معك عبر واتساب أو الهاتف' },
  online: { label: 'دفع إلكتروني', hint: 'فيزا، ماستركارد، زين كاش، المصرف الأول وغيرها' },
};

export const ORDER_PAYMENT_STATUS: Record<OrderPaymentStatus, L> = {
  unpaid: { label: 'غير مدفوع', tone: 'neutral' },
  pending: { label: 'بانتظار الدفع', tone: 'warning' },
  paid: { label: 'مدفوع', tone: 'success' },
  refunded: { label: 'مسترد', tone: 'info' },
  failed: { label: 'فشل الدفع', tone: 'danger' },
};

export const FULFILLMENT: Record<Fulfillment, { label: string }> = {
  delivery: { label: 'توصيل' },
  pickup: { label: 'استلام من المكتب' },
};

export const PAYMENT_METHOD: Record<PaymentMethod, { label: string }> = {
  cash: { label: 'نقداً' },
  card: { label: 'بطاقة' },
  zaincash: { label: 'زين كاش' },
  fib: { label: 'المصرف العراقي الأول' },
  qicard: { label: 'كي كارد' },
  asiapay: { label: 'آسيا باي' },
  wayl: { label: 'دفع إلكتروني' },
  bank_transfer: { label: 'حوالة مصرفية' },
  other: { label: 'أخرى' },
};

export const INVOICE_KIND: Record<InvoiceKind, L & { short: string }> = {
  sale: { label: 'فاتورة بيع', short: 'بيع', tone: 'success' },
  sale_return: { label: 'إرجاع مبيعات', short: 'إرجاع', tone: 'danger' },
  purchase: { label: 'فاتورة شراء', short: 'شراء', tone: 'info' },
  purchase_return: { label: 'إرجاع مشتريات', short: 'إرجاع شراء', tone: 'warning' },
};

export const INVOICE_CHANNEL: Record<InvoiceChannel, { label: string }> = {
  pos: { label: 'نقطة البيع' },
  online: { label: 'التطبيق' },
  manual: { label: 'يدوي' },
};

export const MOVEMENT_KIND: Record<MovementKind, L> = {
  opening: { label: 'رصيد افتتاحي', tone: 'neutral' },
  purchase: { label: 'شراء', tone: 'success' },
  purchase_return: { label: 'إرجاع لمورد', tone: 'warning' },
  sale: { label: 'بيع', tone: 'info' },
  sale_return: { label: 'إرجاع من زبون', tone: 'success' },
  adjustment: { label: 'تعديل', tone: 'neutral' },
  damage: { label: 'تالف', tone: 'danger' },
  transfer_in: { label: 'نقل وارد', tone: 'success' },
  transfer_out: { label: 'نقل صادر', tone: 'warning' },
  stocktake: { label: 'فرق جرد', tone: 'neutral' },
  manual_in: { label: 'إدخال مخزني', tone: 'success' },
  manual_out: { label: 'إخراج مخزني', tone: 'warning' },
  sample_out: { label: 'خروج عينة', tone: 'info' },
  sample_return: { label: 'رجوع عينة', tone: 'success' },
};

export const QUOTATION_STATUS: Record<QuotationStatus, L> = {
  draft: { label: 'مسودة', tone: 'neutral' },
  sent: { label: 'أُرسل للزبون', tone: 'info' },
  accepted: { label: 'وافق الزبون', tone: 'success' },
  converted: { label: 'حُوّل لفاتورة', tone: 'success' },
  expired: { label: 'منتهي', tone: 'warning' },
  cancelled: { label: 'ملغي', tone: 'danger' },
};

export const STOCK_VOUCHER_KIND: Record<StockVoucherKind, L> = {
  in: { label: 'سند إدخال', tone: 'success' },
  out: { label: 'سند إخراج', tone: 'warning' },
  sample_out: { label: 'خروج عينة', tone: 'info' },
  sample_return: { label: 'رجوع عينة', tone: 'success' },
  damage: { label: 'تالف', tone: 'danger' },
};

export const MONEY_ACCOUNT_KIND: Record<MoneyAccountKind, { label: string }> = {
  cash: { label: 'صندوق نقدي' },
  bank: { label: 'حساب مصرفي' },
  wallet: { label: 'محفظة إلكترونية' },
};

export const PRICE_TIER: Record<PriceTier, { label: string }> = {
  retail: { label: 'مفرد' },
  wholesale: { label: 'جملة' },
};

export const REQUEST_STATUS: Record<RequestStatus, L> = {
  new: { label: 'جديد', tone: 'accent' },
  reviewing: { label: 'قيد المراجعة', tone: 'info' },
  sourcing: { label: 'جاري توفيره', tone: 'warning' },
  available: { label: 'صار متوفراً', tone: 'success' },
  fulfilled: { label: 'تم', tone: 'success' },
  rejected: { label: 'غير ممكن', tone: 'danger' },
  cancelled: { label: 'ألغاه الزبون', tone: 'neutral' },
};

export const SERIAL_STATUS: Record<SerialStatus, L> = {
  in_stock: { label: 'في المخزن', tone: 'success' },
  sold: { label: 'مباع', tone: 'info' },
  returned: { label: 'مُرجَع', tone: 'warning' },
  defective: { label: 'معيب', tone: 'danger' },
};

export const COUPON_KIND: Record<CouponKind, { label: string }> = {
  percent: { label: 'نسبة مئوية' },
  fixed: { label: 'مبلغ ثابت' },
  free_delivery: { label: 'توصيل مجاني' },
};

export const BANNER_LINK_KIND: Record<BannerLinkKind, { label: string }> = {
  none: { label: 'بلا رابط' },
  product: { label: 'منتج' },
  category: { label: 'قسم' },
  brand: { label: 'علامة تجارية' },
  search: { label: 'بحث' },
  url: { label: 'رابط خارجي' },
};

export const HOME_SECTION_KIND: Record<HomeSectionKind, { label: string }> = {
  featured: { label: 'منتجات مميزة' },
  new: { label: 'وصل حديثاً' },
  best_sellers: { label: 'الأكثر مبيعاً' },
  on_sale: { label: 'عروض وخصومات' },
  category: { label: 'من قسم' },
  brand: { label: 'من علامة تجارية' },
  manual: { label: 'اختيار يدوي' },
};

/** حالة المخزون للعرض: نفد / قليل / متوفر */
export function stockState(available: number, minStock = 0): L & { key: 'out' | 'low' | 'ok' } {
  if (available <= 0) return { key: 'out', label: 'نفدت الكمية', tone: 'danger' };
  if (available <= Math.max(minStock, 0)) return { key: 'low', label: 'كمية قليلة', tone: 'warning' };
  return { key: 'ok', label: 'متوفر', tone: 'success' };
}
