/**
 * إعدادات النظام في app_settings (المفتاح ← القيمة) التي لا يحمّلها SettingsProvider المشترك:
 * الفواتير والطباعة، المخزون، التطبيق، ونقطة البيع. مع ذاكرة مؤقتة حتى لا تُطلب مع كل بيع.
 */
import { useEffect, useState } from 'react';
import { DEFAULT_SITE_CONTENT, mergeSiteContent, type AppConfigSettings, type CheckoutSettings, type CurrencySettings, type InventorySettings, type InvoiceSettings, type SiteContent, type StoreSettings } from '@raqeem/shared';
import { demoCheckout, demoCurrency, demoStore } from '@raqeem/shared/demo';
import { IS_DEMO } from '../../../lib/env';
import { demoDb, demoDelay } from '../../../lib/demo-db';
import { sb } from '../../../lib/supabase';

/**
 * إعدادات نقطة البيع (مفتاح جديد «pos» — مطلوب إضافته في seed، وغيابه يعني القيم الافتراضية).
 * auto_print: طباعة الإيصال تلقائياً بعد كل بيع. require_cash_session: لا بيع بلا جلسة صندوق مفتوحة.
 */
export interface PosSettings {
  auto_print: boolean;
  require_cash_session: boolean;
  /** دقائق انتظار الطلب الجديد قبل اعتباره متأخراً في تنبيهات الرئيسية */
  late_order_minutes: number;
}

export interface SettingsMap {
  store: StoreSettings;
  checkout: CheckoutSettings;
  invoice: InvoiceSettings;
  inventory: InventorySettings;
  app: AppConfigSettings;
  pos: PosSettings;
  currency: CurrencySettings;
  /** محتوى الموقع التعريفي (عام) — packages/shared/src/site.ts */
  site: SiteContent;
}
export type SettingKey = keyof SettingsMap;

export const DEFAULTS: SettingsMap = {
  store: demoStore,
  checkout: demoCheckout,
  invoice: {
    receipt_width: 80,
    show_logo: true,
    header_note: null,
    footer_note: 'شكراً لتسوقكم — نسعد بخدمتكم دائماً',
    return_policy: 'يمكن الاستبدال أو الإرجاع خلال ٧ أيام بحالة المنتج الأصلية مع هذا الإيصال.',
    show_qr: true,
    label_size: { width_mm: 50, height_mm: 25 },
  },
  inventory: { allow_negative_stock: false, default_warehouse_id: null, low_stock_default: 5 },
  app: { min_version: 1, latest_version: 1, maintenance: false, maintenance_message: null, play_store_url: null, apk_url: null },
  pos: { auto_print: true, require_cash_session: false, late_order_minutes: 30 },
  currency: demoCurrency,
  site: DEFAULT_SITE_CONTENT,
};

/** هل يقرأ الزبون هذا المفتاح؟ (is_public) */
const PUBLIC: Record<SettingKey, boolean> = { store: true, checkout: true, app: true, invoice: false, inventory: false, pos: false, currency: true, site: true };

const cache = new Map<SettingKey, unknown>();
const subs = new Set<() => void>();

export async function getSetting<K extends SettingKey>(key: K, fresh = false): Promise<SettingsMap[K]> {
  if (!fresh && cache.has(key)) return cache.get(key) as SettingsMap[K];
  let value: SettingsMap[K];
  if (IS_DEMO) {
    await demoDelay(60);
    value = { ...DEFAULTS[key], ...((demoDb.settings[key] as object | undefined) ?? {}) } as SettingsMap[K];
  } else {
    const { data, error } = await sb().from('app_settings').select('value').eq('key', key).maybeSingle();
    if (error) throw error;
    value = { ...DEFAULTS[key], ...((data?.value as object | null) ?? {}) } as SettingsMap[K];
  }
  // محتوى الموقع: دمج قسماً قسماً (القيمة المخزّنة قد تكون ناقصة أو من نسخة أقدم)
  if (key === 'site') value = mergeSiteContent(value) as SettingsMap[K];
  cache.set(key, value);
  return value;
}

export async function saveSetting<K extends SettingKey>(key: K, value: SettingsMap[K]): Promise<void> {
  if (IS_DEMO) {
    await demoDelay();
    demoDb.settings[key] = JSON.parse(JSON.stringify(value));
    // SettingsProvider في وضع العرض يمسك كائني demoStore/demoCheckout نفسيهما ولا يعيد قراءتهما،
    // فنحدّثهما في مكانهما حتى يظهر شكل الأرقام والعملة الجديدان فوراً (انظر طلبات القائد في التقرير).
    if (key === 'store') Object.assign(demoStore, value);
    if (key === 'checkout') Object.assign(demoCheckout, value);
  } else {
    const { error } = await sb().from('app_settings').upsert({ key, value, is_public: PUBLIC[key] }, { onConflict: 'key' });
    if (error) throw error;
  }
  cache.set(key, value);
  subs.forEach((f) => f());
}

/** قراءة إعداد في مكوّن مع تحديث تلقائي بعد الحفظ */
export function useSetting<K extends SettingKey>(key: K): SettingsMap[K] {
  const [v, setV] = useState<SettingsMap[K]>(() => (cache.get(key) as SettingsMap[K]) ?? DEFAULTS[key]);
  useEffect(() => {
    let alive = true;
    const load = () => void getSetting(key).then((x) => alive && setV(x)).catch(() => undefined);
    load();
    subs.add(load);
    return () => { alive = false; subs.delete(load); };
  }, [key]);
  return v;
}
