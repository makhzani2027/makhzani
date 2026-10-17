import { useCallback, useState } from 'react';
import { toast } from '../../../ui';
import type { VariantHit } from '../../catalog/api';

/** سطر في مستند إدخال سريع (سند، نقل، شراء): مسح باركود الكرتونة يضيف factor قطعة */
export interface Line {
  variant_id: string;
  name: string;
  title: string;
  sku: string;
  cover_key: string | null;
  track_expiry: boolean;
  track_serials: boolean;
  available: number;
  qty: number | null;
  unit_cost: number | null;
  lot_code: string;
  expiry_date: string;
  serials: string;
  added: number;
}

export function lineFromHit(h: VariantHit, over: Partial<Line> = {}): Line {
  return {
    variant_id: h.variant_id, name: h.name, title: h.title, sku: h.sku, cover_key: h.cover_key, track_expiry: h.track_expiry, track_serials: h.track_serials,
    available: h.available_qty, qty: h.factor || 1, unit_cost: null, lot_code: '', expiry_date: '', serials: '', added: Date.now(), ...over,
  };
}

export function useLines(initial: Line[] = []) {
  const [lines, setLines] = useState<Line[]>(initial);
  const add = useCallback((h: VariantHit, over: Partial<Line> = {}) => {
    setLines((ls) => {
      const i = ls.findIndex((l) => l.variant_id === h.variant_id);
      if (i >= 0) {
        const n = [...ls];
        n[i] = { ...n[i], qty: (n[i].qty ?? 0) + (h.factor || 1), added: Date.now() };
        return [n[i], ...n.filter((_, j) => j !== i)];
      }
      return [lineFromHit(h, over), ...ls];
    });
    if (h.unit_name && h.factor > 1) toast.info(`${h.unit_name}: أُضيفت ${h.factor} قطعة`);
  }, []);
  const update = useCallback((variantId: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.variant_id === variantId ? { ...l, ...patch } : l))), []);
  const remove = useCallback((variantId: string) => setLines((ls) => ls.filter((l) => l.variant_id !== variantId)), []);
  const units = lines.reduce((s, l) => s + (l.qty ?? 0), 0);
  return { lines, setLines, add, update, remove, units };
}

export const serialList = (s: string) => s.split(/[\s,]+/).map((x) => x.trim()).filter(Boolean);
