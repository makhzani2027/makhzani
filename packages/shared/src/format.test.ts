import { describe, expect, it } from 'vitest';
import {
  countOf, formatDate, formatDocNumber, formatMoney, formatNumber, formatPhone, formatRelative, formatTime,
  normalizeIraqiPhone, nouns, parseNumber, startOfBaghdadDay, toArabicDigits, toLatinDigits, whatsappLink,
} from './format';

describe('الأرقام', () => {
  it('تحويل الأرقام في الاتجاهين', () => {
    expect(toArabicDigits('2026')).toBe('٢٠٢٦');
    expect(toLatinDigits('٢٠٢٦ و۱۲')).toBe('2026 و12');
  });
  it('تنسيق بفواصل الآلاف', () => {
    expect(formatNumber(1234567, { digits: 'latn' })).toBe('1,234,567');
    expect(formatNumber(1234567.5, { digits: 'arab' })).toBe('١٬٢٣٤٬٥٦٧٫٥');
    expect(formatNumber(0, { digits: 'arab' })).toBe('٠');
    expect(formatNumber(-2500, { digits: 'latn' })).toContain('-2,500');
  });
  it('سالب يُقرَّب إلى صفر بلا علامة سالب', () => {
    expect(formatNumber(0.3 - 0.1 - 0.2, { digits: 'latn' })).toBe('0');
    expect(formatNumber(-0.004, { digits: 'latn', decimals: 2 })).toBe('0.00');
    expect(formatNumber(-0.006, { digits: 'latn', decimals: 2 })).toContain('-0.01');
  });
  it('قراءة ما يكتبه المستخدم', () => {
    expect(parseNumber('١٢٬٥٠٠')).toBe(12500);
    expect(parseNumber('12,500')).toBe(12500);
    expect(parseNumber('١٢٫٥')).toBe(12.5);
    expect(parseNumber(' 7 ')).toBe(7);
    expect(parseNumber('abc')).toBeNull();
    expect(parseNumber('')).toBeNull();
  });
  it('المال بالدينار بلا كسور', () => {
    expect(formatMoney(25000)).toBe('٢٥٬٠٠٠ د.ع');
    expect(formatMoney(24999.6, { digits: 'latn' })).toBe('25,000 د.ع');
    expect(formatMoney(12.5, { currency: 'USD', digits: 'latn' })).toBe('12.50 $');
    expect(formatMoney(null)).toBe('—');
  });
});

describe('الجمع العربي', () => {
  it('المفرد والمثنى والجمع والتمييز', () => {
    expect(countOf(1, nouns.product)).toBe('منتج واحد');
    expect(countOf(2, nouns.product)).toBe('منتجان');
    expect(countOf(3, nouns.product)).toBe('٣ منتجات');
    expect(countOf(10, nouns.product)).toBe('١٠ منتجات');
    expect(countOf(11, nouns.product)).toBe('١١ منتجاً');
    expect(countOf(100, nouns.product)).toBe('١٠٠ منتج');
    expect(countOf(0, nouns.order)).toBe('لا طلبات');
  });
});

describe('التاريخ بتوقيت بغداد', () => {
  it('يحسب بتوقيت UTC+3 مهما كانت منطقة الجهاز', () => {
    // 21:30 UTC = 00:30 بغداد في اليوم التالي
    expect(formatDate('2026-10-16T21:30:00Z', { digits: 'latn' })).toBe('17 تشرين الأول 2026');
    expect(formatTime('2026-10-16T21:30:00Z', { digits: 'latn' })).toBe('12:30 ص');
    expect(formatTime('2026-10-16T10:05:00Z', { digits: 'latn' })).toBe('1:05 م');
  });
  it('بداية اليوم', () => {
    expect(startOfBaghdadDay('2026-10-16T21:30:00Z').toISOString()).toBe('2026-10-16T21:00:00.000Z');
  });
  it('الوقت النسبي', () => {
    const now = Date.parse('2026-10-16T12:00:00Z');
    expect(formatRelative(now - 10_000, now)).toBe('الآن');
    expect(formatRelative(now - 5 * 60_000, now)).toBe('قبل ٥ دقائق');
    expect(formatRelative(now - 2 * 3600_000, now)).toBe('قبل ساعتين');
    expect(formatRelative(Date.parse('2026-10-15T15:00:00Z'), now, 'latn')).toBe('أمس 6:00 م');
  });
});

describe('الهاتف العراقي', () => {
  it('يقبل كل الصيغ الشائعة', () => {
    for (const s of ['07701234567', '7701234567', '9647701234567', '+964 770 123 4567', '00964 770-123-4567', '٠٧٧٠١٢٣٤٥٦٧']) {
      expect(normalizeIraqiPhone(s)).toBe('+9647701234567');
    }
  });
  it('يرفض غير الصالح', () => {
    expect(normalizeIraqiPhone('0770123')).toBeNull();
    expect(normalizeIraqiPhone('07201234567')).toBeNull();
    expect(normalizeIraqiPhone('')).toBeNull();
  });
  it('العرض وروابط واتساب', () => {
    expect(formatPhone('+9647701234567')).toBe('0770 123 4567');
    expect(whatsappLink('07701234567', 'مرحبا')).toBe('https://wa.me/9647701234567?text=%D9%85%D8%B1%D8%AD%D8%A8%D8%A7');
    expect(whatsappLink('123')).toBeNull();
  });
});

it('أرقام المستندات', () => {
  expect(formatDocNumber('sale', 123)).toBe('S-000123');
  expect(formatDocNumber('order', 1)).toBe('O-000001');
});
