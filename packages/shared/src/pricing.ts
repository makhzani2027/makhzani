/**
 * حساب السلة والفاتورة — نفس القواعد في الخادم (quote_cart، place_order، pos_checkout).
 * الخادم هو المرجع دائماً: هذا للعرض الفوري في الواجهة فقط، والطلب يُسعَّر من جديد في قاعدة البيانات.
 *
 * الترتيب: مجموع البنود (بعد خصم كل بند) ← خصم الكوبون أو خصم الفاتورة ← أجرة التوصيل ← الإجمالي.
 */
import type { CouponKind, Money } from './types';
import { roundMoney, type Currency } from './format';

export interface PriceLine {
  unit_price: Money;
  qty: number;
  discount?: Money; // خصم على البند كله (مبلغ)
}

export interface CouponRule {
  code: string;
  kind: CouponKind;
  value: number;
  min_subtotal: Money;
  max_discount: Money | null;
}

export interface TotalsInput {
  lines: PriceLine[];
  coupon?: CouponRule | null;
  invoiceDiscount?: Money; // خصم يدوي على الفاتورة (نقطة البيع)
  deliveryFee?: Money;
  freeDeliveryOver?: Money | null;
  currency?: Currency;
}

export interface Totals {
  subtotal: Money; // بعد خصومات البنود
  lineDiscounts: Money;
  couponDiscount: Money;
  invoiceDiscount: Money;
  discount: Money; // couponDiscount + invoiceDiscount
  deliveryFee: Money;
  total: Money;
  couponError: string | null;
  itemsCount: number; // مجموع الكميات
}

export function lineTotal(l: PriceLine, currency: Currency = 'IQD'): Money {
  const gross = l.unit_price * l.qty;
  const disc = Math.min(Math.max(l.discount ?? 0, 0), gross);
  return roundMoney(gross - disc, currency);
}

/** يتحقق من الكوبون ويحسب خصمه على المجموع (بلا أجرة التوصيل) */
export function couponDiscount(coupon: CouponRule, subtotal: Money, currency: Currency = 'IQD'): { amount: Money; freeDelivery: boolean; error: string | null } {
  if (subtotal < coupon.min_subtotal) {
    return { amount: 0, freeDelivery: false, error: 'لم يصل مجموع السلة للحد الأدنى لهذا الكوبون' };
  }
  if (coupon.kind === 'free_delivery') return { amount: 0, freeDelivery: true, error: null };
  let amount = coupon.kind === 'percent' ? (subtotal * Math.min(Math.max(coupon.value, 0), 100)) / 100 : Math.max(coupon.value, 0);
  if (coupon.max_discount !== null && coupon.max_discount !== undefined) amount = Math.min(amount, coupon.max_discount);
  amount = Math.min(amount, subtotal);
  return { amount: roundMoney(amount, currency), freeDelivery: false, error: null };
}

export function computeTotals(input: TotalsInput): Totals {
  const currency = input.currency ?? 'IQD';
  let gross = 0;
  let subtotal = 0;
  let itemsCount = 0;
  for (const l of input.lines) {
    gross += l.unit_price * l.qty;
    subtotal += lineTotal(l, currency);
    itemsCount += l.qty;
  }
  subtotal = roundMoney(subtotal, currency);
  const lineDiscounts = roundMoney(gross - subtotal, currency);

  let cDisc = 0;
  let freeDelivery = false;
  let couponError: string | null = null;
  if (input.coupon) {
    const r = couponDiscount(input.coupon, subtotal, currency);
    cDisc = r.amount;
    freeDelivery = r.freeDelivery;
    couponError = r.error;
  }
  const invDisc = roundMoney(Math.min(Math.max(input.invoiceDiscount ?? 0, 0), subtotal - cDisc), currency);
  const discount = roundMoney(cDisc + invDisc, currency);

  let deliveryFee = Math.max(input.deliveryFee ?? 0, 0);
  if (freeDelivery) deliveryFee = 0;
  if (input.freeDeliveryOver !== null && input.freeDeliveryOver !== undefined && subtotal - discount >= input.freeDeliveryOver) deliveryFee = 0;
  deliveryFee = roundMoney(deliveryFee, currency);

  return {
    subtotal,
    lineDiscounts,
    couponDiscount: cDisc,
    invoiceDiscount: invDisc,
    discount,
    deliveryFee,
    total: roundMoney(subtotal - discount + deliveryFee, currency),
    couponError,
    itemsCount,
  };
}

/** نسبة الخصم المعروضة على المنتج: compare_at 30000 والسعر 24000 ← 0.2 */
export function discountRatio(price: Money, compareAt: Money | null | undefined): number {
  if (!compareAt || compareAt <= price || compareAt <= 0) return 0;
  return (compareAt - price) / compareAt;
}

/** هامش الربح: (السعر - التكلفة) / السعر */
export function marginRatio(price: Money, cost: Money): number {
  if (price <= 0) return 0;
  return (price - cost) / price;
}

export interface TenderLine {
  method: string;
  amount: Money;
}

/** نقطة البيع: المدفوع، المتبقي (دين)، والباقي للزبون (فكة) من الدفع النقدي فقط */
export function tender(total: Money, payments: TenderLine[], currency: Currency = 'IQD') {
  const paid = roundMoney(payments.reduce((s, p) => s + Math.max(p.amount, 0), 0), currency);
  const nonCash = payments.filter((p) => p.method !== 'cash').reduce((s, p) => s + Math.max(p.amount, 0), 0);
  const cash = paid - nonCash;
  const remaining = roundMoney(Math.max(total - paid, 0), currency);
  // الفكة تُرد من النقد فقط، ولا تتجاوز النقد المدفوع
  const change = roundMoney(Math.min(Math.max(paid - total, 0), cash), currency);
  return { paid, remaining, change, applied: roundMoney(Math.min(paid - change, total), currency) };
}

/** متوسط التكلفة المرجّح بعد شراء جديد */
export function weightedAvgCost(oldQty: number, oldCost: Money, inQty: number, inCost: Money): Money {
  const q0 = Math.max(oldQty, 0);
  if (q0 + inQty <= 0) return inCost;
  return Math.round(((q0 * oldCost + inQty * inCost) / (q0 + inQty)) * 100) / 100;
}
