import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  formatDate, formatMoney, formatNumber, formatQty, formatRelative, formatTime, countOf,
  type CheckoutSettings, type Digits, type StoreSettings,
} from '@raqeem/shared';
import { demoCheckout, demoStore } from '@raqeem/shared/demo';
import { IS_DEMO } from './env';
import { supabase } from './supabase';

interface SettingsState {
  store: StoreSettings;
  checkout: CheckoutSettings;
  reload: () => void;
}
const Ctx = createContext<SettingsState | null>(null);

export function SettingsProvider({ children, enabled }: { children: ReactNode; enabled: boolean }) {
  const [store, setStore] = useState<StoreSettings>(demoStore);
  const [checkout, setCheckout] = useState<CheckoutSettings>(demoCheckout);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (IS_DEMO || !supabase || !enabled) return;
    supabase
      .from('app_settings')
      .select('key,value')
      .in('key', ['store', 'checkout'])
      .then(({ data }) => {
        for (const row of data ?? []) {
          if (row.key === 'store') setStore({ ...demoStore, ...(row.value as StoreSettings) });
          if (row.key === 'checkout') setCheckout({ ...demoCheckout, ...(row.value as CheckoutSettings) });
        }
      });
  }, [enabled, tick]);
  const value = useMemo(() => ({ store, checkout, reload: () => setTick((t) => t + 1) }), [store, checkout]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSettings(): SettingsState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSettings خارج SettingsProvider');
  return v;
}

/** التنسيق بإعدادات المتجر (العملة وشكل الأرقام) — استعمله في كل مكان يعرض رقماً */
export function useFmt() {
  const { store } = useSettings();
  const digits: Digits = store.digits ?? 'arab';
  const currency = store.currency ?? 'IQD';
  return useMemo(
    () => ({
      digits,
      currency,
      money: (n: number | null | undefined, bare = false) => formatMoney(n, { currency, digits, bare }),
      num: (n: number) => formatNumber(n, { digits }),
      qty: (n: number) => formatQty(n, digits),
      date: (d: string | number | Date, time = false) => formatDate(d, { digits, time }),
      time: (d: string | number | Date) => formatTime(d, { digits }),
      ago: (d: string | number | Date) => formatRelative(d, Date.now(), digits),
      count: (n: number, forms: Parameters<typeof countOf>[1]) => countOf(n, forms, digits),
    }),
    [digits, currency],
  );
}
