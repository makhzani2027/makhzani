import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { BadgeKey } from '../routes/types';
import { demoDb } from './demo-db';
import { IS_DEMO } from './env';
import { supabase } from './supabase';
import { beep } from './scanner';
import { toast } from '../ui/toast';

type Counts = Record<BadgeKey, number>;
const Ctx = createContext<{ counts: Counts; refresh: () => void }>({ counts: { ordersNew: 0, requestsNew: 0, lowStock: 0 }, refresh: () => undefined });

/** نغمة «طلب جديد» من نغمتين قصيرتين */
function chime() {
  beep('ok');
  setTimeout(() => beep('ok'), 160);
}

/**
 * عدّادات القائمة الجانبية + تنبيه لحظي بصوت عند وصول طلب جديد من التطبيق (Realtime على جدول orders).
 */
export function CountsProvider({ enabled, children, canOrders }: { enabled: boolean; canOrders: boolean; children: ReactNode }) {
  const [counts, setCounts] = useState<Counts>({ ordersNew: 0, requestsNew: 0, lowStock: 0 });

  const refresh = useCallback(async () => {
    if (!enabled) return;
    if (IS_DEMO || !supabase) {
      setCounts({
        ordersNew: demoDb.orders.filter((o) => o.status === 'pending').length,
        requestsNew: demoDb.product_requests.filter((r) => r.status === 'new').length,
        lowStock: demoDb.product_variants.filter((v) => v.is_active && v.available_qty <= v.min_stock).length,
      });
      return;
    }
    const [o, r, l] = await Promise.all([
      supabase.from('orders').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('product_requests').select('id', { count: 'exact', head: true }).eq('status', 'new'),
      supabase.rpc('low_stock', { lim: 500 }),
    ]);
    setCounts({ ordersNew: o.count ?? 0, requestsNew: r.count ?? 0, lowStock: Array.isArray(l.data) ? l.data.length : 0 });
  }, [enabled]);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 60_000);
    return () => clearInterval(t);
  }, [refresh]);

  useEffect(() => {
    if (!enabled || !canOrders || !supabase) return;
    const ch = supabase
      .channel('orders-new')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders' }, (payload) => {
        chime();
        const num = (payload.new as { number?: string }).number ?? '';
        toast.success(`وصل طلب جديد ${num}`);
        void refresh();
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders' }, () => void refresh())
      .subscribe();
    return () => { void supabase?.removeChannel(ch); };
  }, [enabled, canOrders, refresh]);

  const value = useMemo(() => ({ counts, refresh: () => void refresh() }), [counts, refresh]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useCounts = () => useContext(Ctx);
