/**
 * دورة حياة طلب التطبيق — آلة حالات واحدة تستخدمها لوحة التحكم (الأزرار) والتطبيق (الخط الزمني)،
 * وتطابقها دالة public.set_order_status في قاعدة البيانات حرفياً.
 *
 *  pending ─► confirmed ─► preparing ─► ready ─┬─► out_for_delivery ─► delivered ─► returned
 *     │           │            │          │    └─► delivered (استلام من المكتب)
 *     └───────────┴────────────┴──────────┴──────────► cancelled   (out_for_delivery ─► cancelled = فشل التوصيل)
 *
 * المخزون: يُحجز عند الإنشاء (pending)، ويُحرَّر عند الإلغاء، ويُخصم فعلياً وتُنشأ فاتورة عند delivered،
 * ويعود للمخزن بفاتورة إرجاع عند returned.
 */
import type { Fulfillment, OrderStatus } from './types';

const BASE: Record<OrderStatus, OrderStatus[]> = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['preparing', 'cancelled'],
  preparing: ['ready', 'cancelled'],
  ready: ['out_for_delivery', 'delivered', 'cancelled'],
  out_for_delivery: ['delivered', 'cancelled'],
  delivered: ['returned'],
  cancelled: [],
  returned: [],
};

export function nextStatuses(from: OrderStatus, fulfillment: Fulfillment): OrderStatus[] {
  return BASE[from].filter((to) => {
    if (from === 'ready' && fulfillment === 'delivery' && to === 'delivered') return false; // يمر بالمندوب أولاً
    if (from === 'ready' && fulfillment === 'pickup' && to === 'out_for_delivery') return false;
    return true;
  });
}

export function canTransition(from: OrderStatus, to: OrderStatus, fulfillment: Fulfillment): boolean {
  return nextStatuses(from, fulfillment).includes(to);
}

/** الزبون يلغي طلبه بنفسه قبل التجهيز فقط */
export const customerCanCancel = (s: OrderStatus) => s === 'pending' || s === 'confirmed';

export const isFinal = (s: OrderStatus) => s === 'cancelled' || s === 'returned' || s === 'delivered';
export const isOpen = (s: OrderStatus) => !['delivered', 'cancelled', 'returned'].includes(s);

/** الزر الرئيسي في لوحة التحكم لكل حالة (الخطوة الطبيعية التالية) */
export function primaryNext(from: OrderStatus, fulfillment: Fulfillment): OrderStatus | null {
  return nextStatuses(from, fulfillment).find((s) => s !== 'cancelled' && s !== 'returned') ?? null;
}

export interface TimelineStep {
  key: 'placed' | 'confirmed' | 'preparing' | 'shipping' | 'delivered';
  label: string;
  state: 'done' | 'current' | 'todo';
}

/** الخط الزمني الذي يراه الزبون (خمس خطوات) */
export function customerTimeline(status: OrderStatus, fulfillment: Fulfillment): TimelineStep[] {
  const steps: Omit<TimelineStep, 'state'>[] = [
    { key: 'placed', label: 'استلمنا طلبك' },
    { key: 'confirmed', label: 'تم التأكيد' },
    { key: 'preparing', label: 'قيد التجهيز' },
    { key: 'shipping', label: fulfillment === 'pickup' ? 'جاهز للاستلام' : 'في الطريق إليك' },
    { key: 'delivered', label: fulfillment === 'pickup' ? 'تم الاستلام' : 'تم التسليم' },
  ];
  const reached: Record<OrderStatus, number> = {
    pending: 0,
    confirmed: 1,
    preparing: 2,
    ready: fulfillment === 'pickup' ? 3 : 2,
    out_for_delivery: 3,
    delivered: 4,
    returned: 4,
    cancelled: -1,
  };
  const r = reached[status];
  return steps.map((s, i) => ({ ...s, state: r < 0 ? 'todo' : i < r ? 'done' : i === r ? (status === 'delivered' || status === 'returned' ? 'done' : 'current') : 'todo' }));
}
