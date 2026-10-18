import {
  countOf, formatDate, formatPhone, formatMoney, formatNumber, formatRelative, formatTime, governorateName, nouns, withDigits,
  type Currency, type Digits,
} from '@raqeem/shared';
import { useMemo } from 'react';
import { useSettings } from './query';

export interface Fmt {
  digits: Digits;
  currency: Currency;
  money: (n: number | null | undefined) => string;
  /** المبلغ بلا رمز العملة */
  bare: (n: number | null | undefined) => string;
  currencyLabel: string;
  num: (n: number) => string;
  count: (n: number, forms: Parameters<typeof countOf>[1]) => string;
  items: (n: number) => string;
  products: (n: number) => string;
  date: (d: string | number | Date, time?: boolean) => string;
  time: (d: string | number | Date) => string;
  ago: (d: string | number | Date) => string;
  text: (s: string) => string;
  gov: (key: string | null | undefined) => string;
  /** رقم مستند لاتيني (O-000123) معزول باتجاه LTR داخل النص العربي */
  doc: (s: string | null | undefined) => string;
  /** هاتف عراقي مقروء (0770 123 4567) بأرقام المتجر، معزول LTR */
  phone: (e164: string | null | undefined) => string;
}

/** أقرب نقطة دالة كما تُقرأ: «قرب …» إلا إن كتبها الزبون بحرف مكان (قرب، مقابل، خلف…) كما يقترح الحقل */
export function landmarkText(l: string | null | undefined): string {
  const v = (l ?? '').trim();
  if (!v) return '';
  return /^(قرب|مقابل|خلف|جنب|بجانب|بجنب|عند|امام|أمام|قبل|بعد|بين|داخل|ضمن|نهاية|بداية|مدخل|فرع|زقاق|شارع)(\s|$)/.test(v) ? v : `قرب ${v}`;
}

/** تنسيق الأرقام بحسب إعدادات المتجر العامة (store.digits و store.currency) */
export function useFmt(): Fmt {
  const { data } = useSettings();
  const digits: Digits = data?.store.digits ?? 'arab';
  const currency: Currency = data?.store.currency ?? 'IQD';
  return useMemo<Fmt>(() => ({
    digits,
    currency,
    money: (n) => formatMoney(n, { digits, currency }),
    bare: (n) => formatMoney(n, { digits, currency, bare: true }),
    currencyLabel: currency === 'USD' ? '$' : 'د.ع',
    num: (n) => formatNumber(n, { digits }),
    count: (n, forms) => countOf(n, forms, digits),
    items: (n) => countOf(n, nouns.item, digits),
    products: (n) => countOf(n, nouns.product, digits),
    date: (d, time) => formatDate(d, { digits, time }),
    time: (d) => formatTime(d, { digits }),
    ago: (d) => formatRelative(d, Date.now(), digits),
    text: (s) => withDigits(s, digits),
    gov: (k) => governorateName(k),
    doc: (s) => (s ? `\u2066${s}\u2069` : ''),
    phone: (p) => (p ? `\u2066${withDigits(formatPhone(p), digits)}\u2069` : ''),
  }), [digits, currency]);
}
