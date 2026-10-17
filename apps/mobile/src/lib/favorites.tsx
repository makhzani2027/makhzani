import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { toast } from '@/components/toast';
import { api } from './api';
import { useAuth } from './auth';
import { storage } from './storage';

/** المفضلة: مثل السلة — محلية للضيف، وعلى الخادم (favorites) للمسجّل، وتُدمج عند الدخول */
interface FavValue {
  ids: string[];
  has: (productId: string) => boolean;
  toggle: (productId: string) => boolean;
}

const Ctx = createContext<FavValue | null>(null);
const GUEST = 'raqeem.fav.guest';

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const { uid } = useAuth();
  const [ids, setIds] = useState<string[]>([]);
  const uidRef = useRef<string | null>(null);
  uidRef.current = uid;

  useEffect(() => {
    let alive = true;
    (async () => {
      const guest = (await storage.get<string[]>(GUEST)) ?? [];
      if (!uid) {
        if (alive) setIds(guest);
        return;
      }
      let server: string[] = [];
      try {
        server = await api.favoritesGet(uid);
      } catch {
        server = (await storage.get<string[]>(`raqeem.fav.${uid}`)) ?? [];
      }
      const extra = guest.filter((g) => !server.includes(g));
      extra.forEach((g) => api.favoriteSet(uid, g, true).catch(() => {}));
      const next = [...extra, ...server];
      if (!alive) return;
      setIds(next);
      storage.set(`raqeem.fav.${uid}`, next);
      if (guest.length) storage.remove(GUEST);
    })();
    return () => { alive = false; };
  }, [uid]);

  const idsRef = useRef<string[]>([]);
  idsRef.current = ids;

  const toggle = useCallback((productId: string) => {
    const prev = idsRef.current;
    const on = !prev.includes(productId);
    const next = on ? [productId, ...prev] : prev.filter((x) => x !== productId);
    idsRef.current = next;
    setIds(next);
    const id = uidRef.current;
    storage.set(id ? `raqeem.fav.${id}` : GUEST, next);
    if (id) api.favoriteSet(id, productId, on).catch(() => toast.show('تعذّر حفظ المفضلة الآن. تأكد من الإنترنت.', 'warning'));
    return on;
  }, []);

  const value = useMemo<FavValue>(() => ({ ids, has: (p) => ids.includes(p), toggle }), [ids, toggle]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useFavorites(): FavValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useFavorites outside provider');
  return v;
}
