import * as Linking from 'expo-linking';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut, ReduceMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { buildNumber } from '@/lib/env';
import { useOnline, useSettings } from '@/lib/query';
import { useTheme } from '@/lib/theme';
import { Mark } from './brand';
import { Button, Icon, T } from './ui';

/** شريط رفيع أعلى الشاشة عند انقطاع الإنترنت (الكتالوج المحفوظ يبقى ظاهراً) */
export function OfflineBanner() {
  const online = useOnline();
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  if (online) return null;
  return (
    <Animated.View
      entering={FadeIn.duration(160).reduceMotion(ReduceMotion.System)}
      exiting={FadeOut.duration(140)}
      pointerEvents="none"
      accessibilityLiveRegion="polite"
      style={{ position: 'absolute', top: insets.top + 4, alignSelf: 'center', zIndex: 600, elevation: 600, backgroundColor: c.ink, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 4, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
      <Icon name="globe" size={14} color={c.bg} />
      <T size={12.5} weight="bold" color={c.bg} style={{ paddingBottom: 0 }}>بلا إنترنت — تعرض آخر نسخة محفوظة</T>
    </Animated.View>
  );
}

/** طبقة الصيانة أو التحديث الإجباري من app_settings.app */
export function AppGate() {
  const { data } = useSettings();
  const { c } = useTheme();
  const app = data?.app;
  if (!app) return null;
  const mustUpdate = buildNumber < (app.min_version ?? 1);
  if (!app.maintenance && !mustUpdate) return null;
  const url = app.play_store_url || app.apk_url;
  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 800, elevation: 800, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 14 }]}>
      <Mark size={72} />
      <T v="h1" center>{mustUpdate ? 'يوجد تحديث مطلوب' : 'المتجر في صيانة'}</T>
      <T tone="ink2" center>
        {mustUpdate
          ? 'نسختك من التطبيق قديمة. حدّثها لتكمل التسوق بأمان.'
          : app.maintenance_message || 'نجهّز لك تحسينات. نعود خلال وقت قصير.'}
      </T>
      {mustUpdate && url ? <Button title="حدّث التطبيق" icon="download" onPress={() => Linking.openURL(url)} style={{ alignSelf: 'stretch' }} /> : null}
    </View>
  );
}
