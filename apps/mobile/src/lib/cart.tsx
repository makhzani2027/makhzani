import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { toast } from '@/components/toast';
import { api, type CartLine } from './api';
import { onSignOut, useAuth } from './auth';
import { friendlyError } from './errors';
import { storage } from './storage';

/**
 * السلة: للضيف على الهاتف فقط، وللمسجّل في cart_items على الخادم (مع نسخة محلية تعمل بلا إنترنت).
 * عند الدخول تُدمج سلة الضيف في سلة الحساب (الأكبر كمية يبقى) ثم تُمسح نسخة الضيف.
 */
interface CartValue {
  lines: CartLine[];
  count: number;
  ready: boolean;
  qtyOf: (variantId: string) => number;
  add: (variantId: string, qty?: number, price?: number) => void;
  setQty: (variantId: string, qty: number) => void;
  remove: (variantId: string) => void;
  /** بعد إتمام الطلب (الخادم يفرّغ سلته بنفسه) */
  clearLocal: () => void;
}

const Ctx = createContext<CartValue | null>(null);
const GUEST = 'raqeem.cart.guest';
const mirrorKey = (uid: string) => `raqeem.cart.${uid}`;

export function CartProvider({ children }: { children: ReactNode }) {
  const { uid } = useAuth();
  const [lines, setLines] = useState<CartLine[]>([]);
  const [ready, setReady] = useState(false);
  const uidRef = useRef<string | null>(null);
  uidRef.current = uid;

  // التحميل والدمج عند تغيّر الحساب
  useEffect(() => {
    let alive = true;
    (async () => {
      const guest = (await storage.get<CartLine[]>(GUEST)) ?? [];
      if (!uid) {
        if (alive) { setLines(guest); setReady(true); }
        return;
      }
      let server: CartLine[] | null = null;
      try {
        server = await api.cartGet(uid);
      } catch {
        server = await storage.get<CartLine[]>(mirrorKey(uid));
      }
      const merged = new Map<string, CartLine>();
      for (const l of server ?? []) merged.set(l.variant_id, { ...l });
      const mirror = (await storage.get<CartLine[]>(mirrorKey(uid))) ?? [];
      for (const l of mirror) {
        const m = merged.get(l.variant_id);
        if (m && l.price_seen !== undefined) m.price_seen = l.price_seen;
      }
      for (const g of guest) {
        const m = merged.get(g.variant_id);
        if (!m || g.qty > m.qty) {
          merged.set(g.variant_id, { ...g });
          api.cartSet(uid, g.variant_id, g.qty).catch(() => {});
        }
      }
      const next = [...merged.values()];
      if (!alive) return;
      setLines(next);
      setReady(true);
      storage.set(mirrorKey(uid), next);
      if (guest.length) storage.remove(GUEST);
    })();
    return () => { alive = false; };
  }, [uid]);

  useEffect(() => onSignOut(async () => {
    const id = uidRef.current;
    if (id) await storage.remove(mirrorKey(id));
  }), []);

  const persist = useCallback((next: CartLine[]) => {
    const id = uidRef.current;
    storage.set(id ? mirrorKey(id) : GUEST, next);
  }, []);

  const write = useCallback((variantId: string, qty: number, price?: number) => {
    setLines((prev) => {
      const i = prev.findIndex((l) => l.variant_id === variantId);
      let next: CartLine[];
      if (qty <= 0) next = prev.filter((l) => l.variant_id !== variantId);
      else if (i < 0) next = [...prev, { variant_id: variantId, qty, price_seen: price }];
      else next = prev.map((l, j) => (j === i ? { ...l, qty, price_seen: price ?? l.price_seen } : l));
      persist(next);
      return next;
    });
    const id = uidRef.current;
    if (id) {
      api.cartSet(id, variantId, qty).catch((e) => {
        toast.show(friendlyError(e, 'تعذّر حفظ السلة على حسابك الآن. سنحاول عند عودة الإنترنت.'), 'warning');
      });
    }
  }, [persist]);

  const value = useMemo<CartValue>(() => ({
    lines,
    ready,
    count: lines.reduce((s, l) => s + l.qty, 0),
    qtyOf: (v) => lines.find((l) => l.variant_id === v)?.qty ?? 0,
    add: (v, qty = 1, price) => write(v, (lines.find((l) => l.variant_id === v)?.qty ?? 0) + qty, price),
    setQty: (v, qty) => write(v, qty),
    remove: (v) => write(v, 0),
    clearLocal: () => {
      setLines([]);
      persist([]);
    },
  }), [lines, ready, write, persist]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCart(): CartValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useCart outside provider');
  return v;
}
