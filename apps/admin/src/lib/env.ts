import { defaultMediaBase } from '@raqeem/shared';

/** متغيرات البيئة العامة (لا أسرار هنا أبداً) */
export const SUPABASE_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() || '';
export const SUPABASE_ANON_KEY = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() || '';

/** وضع العرض: بلا إعداد Supabase تعمل اللوحة ببيانات تجريبية في الذاكرة */
export const IS_DEMO = !SUPABASE_URL || !SUPABASE_ANON_KEY;

export const MEDIA_BASE =
  (import.meta.env.VITE_MEDIA_BASE as string | undefined)?.trim() || (SUPABASE_URL ? defaultMediaBase(SUPABASE_URL) : '');
