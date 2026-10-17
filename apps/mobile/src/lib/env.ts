import { defaultMediaBase } from '@raqeem/shared';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';

/**
 * إعدادات البيئة العامة (متغيرات EXPO_PUBLIC_* فقط — تُضمَّن في التطبيق ولا سرّ فيها).
 * تُقرأ بأسمائها الكاملة حرفياً لأن Expo يستبدلها وقت التجميع.
 */
const supabaseUrl = (process.env.EXPO_PUBLIC_SUPABASE_URL ?? '').trim();
const supabaseAnonKey = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '').trim();

export const env = {
  supabaseUrl,
  supabaseAnonKey,
  mediaBase: (process.env.EXPO_PUBLIC_MEDIA_BASE ?? '').trim() || (supabaseUrl ? defaultMediaBase(supabaseUrl) : ''),
  siteUrl: ((process.env.EXPO_PUBLIC_SITE_URL ?? '').trim() || 'https://raqeemiq.web.app').replace(/\/$/, ''),
};

/** وضع العرض: لا إعداد Supabase ← كل التطبيق يعمل على بيانات @raqeem/shared/demo */
export const isDemo = !supabaseUrl || !supabaseAnonKey;

/** داخل تطبيق Expo Go (لا إشعارات بعيدة، ولا رمز Firebase) */
export const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

export const isWeb = Platform.OS === 'web';

/** رقم البناء (APK_BUILD) — يُقارن بأقل نسخة مسموحة في app_settings.app */
export const buildNumber = Number((Constants.expoConfig?.extra as { buildNumber?: number } | undefined)?.buildNumber ?? 1) || 1;
export const appVersion = Constants.expoConfig?.version ?? '1.0.1';
