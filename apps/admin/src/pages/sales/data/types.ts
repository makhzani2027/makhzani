/**
 * أنواع العرض المركّبة لصفحات البيع والمال (صفوف مع أسماء مرتبطة).
 * الأعمدة الأصلية من @raqeem/shared/types حرفياً؛ ما يُضاف هنا أسماء للعرض فقط.
 */
import type {
  Customer, Invoice, InvoiceItem, Order, OrderEvent, OrderItem, Payment, Supplier, PaymentMethod, PaymentDirection, CurrencyCode, PriceTier,
} from '@raqeem/shared';

export interface InvoiceRow extends Invoice {
  customer_name: string | null;
  supplier_name: string | null;
  created_by_name: string | null;
}

export interface InvoiceFull {
  invoice: Invoice;
  items: InvoiceItem[];
  payments: Payment[];
  customer: Customer | null;
  supplier: Supplier | null;
  cashier: string | null;
  /** فواتير الإرجاع المرتبطة بهذه الفاتورة */
  returns: Invoice[];
  /** الفاتورة الأصلية إن كانت هذه إرجاعاً */
  original: Pick<Invoice, 'id' | 'number'> | null;
  /** الكمية المُرجعة سابقاً لكل بند (invoice_item_id ← qty) لمنع الإرجاع المكرر */
  returned: Record<string, number>;
  /** الأرقام التسلسلية المُرجعة سابقاً لكل بند (invoice_item_id ← serials) */
  returnedSerials: Record<string, string[]>;
}

export interface OrderRow extends Order {
  customer_name: string;
  customer_phone: string | null;
  items_count: number;
}

export interface OrderFull {
  order: Order;
  items: OrderItem[];
  events: (OrderEvent & { actor_name: string | null })[];
  customer: Customer | null;
  invoice_number: string | null;
}

export interface PaymentRow extends Payment {
  party_name: string | null;
  invoice_number: string | null;
  created_by_name: string | null;
}

/** سطر كشف الحساب — ما تعيده customer_statement / supplier_statement حرفياً (rows[]) */
export interface StatementRow {
  at: string;
  doc_type: string; // sale | sale_return | purchase | purchase_return | payment_in | payment_out | opening | transfer_in …
  doc_id: string | null;
  number: string | null;
  description: string;
  currency: CurrencyCode;
  debit: number; // يزيد الدين على الطرف
  credit: number; // ينقصه
  balance: number; // الرصيد التراكمي بعملة السطر
}

export interface Statement {
  opening: Record<CurrencyCode, number>;
  rows: StatementRow[];
  closing: Record<CurrencyCode, number>;
}

/** صنف في نقطة البيع (نسخة منتج قابلة للبيع) */
export interface PosItem {
  variant_id: string;
  product_id: string;
  name: string;
  variant_title: string | null;
  sku: string;
  barcode: string | null;
  price: number;
  wholesale_price: number | null;
  min_stock: number;
  image_key: string | null;
  category_id: string | null;
  track_serials: boolean;
  unit: string;
  /** المتاح في المخزن المختار (qty − reserved) */
  stock: number;
  /** نص البحث المجمّع (الاسم + النسخة + الوسوم) */
  search: string;
}

export interface PayLine {
  method: PaymentMethod;
  amount: number; // بعملة الدفعة
  currency?: CurrencyCode; // افتراضياً عملة الفاتورة
  account_id?: string | null; // الصندوق/الحساب (افتراضياً حسب الطريقة)
  reference?: string;
}

export interface CheckoutItem {
  variant_id: string;
  qty: number; // بالقطع (مسح باركود الكرتونة يضيف factor قطعة)
  unit_price?: number; // بعملة الفاتورة — فقط عند تغيير السعر يدوياً
  discount?: number;
  serials?: string[];
  price_tier?: PriceTier; // 'retail' | 'wholesale' (الجملة من wholesale_price)
  unit_id?: string | null; // وحدة التعبئة (كرتونة) — عندها qty بعدد الوحدات
}

export interface CheckoutPayload {
  warehouse_id: string;
  customer_id: string | null;
  currency?: CurrencyCode; // عملة الفاتورة (افتراضياً IQD)
  exchange_rate?: number; // دينار لكل دولار (عند USD أو دفعات بالدولار)
  items: CheckoutItem[];
  discount?: number;
  payments: PayLine[];
  note?: string;
}

export interface CheckoutResult {
  invoice_id: string;
  number: string;
  change: number; // بعملة الفاتورة
}

export interface RecordPaymentPayload {
  direction: PaymentDirection;
  method: PaymentMethod;
  amount: number;
  currency?: CurrencyCode;
  exchange_rate?: number;
  account_id?: string | null;
  customer_id?: string | null;
  supplier_id?: string | null;
  invoice_id?: string | null;
  reference?: string | null;
  note?: string | null;
}

export interface DateRange {
  from: string; // ISO (بداية يوم بغداد)
  to: string; // ISO (حصري)
}
