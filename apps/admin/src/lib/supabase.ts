import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { IS_DEMO, SUPABASE_ANON_KEY, SUPABASE_URL } from './env';

/**
 * عميل Supabase الوحيد. في وضع العرض قيمته null — استعمل الدوال في data.ts بدل الوصول المباشر حيث أمكن.
 */
export const supabase: SupabaseClient | null = IS_DEMO
  ? null
  : createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: 'rq.admin.auth' },
      realtime: { params: { eventsPerSecond: 5 } },
    });

/** للعمليات التي لا معنى لها في وضع العرض */
export function sb(): SupabaseClient {
  if (!supabase) throw new AppError('هذه العملية تحتاج ربط قاعدة البيانات (وضع العرض).');
  return supabase;
}

/** خطأ برسالة عربية جاهزة للعرض */
export class AppError extends Error {}

/**
 * يحوّل أخطاء Supabase/Postgres إلى رسالة عربية مفهومة.
 * دوال قاعدة البيانات ترمي رسائل عربية أصلاً (errcode P0001) فتُعرض كما هي.
 */
export function errorMessage(e: unknown): string {
  if (!e) return 'حدث خطأ غير معروف.';
  if (e instanceof AppError) return e.message;
  const err = e as { message?: string; code?: string; details?: string };
  const msg = err.message || String(e);
  if (/[؀-ۿ]/.test(msg)) return msg;
  if (err.code === '23505') return 'هذه القيمة مستخدمة من قبل (مكررة). غيّرها وحاول مجدداً.';
  if (err.code === '23503') return 'لا يمكن الحذف لأن هناك بيانات مرتبطة بهذا العنصر.';
  if (err.code === '42501' || /permission denied|row-level security/i.test(msg)) return 'ليست لديك صلاحية لهذه العملية.';
  if (/Failed to fetch|NetworkError|network/i.test(msg)) return 'تعذّر الاتصال بالخادم. تحقق من الإنترنت.';
  if (/Invalid login credentials/i.test(msg)) return 'البريد أو كلمة السر غير صحيحة.';
  if (/JWT expired|invalid JWT/i.test(msg)) return 'انتهت الجلسة. سجّل الدخول من جديد.';
  return 'حدث خطأ غير متوقع. حاول مجدداً.';
}

/** استدعاء دالة RPC مع رسالة خطأ عربية */
export async function rpc<T>(name: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await sb().rpc(name, args ?? {});
  if (error) throw new AppError(errorMessage(error));
  return data as T;
}
