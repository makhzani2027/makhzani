import { describe, expect, it } from 'vitest';
import { cleanScan, gs1CheckDigit, internalEan13, isInternalBarcode, isValidGtin, suggestSku } from './barcode';
import { matchScore, normalizeArabic, slugify } from './search';
import { mediaUrl, pickSize } from './media';
import { ALL_PERMISSIONS, can, DEFAULT_ROLES } from './permissions';
import { icons } from './icons';
import { demoProducts, demoVariants, demoOrders } from './demo';
import { stockState } from './labels';

describe('الباركود', () => {
  it('رقم التحقق', () => {
    expect(gs1CheckDigit('400638133393')).toBe(1);
    expect(isValidGtin('4006381333931')).toBe(true);
    expect(isValidGtin('4006381333932')).toBe(false);
    expect(isValidGtin('٤٠٠٦٣٨١٣٣٣٩٣١')).toBe(true);
  });
  it('الباركود الداخلي', () => {
    const b = internalEan13(42);
    expect(b).toHaveLength(13);
    expect(isValidGtin(b)).toBe(true);
    expect(isInternalBarcode(b)).toBe(true);
    expect(() => internalEan13(-1)).toThrow();
  });
  it('تنظيف القراءة و SKU', () => {
    expect(cleanScan(' 400638133393١\r\n')).toBe('4006381333931');
    expect(suggestSku('acc', 42)).toBe('ACC-00042');
  });
});

describe('البحث العربي', () => {
  it('التطبيع', () => {
    expect(normalizeArabic('آيفونُ ١٢٨ جيجا')).toBe('ايفون 128 جيجا');
    expect(normalizeArabic('شاحنة سـريعة')).toBe('شاحنه سريعه');
  });
  it('التطابق', () => {
    expect(matchScore('شاحن', 'شاحن سريع ٦٥ واط')).toBeGreaterThan(0);
    expect(matchScore('شاحنه', 'شاحنة')).toBeGreaterThan(0);
    expect(matchScore('سماعة', 'شاحن')).toBe(0);
    expect(matchScore('RQ-00001', 'أي شيء', ['RQ-00001'])).toBe(1000);
    expect(matchScore('شاحن', 'شاحن')).toBeGreaterThan(matchScore('شاحن', 'كابل مع شاحن'));
  });
  it('slug', () => expect(slugify('سماعة JBL برو')).toBe('سماعه-jbl-برو'));
});

describe('الصور', () => {
  it('الروابط بالمقاسات', () => {
    expect(mediaUrl('products/a/b', 'md', 'https://x/media/')).toBe('https://x/media/products/a/b-md.webp');
    expect(mediaUrl('brand/logo.png', 'sm', 'https://x/media')).toBe('https://x/media/brand/logo.png');
    expect(mediaUrl('https://cdn/y.jpg', 'sm', 'https://x')).toBe('https://cdn/y.jpg');
    expect(mediaUrl(null, 'sm', 'https://x')).toBeNull();
    expect(pickSize(160, 2)).toBe('sm');
    expect(pickSize(400, 3)).toBe('lg');
  });
});

describe('الصلاحيات', () => {
  it('المالك يملك كل شيء', () => {
    expect(can({ is_owner: true, permissions: [] }, 'staff.manage')).toBe(true);
    expect(can({ is_owner: false, permissions: ['pos.sell'] }, 'pos.sell')).toBe(true);
    expect(can({ is_owner: false, permissions: ['pos.sell'] }, 'costs.view')).toBe(false);
    expect(can(null, 'pos.sell')).toBe(false);
  });
  it('الأدوار الافتراضية بصلاحيات معروفة فقط', () => {
    for (const r of DEFAULT_ROLES) for (const p of r.permissions) expect(ALL_PERMISSIONS).toContain(p);
    expect(new Set(ALL_PERMISSIONS).size).toBe(ALL_PERMISSIONS.length);
  });
});

it('الأيقونات مسارات SVG صالحة', () => {
  for (const [name, d] of Object.entries(icons)) {
    expect(d, name).toMatch(/^M/);
    expect(d, name).not.toMatch(/undefined|NaN/);
  }
});

it('البيانات التجريبية متسقة', () => {
  for (const v of demoVariants) expect(demoProducts.some((p) => p.id === v.product_id)).toBe(true);
  expect(new Set(demoVariants.map((v) => v.sku)).size).toBe(demoVariants.length);
  for (const o of demoOrders) expect(o.total).toBe(o.subtotal - o.discount + o.delivery_fee);
});

it('حالة المخزون', () => {
  expect(stockState(0).key).toBe('out');
  expect(stockState(3, 5).key).toBe('low');
  expect(stockState(30, 5).key).toBe('ok');
});
