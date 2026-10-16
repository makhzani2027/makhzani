/**
 * بحث عربي متسامح: «ايفون» يجد «آيفون»، «شاحنه» يجد «شاحنة»، و«١٢٨» يجد «128».
 * نفس القواعد في قاعدة البيانات (دالة public.normalize_ar) — أي تعديل هنا يقابله migration.
 */
import { toLatinDigits } from './format';

const TASHKEEL = /[ؐ-ًؚ-ٰٟۖ-ۭ]/g;
const TATWEEL = /ـ/g;

export function normalizeArabic(input: string | null | undefined): string {
  if (!input) return '';
  return toLatinDigits(input)
    .replace(TASHKEEL, '')
    .replace(TATWEEL, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function tokens(input: string): string[] {
  return normalizeArabic(input).split(' ').filter(Boolean);
}

/**
 * نتيجة تطابق بسيطة للبحث المحلي (قوائم صغيرة في الواجهة، نقطة البيع):
 * ٠ = لا تطابق. كل كلمة يجب أن توجد. التطابق في البداية أعلى، والرمز (SKU/باركود) المطابق تماماً أعلى شيء.
 */
export function matchScore(query: string, haystack: string, exactCodes: string[] = []): number {
  const q = normalizeArabic(query);
  if (!q) return 1;
  // الرموز تُقارن كما هي (بلا تطبيع يحذف الشرطة): «RQ-00001»
  const raw = toLatinDigits(query).trim().toLowerCase();
  const codeHit = exactCodes.some((c) => c && toLatinDigits(c).trim().toLowerCase() === raw);
  if (codeHit) return 1000;
  const h = normalizeArabic(haystack);
  const words = q.split(' ');
  let score = 0;
  for (const w of words) {
    const i = h.indexOf(w);
    if (i < 0) return 0;
    score += i === 0 ? 30 : h[i - 1] === ' ' ? 20 : 8;
  }
  return score + Math.max(0, 20 - (h.length - q.length) / 4);
}

/** slug لاتيني/عربي للروابط: «سماعة بلوتوث JBL» ← «سماعه-بلوتوث-jbl» */
export function slugify(input: string): string {
  return normalizeArabic(input).replace(/\s+/g, '-').slice(0, 80) || 'item';
}
