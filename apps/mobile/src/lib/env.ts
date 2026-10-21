import { defaultMediaBase } from '@raqeem/shared';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';

/**
 * إعدادات البيئة العامة (متغيرات EXPO_PUBLIC_* فقط — تُضمَّن في التطبيق ولا سرّ فيها).
 * تُقرأ بأسمائها الكاملة حرفياً لأن Expo يستبدلها وقت التجميع.
 * الاحتياط: نفس القيم في expoConfig.extra (app.config.ts يقرأ أيضاً .env بجذر المستودع والأسماء بلا بادئة).
 */
const extra = (Constants.expoConfig?.extra ?? {}) as {
  buildNumber?: number; selfUpdate?: boolean; releasesRepo?: string; supabaseUrl?: string; supabaseAnonKey?: string; mediaBase?: string; siteUrl?: string;
};
const pick = (inlined: string | undefined, fallback: string | undefined) => (inlined ?? '').trim() || (fallback ?? '').trim();

const supabaseUrl = pick(process.env.EXPO_PUBLIC_SUPABASE_URL, extra.supabaseUrl).replace(/\/+$/, '');
const supabaseAnonKey = pick(process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY, extra.supabaseAnonKey);

export const env = {
  supabaseUrl,
  supabaseAnonKey,
  mediaBase: pick(process.env.EXPO_PUBLIC_MEDIA_BASE, extra.mediaBase) || (supabaseUrl ? defaultMediaBase(supabaseUrl) : ''),
  siteUrl: (pick(process.env.EXPO_PUBLIC_SITE_URL, extra.siteUrl) || 'https://raqeem-iq.web.app').replace(/\/$/, ''),
};

/** وضع العرض: لا إعداد Supabase ← كل التطبيق يعمل على بيانات @raqeem/shared/demo */
export const isDemo = !supabaseUrl || !supabaseAnonKey;

if (isDemo) {
  // يظهر في سجل الجهاز (adb logcat) — أسرع طريقة لمعرفة سبب «التطبيق غير مربوط بالقاعدة»
  console.warn('[raqeem] وضع العرض: EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY غير مضبوطين وقت البناء.');
}

/** داخل تطبيق Expo Go (لا إشعارات بعيدة، ولا رمز Firebase) */
export const isExpoGo = Constants.executionEnvironment === ExecutionEnvironment.StoreClient;

export const isWeb = Platform.OS === 'web';

/** رقم البناء (APK_BUILD) — يُقارن بأقل نسخة مسموحة في app_settings.app */
export const buildNumber = Number(extra.buildNumber ?? 1) || 1;
export const appVersion = Constants.expoConfig?.version ?? '1.0.1';

/** التحديث من داخل التطبيق: أندرويد خارج Expo Go، وليس نسخة Google Play (SELF_UPDATE=false وقت البناء) */
export const selfUpdate = Platform.OS === 'android' && !isExpoGo && extra.selfUpdate !== false;
/** مستودع الإصدارات العام على GitHub (آخر نسخة: releases/latest) */
export const releasesRepo = extra.releasesRepo || 'makhzani2027/raqeem-app';
