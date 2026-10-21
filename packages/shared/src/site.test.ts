import { describe, expect, it } from 'vitest';
import configRaw from '../../../apps/site/config.json?raw';
import migration from '../../../supabase/migrations/20261016000022_site_content.sql?raw';
import { GOVERNORATES } from './iraq';
import { DEFAULT_SITE_CONTENT, fillSiteTemplate, mergeSiteContent, newPaymentKey, siteStats } from './site';

describe('محتوى الموقع التعريفي', () => {
  it('النسخ الثلاث متطابقة: shared و config.json و migration 22', () => {
    expect(JSON.parse(configRaw).site).toEqual(DEFAULT_SITE_CONTENT);
    const seed = migration.match(/\$site\$([\s\S]*?)\$site\$/)?.[1];
    expect(seed).toBeTruthy();
    expect(JSON.parse(seed!)).toEqual(DEFAULT_SITE_CONTENT);
  });

  it('المحافظات الافتراضية ١٨ بلا حلبجة', () => {
    expect(GOVERNORATES).toHaveLength(19);
    expect(DEFAULT_SITE_CONTENT.delivery.governorates).toHaveLength(18);
    expect(DEFAULT_SITE_CONTENT.delivery.governorates).not.toContain('حلبجة');
  });

  it('الأرقام التلقائية: المحافظات من الشارات وطرق الدفع من المفعّلة', () => {
    const s = siteStats(DEFAULT_SITE_CONTENT);
    expect(s.governorates).toBe(18);
    expect(s.payment_methods).toBe(2);
    const m = mergeSiteContent({ stats: { governorates: 12 }, payments: { methods: [{ key: 'cod', label: 'x', description: '', enabled: true }] } });
    expect(siteStats(m).governorates).toBe(12);
    expect(siteStats(m).payment_methods).toBe(1);
    expect(m.payments.methods[0].logo_key).toBeNull();
  });

  it('الدمج يحتمل القيم الناقصة والتالفة', () => {
    expect(mergeSiteContent(null)).toEqual(DEFAULT_SITE_CONTENT);
    expect(mergeSiteContent({ faq: 'x', hero: [] })).toEqual(DEFAULT_SITE_CONTENT);
    expect(mergeSiteContent({ faq: [] }).faq).toEqual([]);
    expect(mergeSiteContent({ delivery: { title: 'ت' } }).delivery.rows).toEqual(DEFAULT_SITE_CONTENT.delivery.rows);
  });

  it('القوالب', () => {
    expect(fillSiteTemplate('داخل {city}', { city: 'الموصل' })).toBe('داخل الموصل');
    expect(fillSiteTemplate('© {year} {name}. {x}', { year: '٢٠٢٧', name: 'رقيم' })).toBe('© ٢٠٢٧ رقيم. {x}');
    expect(fillSiteTemplate('داخل {city}', { city: '' })).toBe('داخل {city}');
  });

  it('مفتاح طريقة دفع جديدة', () => {
    expect(newPaymentKey('Fast Pay', [])).toBe('fast_pay');
    expect(newPaymentKey('ناس باي', ['method'])).toBe('method_2');
  });
});
