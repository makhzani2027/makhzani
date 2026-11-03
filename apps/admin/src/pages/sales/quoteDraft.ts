/**
 * مسودة عرض السعر غير المحفوظة: تُحفظ في المتصفح مع كل تعديل، فلو خرج الموظف لقسم آخر ورجع
 * يجد العرض كما تركه. تُمسح عند الحفظ أو التحويل أو «تجاهل المسودة».
 * - المفتاح لكل موظف ولكل عرض (الجديد: new).
 * - مسودة عرض محفوظ تُهمَل إن تغيّر العرض على الخادم بعدها (بصمة base) أو أُغلق.
 */
import type { CurrencyCode, PriceTier } from '@raqeem/shared';

export interface DraftLine { variant_id: string; name: string; variant_title: string | null; image_key: string | null; qty: number; unit_price: number; discount: number; price_tier: PriceTier }
export interface QuoteDraft {
  v: 1;
  at: number;
  base: string;
  step: 'info' | 'items' | 'features' | 'review';
  customer: unknown;
  freeName: string; freePhone: string; title: string; whId: string; currency: CurrencyCode; tier: PriceTier;
  valid: string; discount: number; note: string; features: string[]; lines: DraftLine[];
}

const PREFIX = 'rq.quoteDraft:';
const MAX_AGE = 30 * 24 * 3600 * 1000;
export const draftKey = (userId: string | null | undefined, quoteId: string | null | undefined) => `${PREFIX}${userId ?? 'anon'}:${quoteId ?? 'new'}`;

export function readDraft(key: string, base: string): QuoteDraft | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const d = JSON.parse(raw) as QuoteDraft;
    if (d?.v !== 1 || d.base !== base || Date.now() - d.at > MAX_AGE || !Array.isArray(d.lines) || !Array.isArray(d.features)) {
      localStorage.removeItem(key);
      return null;
    }
    return d;
  } catch { return null; }
}
export function writeDraft(key: string, d: QuoteDraft) {
  try { localStorage.setItem(key, JSON.stringify(d)); } catch { /* المتصفح يمنع التخزين: يبقى السلوك القديم */ }
}
export function clearDraft(key: string) {
  try { localStorage.removeItem(key); } catch { /* */ }
}

/** معرّفات العروض المحفوظة التي لها تعديلات غير محفوظة لهذا الموظف (لشارة في القائمة) */
export function draftIds(userId: string | null | undefined): Set<string> {
  const out = new Set<string>();
  const pre = draftKey(userId, '');
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(pre) && k.length > pre.length && k !== draftKey(userId, 'new')) out.add(k.slice(pre.length));
    }
  } catch { /* */ }
  return out;
}
