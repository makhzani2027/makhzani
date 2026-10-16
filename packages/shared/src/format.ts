/**
 * تنسيق الأرقام والمال والتواريخ والهواتف — بلا Intl (يعمل نفسه في Hermes والمتصفح والطباعة).
 * الأرقام: 'arab' = ٠١٢٣ (مشرقية) | 'latn' = 0123. الرموز (SKU، باركود، رقم فاتورة، هاتف) لاتينية دائماً.
 */

export type Digits = 'arab' | 'latn';
export type Currency = 'IQD' | 'USD';

const AR = '٠١٢٣٤٥٦٧٨٩';
const FA = '۰۱۲۳۴۵۶۷۸۹';

/** يحوّل الأرقام اللاتينية إلى مشرقية */
export function toArabicDigits(input: string | number): string {
  return String(input).replace(/[0-9]/g, (d) => AR[Number(d)]);
}

/** يحوّل الأرقام المشرقية والفارسية إلى لاتينية (لكل إدخال من المستخدم قبل الحفظ) */
export function toLatinDigits(input: string): string {
  return input.replace(/[٠-٩]/g, (d) => String(AR.indexOf(d))).replace(/[۰-۹]/g, (d) => String(FA.indexOf(d)));
}

export function withDigits(s: string, digits: Digits): string {
  return digits === 'arab' ? toArabicDigits(s) : s;
}

/**
 * يقرأ رقماً كتبه المستخدم بأي شكل: «١٢٬٥٠٠»، «12,500»، «١٢٫٥»، «12.5». يعيد null إن لم يكن رقماً.
 */
export function parseNumber(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  if (typeof input === 'number') return Number.isFinite(input) ? input : null;
  let s = toLatinDigits(input).trim();
  if (!s) return null;
  s = s.replace(/[٬,\s_]/g, '').replace(/٫/g, '.');
  if (!/^-?\d*\.?\d+$|^-?\d+\.$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** تقريب المال: الدينار بلا كسور، الدولار لسنتين */
export function roundMoney(n: number, currency: Currency = 'IQD'): number {
  if (currency === 'IQD') return Math.round(n);
  return Math.round(n * 100) / 100;
}

export interface NumberFormatOptions {
  digits?: Digits;
  decimals?: number; // عدد ثابت من المنازل
  maxDecimals?: number; // حد أقصى بلا أصفار زائدة
}

/** 1234567.5 ← «١٬٢٣٤٬٥٦٧٫٥» أو «1,234,567.5» */
export function formatNumber(n: number, opts: NumberFormatOptions = {}): string {
  const digits = opts.digits ?? 'arab';
  if (!Number.isFinite(n)) return digits === 'arab' ? '—' : '—';
  const neg = n < 0;
  let abs = Math.abs(n);
  let fixed: string;
  if (opts.decimals !== undefined) fixed = abs.toFixed(opts.decimals);
  else {
    const max = opts.maxDecimals ?? 2;
    abs = Math.round(abs * 10 ** max) / 10 ** max;
    fixed = String(abs);
    if (fixed.includes('e')) fixed = abs.toFixed(max);
  }
  const [int, frac] = fixed.split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  let out = frac ? `${grouped}.${frac}` : grouped;
  if (digits === 'arab') out = toArabicDigits(out).replace(/,/g, '٬').replace(/\./g, '٫');
  // علامة السالب قبل الرقم مع عزل الاتجاه حتى لا تنقلب في النص العربي
  return neg ? `⁦-${out}⁩` : out;
}

export const CURRENCY_LABEL: Record<Currency, { ar: string; symbol: string }> = {
  IQD: { ar: 'د.ع', symbol: 'IQD' },
  USD: { ar: '$', symbol: 'USD' },
};

/** 25000 ← «٢٥٬٠٠٠ د.ع» */
export function formatMoney(amount: number | null | undefined, opts: { currency?: Currency; digits?: Digits; bare?: boolean } = {}): string {
  const currency = opts.currency ?? 'IQD';
  const digits = opts.digits ?? 'arab';
  if (amount === null || amount === undefined || !Number.isFinite(amount)) return '—';
  const n = formatNumber(roundMoney(amount, currency), { digits, decimals: currency === 'USD' ? 2 : 0 });
  if (opts.bare) return n;
  return `${n} ${CURRENCY_LABEL[currency].ar}`;
}

/** الكمية: القطع بلا كسور، والوزن حتى ٣ منازل */
export function formatQty(q: number, digits: Digits = 'arab'): string {
  return formatNumber(q, { digits, maxDecimals: 3 });
}

export function formatPercent(ratio: number, digits: Digits = 'arab', maxDecimals = 1): string {
  return `${formatNumber(ratio * 100, { digits, maxDecimals })}٪`;
}

// ------------------------------------------------------------------ الجمع العربي

/**
 * «٣ منتجات»، «منتجان»، «١١ منتجاً». القواعد:
 * ١ ← one (مثل «منتج واحد») | ٢ ← two | ٣–١٠ ← few + الرقم | ١١–٩٩ ← many + الرقم (مفرد منصوب) | ١٠٠+ ← حسب آخر رقمين
 */
export function countOf(
  n: number,
  forms: { one: string; two: string; few: string; many: string; zero?: string },
  digits: Digits = 'arab',
): string {
  const num = formatNumber(n, { digits });
  if (n === 0) return forms.zero ?? `${num} ${forms.many}`;
  if (n === 1) return forms.one;
  if (n === 2) return forms.two;
  const r = n % 100;
  if (r >= 3 && r <= 10) return `${num} ${forms.few}`;
  if (r === 1 || r === 2 || r === 0) return `${num} ${forms.one.split(' ')[0]}`;
  return `${num} ${forms.many}`;
}

export const nouns = {
  product: { one: 'منتج واحد', two: 'منتجان', few: 'منتجات', many: 'منتجاً', zero: 'لا منتجات' },
  item: { one: 'قطعة واحدة', two: 'قطعتان', few: 'قطع', many: 'قطعة', zero: 'لا قطع' },
  order: { one: 'طلب واحد', two: 'طلبان', few: 'طلبات', many: 'طلباً', zero: 'لا طلبات' },
  customer: { one: 'زبون واحد', two: 'زبونان', few: 'زبائن', many: 'زبوناً', zero: 'لا زبائن' },
  invoice: { one: 'فاتورة واحدة', two: 'فاتورتان', few: 'فواتير', many: 'فاتورة', zero: 'لا فواتير' },
  day: { one: 'يوم واحد', two: 'يومان', few: 'أيام', many: 'يوماً', zero: 'اليوم' },
  minute: { one: 'دقيقة', two: 'دقيقتين', few: 'دقائق', many: 'دقيقة' },
  hour: { one: 'ساعة', two: 'ساعتين', few: 'ساعات', many: 'ساعة' },
} as const;

// ------------------------------------------------------------------ التواريخ (بتوقيت بغداد UTC+3 بلا توقيت صيفي)

export const BAGHDAD_OFFSET_MIN = 180;

export const IRAQI_MONTHS = [
  'كانون الثاني', 'شباط', 'آذار', 'نيسان', 'أيار', 'حزيران',
  'تموز', 'آب', 'أيلول', 'تشرين الأول', 'تشرين الثاني', 'كانون الأول',
] as const;

export const WEEKDAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'] as const;

/** أجزاء التاريخ بتوقيت بغداد مهما كانت منطقة الجهاز */
export function baghdadParts(d: Date | string | number) {
  const t = new Date(d).getTime() + BAGHDAD_OFFSET_MIN * 60_000;
  const b = new Date(t);
  return {
    year: b.getUTCFullYear(),
    month: b.getUTCMonth(), // 0..11
    day: b.getUTCDate(),
    weekday: b.getUTCDay(),
    hour: b.getUTCHours(),
    minute: b.getUTCMinutes(),
  };
}

/** بداية اليوم في بغداد كـ Date (للتقارير: «اليوم»، «أمس») */
export function startOfBaghdadDay(d: Date | string | number = Date.now(), addDays = 0): Date {
  const p = baghdadParts(d);
  return new Date(Date.UTC(p.year, p.month, p.day + addDays) - BAGHDAD_OFFSET_MIN * 60_000);
}

const pad2 = (n: number) => String(n).padStart(2, '0');

/** «١٦ تشرين الأول ٢٠٢٦» أو مع الوقت «… · ٩:٠٥ م» */
export function formatDate(d: Date | string | number, opts: { digits?: Digits; time?: boolean; short?: boolean } = {}): string {
  const digits = opts.digits ?? 'arab';
  const p = baghdadParts(d);
  let s = opts.short ? `${p.day}/${p.month + 1}/${p.year}` : `${p.day} ${IRAQI_MONTHS[p.month]} ${p.year}`;
  if (opts.time) s += ` · ${formatTime(d, { digits: 'latn' })}`;
  return withDigits(s, digits);
}

/** «٩:٠٥ م» */
export function formatTime(d: Date | string | number, opts: { digits?: Digits } = {}): string {
  const p = baghdadParts(d);
  const h12 = p.hour % 12 === 0 ? 12 : p.hour % 12;
  return withDigits(`${h12}:${pad2(p.minute)} ${p.hour < 12 ? 'ص' : 'م'}`, opts.digits ?? 'arab');
}

/** للتواريخ في حقول الإدخال: YYYY-MM-DD بتوقيت بغداد */
export function isoDay(d: Date | string | number = Date.now()): string {
  const p = baghdadParts(d);
  return `${p.year}-${pad2(p.month + 1)}-${pad2(p.day)}`;
}

/** «الآن»، «قبل ٥ دقائق»، «أمس ٩:٠٥ م»، أو التاريخ */
export function formatRelative(d: Date | string | number, now: Date | number = Date.now(), digits: Digits = 'arab'): string {
  const t = new Date(d).getTime();
  const diff = (new Date(now).getTime() - t) / 1000;
  if (diff < 45) return 'الآن';
  if (diff < 3600) {
    const m = Math.max(1, Math.round(diff / 60));
    return `قبل ${countOf(m, nouns.minute, digits)}`;
  }
  const today = startOfBaghdadDay(now).getTime();
  if (t >= today) {
    const h = Math.round(diff / 3600);
    return h < 6 ? `قبل ${countOf(h, nouns.hour, digits)}` : `اليوم ${formatTime(t, { digits })}`;
  }
  if (t >= startOfBaghdadDay(now, -1).getTime()) return `أمس ${formatTime(t, { digits })}`;
  if (t >= startOfBaghdadDay(now, -6).getTime()) return `${WEEKDAYS[baghdadParts(t).weekday]} ${formatTime(t, { digits })}`;
  return formatDate(t, { digits });
}

// ------------------------------------------------------------------ الهواتف العراقية

/**
 * يوحّد رقم الهاتف العراقي إلى +9647XXXXXXXXX. يقبل: 07701234567، 7701234567، 9647701234567،
 * +964 770 123 4567، 00964…، وبأرقام مشرقية. يعيد null إن لم يكن رقم موبايل عراقياً صالحاً.
 */
export function normalizeIraqiPhone(input: string | null | undefined): string | null {
  if (!input) return null;
  let s = toLatinDigits(input).replace(/[^\d+]/g, '');
  if (s.startsWith('+')) s = s.slice(1);
  if (s.startsWith('00')) s = s.slice(2);
  if (s.startsWith('964')) s = s.slice(3);
  if (s.startsWith('0')) s = s.slice(1);
  // موبايل عراقي: 7 ثم شركة (5 كورك، 7 آسياسيل، 8 زين، 9 زين، 3 آسياسيل/أخرى، 4 أخرى، 6 أخرى) ثم ٨ أرقام
  if (!/^7[3-9]\d{8}$/.test(s)) return null;
  return `+964${s}`;
}

export const isValidIraqiPhone = (input: string | null | undefined) => normalizeIraqiPhone(input) !== null;

/** +9647701234567 ← «0770 123 4567» (لاتيني دائماً، اتجاه LTR) */
export function formatPhone(e164: string | null | undefined): string {
  const n = normalizeIraqiPhone(e164 ?? '');
  if (!n) return e164 ?? '';
  const local = `0${n.slice(4)}`;
  return `${local.slice(0, 4)} ${local.slice(4, 7)} ${local.slice(7)}`;
}

/** رابط واتساب مع رسالة جاهزة */
export function whatsappLink(phone: string | null | undefined, text?: string): string | null {
  const n = normalizeIraqiPhone(phone ?? '');
  if (!n) return null;
  return `https://wa.me/${n.slice(1)}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
}

export function telLink(phone: string | null | undefined): string | null {
  const n = normalizeIraqiPhone(phone ?? '');
  return n ? `tel:${n}` : null;
}

// ------------------------------------------------------------------ أرقام المستندات

export const DOC_PREFIX = {
  sale: 'S',
  sale_return: 'SR',
  purchase: 'P',
  purchase_return: 'PR',
  order: 'O',
  receipt: 'RC', // سند قبض
  voucher: 'PV', // سند صرف
  request: 'RQ',
  transfer: 'TR',
  stocktake: 'ST',
} as const;
export type DocKind = keyof typeof DOC_PREFIX;

/** formatDocNumber('sale', 123) ← 'S-000123' (نفس صيغة دالة next_doc_number في قاعدة البيانات) */
export function formatDocNumber(kind: DocKind, n: number): string {
  return `${DOC_PREFIX[kind]}-${String(n).padStart(6, '0')}`;
}

/** اختصار للاسم: «محمد علي» ← «م ع» للصورة الرمزية */
export function initials(name: string | null | undefined): string {
  if (!name) return '؟';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).map((p) => p[0]).join(' ');
}
