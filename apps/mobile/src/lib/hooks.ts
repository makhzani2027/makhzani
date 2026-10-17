import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useSyncExternalStore } from 'react';
import { api } from './api';
import { useAuth } from './auth';
import { qk } from './query';

/** عدد الإشعارات غير المقروءة للمسجّل */
export function useUnread() {
  const { uid } = useAuth();
  const { data } = useQuery({ queryKey: qk.notifications(uid ?? '-'), queryFn: () => api.notifications(uid!), enabled: !!uid });
  return (data ?? []).filter((n) => !n.read_at).length;
}

/** معلومات نسخ السلة (الاسم، الصورة، السعر الحالي) */
export function useVariantInfos(ids: string[]) {
  const key = [...ids].sort();
  return useQuery({ queryKey: ['variants', ...key], queryFn: () => api.variants(key), enabled: key.length > 0, placeholderData: keepPreviousData });
}

/** تسعير السلة من الخادم (quote_cart). governorate = null ← استلام/بلا أجرة */
export function useQuote(lines: { variant_id: string; qty: number }[], governorate: string | null, coupon: string | null) {
  const items = lines.map((l) => ({ variant_id: l.variant_id, qty: l.qty })).sort((a, b) => a.variant_id.localeCompare(b.variant_id));
  return useQuery({
    queryKey: ['quote', JSON.stringify(items), governorate, coupon],
    queryFn: () => api.quote(items, governorate, coupon),
    enabled: items.length > 0,
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });
}

// ---------------------------------------------------------------- الكوبون المكتوب في السلة (يبقى حتى الإتمام)
let coupon: string | null = null;
const couponListeners = new Set<() => void>();
export const couponStore = {
  set(v: string | null) {
    coupon = v?.trim().toUpperCase() || null;
    couponListeners.forEach((l) => l());
  },
};
export function useCoupon(): string | null {
  return useSyncExternalStore((cb) => { couponListeners.add(cb); return () => { couponListeners.delete(cb); }; }, () => coupon, () => coupon);
}
