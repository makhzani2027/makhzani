import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, router, Stack, ThemeProvider, useSegments, type ErrorBoundaryProps } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect, useRef, useState } from 'react';
import { I18nManager, Platform, ScrollView, Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DialogHost } from '@/components/dialog';
import { FlyProvider } from '@/components/fly';
import { Intro } from '@/components/intro';
import { AppGate, OfflineBanner } from '@/components/overlays';
import { PortalProvider } from '@/components/portal';
import { ToastHost } from '@/components/toast';
import { UpdatePrompt } from '@/components/update';
import { AuthProvider, useAuth } from '@/lib/auth';
import { CartProvider } from '@/lib/cart';
import { FavoritesProvider } from '@/lib/favorites';
import { useWelcomed } from '@/lib/hooks';
import { notificationRoute, onNotificationTap, registerPush } from '@/lib/push';
import { QueryProvider } from '@/lib/query';
import { AppThemeProvider, fontAssets, useTheme } from '@/lib/theme';

// التطبيق عربي بالكامل: من اليمين لليسار
if (Platform.OS !== 'web') {
  I18nManager.allowRTL(true);
  I18nManager.forceRTL(true);
  I18nManager.swapLeftAndRightInRTL(true);
} else if (typeof document !== 'undefined') {
  document.documentElement.dir = 'rtl';
  document.documentElement.lang = 'ar';
}

SplashScreen.preventAutoHideAsync().catch(() => {});
// شبكة أمان: لا تبقى شاشة البداية أكثر من ٨ ثوانٍ مهما حدث
setTimeout(() => SplashScreen.hideAsync().catch(() => {}), 8000);

/** بدل التجمد: نعرض الخطأ بوضوح مع زر إعادة المحاولة */
export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  useEffect(() => { SplashScreen.hideAsync().catch(() => {}); }, []);
  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 28, gap: 14, backgroundColor: '#EDEEEC' }}>
      <Text style={{ fontSize: 24, fontWeight: '700', color: '#121513', textAlign: 'center' }}>حدث خطأ غير متوقع</Text>
      <Text selectable style={{ fontSize: 13, color: '#50564F', textAlign: 'left', writingDirection: 'ltr' }}>{error.message}</Text>
      <Text onPress={retry} style={{ fontSize: 17, fontWeight: '700', color: '#C2410E', textAlign: 'center', padding: 12 }}>إعادة المحاولة</Text>
    </ScrollView>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(fontAssets);
  // إن فشل تحميل الخط نكمل بخط النظام بدل التجمد
  if (!fontsLoaded && !fontError) return null;
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AppThemeProvider>
          <QueryProvider>
            <AuthProvider>
              <CartProvider>
                <FavoritesProvider>
                  <PortalProvider>
                    <FlyProvider>
                      <Navigator />
                    </FlyProvider>
                  </PortalProvider>
                </FavoritesProvider>
              </CartProvider>
            </AuthProvider>
          </QueryProvider>
        </AppThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function Navigator() {
  const { c, dark } = useTheme();
  const { ready, uid, profile } = useAuth();
  const segments = useSegments() as string[];
  const [intro, setIntro] = useState(true);
  const welcomed = useWelcomed();

  // بوابة البداية: الترحيب أول مرة، وإكمال البيانات بعد أول دخول بـ Google
  useEffect(() => {
    if (!ready || welcomed === null) return;
    const hide = setTimeout(() => SplashScreen.hideAsync().catch(() => {}), 120);
    const page = segments[0];
    if (page === 'auth-callback') return () => clearTimeout(hide);
    if (!welcomed && !uid && page !== 'welcome' && page !== 'login') {
      router.replace('/welcome');
    } else if (uid && profile && !profile.onboarded && page !== 'complete-profile' && !['legal'].includes(page ?? '')) {
      router.replace('/complete-profile');
    }
    return () => clearTimeout(hide);
  }, [ready, welcomed, uid, profile, segments]);

  // الإشعارات: تسجيل رمز الجهاز بعد إكمال البيانات (لا شيء في Expo Go أو الويب)
  const onboardedUid = profile?.onboarded ? uid : null;
  useEffect(() => { if (onboardedUid) registerPush(onboardedUid); }, [onboardedUid]);

  // الضغط على إشعار يفتح الطلب أو العرض
  const tapped = useRef(false);
  useEffect(() => {
    if (!ready || tapped.current) return;
    tapped.current = true;
    return onNotificationTap((d) => router.push(notificationRoute(d) as never));
  }, [ready]);

  // خلفية النافذة تتبع الثيم: بدونها يظهر شريط فاتح أعلى الشاشة في الوضع الغامق على بعض أجهزة أندرويد
  useEffect(() => { SystemUI.setBackgroundColorAsync(c.bg).catch(() => {}); }, [c.bg]);

  const navTheme = dark
    ? { ...DarkTheme, colors: { ...DarkTheme.colors, background: c.bg, card: c.card, text: c.ink, border: c.line, primary: c.accent } }
    : { ...DefaultTheme, colors: { ...DefaultTheme.colors, background: c.bg, card: c.card, text: c.ink, border: c.line, primary: c.accent } };

  return (
    <ThemeProvider value={navTheme}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg }, animation: 'slide_from_left', animationDuration: 220 }}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="welcome" options={{ animation: 'fade' }} />
          <Stack.Screen name="login" options={{ animation: 'fade_from_bottom', presentation: 'modal' }} />
          <Stack.Screen name="complete-profile" options={{ animation: 'fade', gestureEnabled: false }} />
          <Stack.Screen name="order-success/[id]" options={{ animation: 'fade', gestureEnabled: false }} />
        </Stack>
        <OfflineBanner />
        <AppGate />
        <UpdatePrompt />
        <ToastHost />
        <DialogHost />
        {intro ? <Intro onDone={() => setIntro(false)} /> : null}
      </View>
    </ThemeProvider>
  );
}
