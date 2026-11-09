import { defaultMediaBase } from '@raqeem/shared';

/** نسخة الحاسوب (بلا إنترنت): البوابة المحلية تحقن window.__RAQEEM_LOCAL__ وتخدم اللوحة وواجهات البيانات من نفس العنوان */
const LOCAL = (globalThis as { __RAQEEM_LOCAL__?: { anonKey: string; version?: string } }).__RAQEEM_LOCAL__;
export const IS_LOCAL = !!LOCAL;
/** نسخة الحاسوب: عنوان رقيم أونلاين لجلب بيانات المتجر مرة واحدة عند إنشاء الحساب (اختياري) */
export const ONLINE_SUPABASE_URL = (import.meta.env.VITE_ONLINE_SUPABASE_URL as string | undefined)?.trim() || '';
export const ONLINE_SUPABASE_ANON_KEY = (import.meta.env.VITE_ONLINE_SUPABASE_ANON_KEY as string | undefined)?.trim() || '';
export const LOCAL_VERSION = LOCAL?.version ?? '';

/** متغيرات البيئة العامة (لا أسرار هنا أبداً) */
export const SUPABASE_URL = LOCAL ? location.origin : (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.trim() || '';
export const SUPABASE_ANON_KEY = LOCAL ? LOCAL.anonKey : (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() || '';

/** وضع العرض: بلا إعداد Supabase تعمل اللوحة ببيانات تجريبية في الذاكرة */
export const IS_DEMO = !SUPABASE_URL || !SUPABASE_ANON_KEY;

// نسخة الحاسوب: الصور من الخادم المحلي دائماً (لا رابط إنترنت حتى لو ضُبط VITE_MEDIA_BASE عند البناء)
export const MEDIA_BASE = LOCAL ? defaultMediaBase(location.origin)
  : (import.meta.env.VITE_MEDIA_BASE as string | undefined)?.trim() || (SUPABASE_URL ? defaultMediaBase(SUPABASE_URL) : '');
