import fs from 'node:fs';
import path from 'node:path';
import type { ConfigContext, ExpoConfig } from 'expo/config';
import { brand, palette } from '../../packages/shared/src/theme.ts';

/**
 * إعداد تطبيق «رقيم» (يُقرأ عند expo start / prebuild).
 * - رقم البناء من APK_BUILD (سير عمل GitHub)، والتطبيق يقارنه بـ app_settings.app.min_version لطلب التحديث.
 * - Firebase (الإشعارات) يُربط فقط إن وُجد السر GOOGLE_SERVICES_JSON أثناء البناء: نكتبه ملفاً ثم نشير إليه.
 */
export default ({ config }: ConfigContext): ExpoConfig => {
  const build = Number(process.env.APK_BUILD) || 1;

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
    },
  };
};
