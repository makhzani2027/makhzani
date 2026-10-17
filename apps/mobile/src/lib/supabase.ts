import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppState, Platform } from 'react-native';
import { env, isDemo } from './env';

/**
 * عميل Supabase — يُنشأ فقط خارج وضع العرض.
 * الدخول بتدفق PKCE (الرمز يعود في رابط auth-callback ثم يُستبدل بجلسة)، والجلسة في AsyncStorage.
 */
export const supabase: SupabaseClient | null = isDemo
  ? null
  : createClient(env.supabaseUrl, env.supabaseAnonKey, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
        flowType: 'pkce',
      },
    });

if (supabase && Platform.OS !== 'web') {
  // تجديد الجلسة فقط والتطبيق ظاهر (توصية supabase-js للهاتف)
  AppState.addEventListener('change', (s) => {
    if (s === 'active') supabase.auth.startAutoRefresh();
    else supabase.auth.stopAutoRefresh();
  });
}

export function sb(): SupabaseClient {
  if (!supabase) throw new Error('Supabase غير مضبوط');
  return supabase;
}

/** يرمي الخطأ بدل إرجاعه — لتبسيط الاستدعاءات */
export async function must<T>(query: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return data;
}

/** يستدعي دالة خادم (Edge Function) ويعيد رسالة الخطأ العربية القادمة منها */
export async function callFunction<T>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await sb().functions.invoke(name, { body });
  if (error) {
    let message = 'تعذّر الاتصال بالخادم. تأكد من الإنترنت.';
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === 'function') {
      try {
        const payload = await ctx.json();
        if (typeof payload?.error === 'string') message = payload.error;
        else if (ctx.status === 404) message = 'هذه الخدمة لم تُفعّل على الخادم بعد.';
      } catch {
        if (ctx.status === 404) message = 'هذه الخدمة لم تُفعّل على الخادم بعد.';
      }
    }
    throw new Error(message);
  }
  return data as T;
}
