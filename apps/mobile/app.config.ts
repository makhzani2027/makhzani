import fs from 'node:fs';
import path from 'node:path';
import type { ConfigContext, ExpoConfig } from 'expo/config';
import { brand, palette } from '../../packages/shared/src/theme.ts';

/**
 * إعداد تطبيق «رقيم» (يُقرأ عند expo start / prebuild).
 * - رقم البناء من APK_BUILD (سير عمل GitHub)، والتطبيق يقارنه بـ app_settings.app.min_version لطلب التحديث.
 * - Firebase (الإشعارات) يُربط فقط إن وُجد السر GOOGLE_SERVICES_JSON أثناء البناء: نكتبه ملفاً ثم نشير إليه.
 */
/**
 * قيم الاتصال بـ Supabase. Expo يقرأ apps/mobile/.env وحده ويضمّن EXPO_PUBLIC_* في الشيفرة؛
 * ونمررها أيضاً عبر extra كاحتياط حتى لا يقع التطبيق في «وضع العرض» بصمت إن وُضعت القيم
 * في .env بجذر المستودع أو بأسماء بلا بادئة (SUPABASE_URL كما في GitHub Variables).
 */
function readRootEnv(): Record<string, string> {
  const out: Record<string, string> = {};
  for (const name of ['.env', '.env.local']) {
    const file = path.join(__dirname, '../..', name);
    if (!fs.existsSync(file)) continue;
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m) out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
    }
  }
  return out;
}
function publicEnv() {
  const root = readRootEnv();
  const pick = (...keys: string[]) => {
    for (const k of keys) {
      const v = (process.env[k] ?? root[k] ?? '').trim();
      if (v) return v;
    }
    return '';
  };
  return {
    supabaseUrl: pick('EXPO_PUBLIC_SUPABASE_URL', 'SUPABASE_URL'),
    supabaseAnonKey: pick('EXPO_PUBLIC_SUPABASE_ANON_KEY', 'SUPABASE_ANON_KEY'),
    mediaBase: pick('EXPO_PUBLIC_MEDIA_BASE', 'MEDIA_BASE_URL'),
    siteUrl: pick('EXPO_PUBLIC_SITE_URL', 'SITE_URL'),
  };
}

export default ({ config }: ConfigContext): ExpoConfig => {
  const build = Number(process.env.APK_BUILD) || 1;
  const selfUpdate = process.env.SELF_UPDATE !== 'false';

  let googleServicesFile: string | undefined;
  const gs = process.env.GOOGLE_SERVICES_JSON;
  if (gs && gs.trim().startsWith('{')) {
    const file = path.join(__dirname, 'google-services.json');
    fs.writeFileSync(file, gs);
    googleServicesFile = './google-services.json';
  }

  return {
    ...config,
    name: 'رقيم',
    slug: 'raqeem',
    scheme: 'raqeem',
    version: `1.0.${build}`,
    orientation: 'portrait',
    icon: './assets/images/icon.png',
    userInterfaceStyle: 'automatic',
    backgroundColor: palette.light.bg,
    ios: {
      bundleIdentifier: 'iq.raqeem.app',
      supportsTablet: true,
    },
    android: {
      package: 'iq.raqeem.app',
      versionCode: build,
      adaptiveIcon: {
        backgroundColor: brand.brick,
        foregroundImage: './assets/images/android-icon-foreground.png',
        backgroundImage: './assets/images/android-icon-background.png',
        monochromeImage: './assets/images/android-icon-monochrome.png',
      },
      softwareKeyboardLayoutMode: 'resize',
      // التحديث من داخل التطبيق (النسخة المنزّلة من الموقع/GitHub). نسخة Google Play تُبنى بـ SELF_UPDATE=false:
      // سياسة Play تمنع التطبيق من تحديث نفسه خارج المتجر.
      ...(selfUpdate ? { permissions: ['android.permission.REQUEST_INSTALL_PACKAGES'] } : null),
      // أقل الصلاحيات: الإنترنت والكاميرا (صورة طلب التوفير) والإشعارات فقط. اختيار الصور يمر عبر
      // منتقي النظام بلا صلاحية، فنحذف ما يضيفه قالب Expo والإضافات (سياسة صور Google Play)
      blockedPermissions: [
        'android.permission.READ_EXTERNAL_STORAGE',
        'android.permission.WRITE_EXTERNAL_STORAGE',
        'android.permission.READ_MEDIA_IMAGES',
        'android.permission.READ_MEDIA_VIDEO',
        'android.permission.READ_MEDIA_AUDIO',
        'android.permission.READ_MEDIA_VISUAL_USER_SELECTED',
        'android.permission.ACCESS_MEDIA_LOCATION',
        'android.permission.RECORD_AUDIO',
        'android.permission.SYSTEM_ALERT_WINDOW',
      ],
      predictiveBackGestureEnabled: false,
      ...(googleServicesFile ? { googleServicesFile } : null),
    },
    web: {
      output: 'single',
      favicon: './assets/images/favicon.png',
      bundler: 'metro',
    },
    plugins: [
      'expo-router',
      [
        'expo-splash-screen',
        {
          backgroundColor: palette.light.bg,
          image: './assets/images/splash-icon.png',
          imageWidth: 160,
          dark: { backgroundColor: palette.dark.bg, image: './assets/images/splash-icon-dark.png' },
        },
      ],
      ['expo-localization', { supportsRTL: true, forcesRTL: true }],
      ['expo-notifications', { icon: './assets/images/notification-icon-96.png', color: brand.brick }],
      [
        'expo-image-picker',
        {
          photosPermission: 'يحتاج رقيم الوصول لصورك لترفق صورة المنتج الذي تطلبه.',
          cameraPermission: 'يحتاج رقيم الكاميرا لتصوّر المنتج الذي تطلبه.',
          microphonePermission: false,
        },
      ],
      [
        'expo-font',
        {
          fonts: [
            './assets/fonts/thmanyahsans-Regular.otf',
            './assets/fonts/thmanyahsans-Medium.otf',
            './assets/fonts/thmanyahsans-Bold.otf',
            './assets/fonts/thmanyahsans-Black.otf',
            './assets/fonts/thmanyahserifdisplay-Bold.otf',
            './assets/fonts/thmanyahserifdisplay-Black.otf',
            './assets/fonts/thmanyahseriftext-Regular.otf',
          ],
        },
      ],
      'expo-web-browser',
    ],
    experiments: { typedRoutes: false },
    extra: {
      // Expo Go يقرأ الاتجاه من هنا (ملف APK يأخذه من إضافة expo-localization)
      supportsRTL: true,
      forcesRTL: true,
      buildNumber: build,
      selfUpdate,
      releasesRepo: (process.env.RELEASES_REPO || 'makhzani2027/raqeem-app').trim(),
      // قيم عامة (المفتاح anon يُرسل لكل متصفح أصلاً) — احتياط لـ env.ts
      ...publicEnv(),
    },
  };
};
