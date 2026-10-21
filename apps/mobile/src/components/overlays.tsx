import * as Linking from 'expo-linking';
import { StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut, ReduceMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useState } from 'react';
import { buildNumber, selfUpdate } from '@/lib/env';
import { checkForUpdate, downloadAndInstall } from '@/lib/update';
import { toast } from './toast';
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
  const { data, refetch, isFetching } = useSettings();
  const app = data?.app;
  if (!app) return null;
  const mustUpdate = buildNumber < (app.min_version ?? 1);
  if (!app.maintenance && !mustUpdate) return null;
  const url = app.play_store_url || app.apk_url;
  return <GateView app={app} mustUpdate={mustUpdate} url={url} refetch={refetch} isFetching={isFetching} />;
}

function GateView({ app, mustUpdate, url, refetch, isFetching }: {
  app: { maintenance?: boolean; maintenance_message?: string | null }; mustUpdate: boolean; url?: string | null; refetch: () => unknown; isFetching: boolean;
}) {
  const { c } = useTheme();
  const [pct, setPct] = useState<number | null>(null);
  // داخل التطبيق: ننزّل النسخة الجديدة ونفتح شاشة التثبيت بدل فتح المتصفح
  const update = async () => {
    if (!selfUpdate) { if (url) Linking.openURL(url); return; }
    try {
      setPct(0);
      const u = await checkForUpdate();
      if (!u) { if (url) Linking.openURL(url); return; }
      await downloadAndInstall(u, setPct);
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'تعذّر التحديث', 'danger');
    } finally {
      setPct(null);
    }
  };
  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 800, elevation: 800, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 14 }]}>
      <Mark size={72} />
      <T v="h1" center>{mustUpdate ? 'يوجد تحديث مطلوب' : 'المتجر في صيانة'}</T>
      <T tone="ink2" center>
        {mustUpdate
          ? 'نسختك من التطبيق قديمة. حدّثها لتكمل التسوق بأمان.'
          : app.maintenance_message || 'نجهّز لك تحسينات. نعود خلال وقت قصير.'}
      </T>
      {mustUpdate && (url || selfUpdate) ? (
        <Button title={pct !== null ? `يتنزّل… ${Math.round(pct * 100)}٪` : 'حدّث التطبيق'} icon="download" loading={pct !== null && pct < 1} onPress={update} style={{ alignSelf: 'stretch', maxWidth: 420 }} />
      ) : null}
      {/* انتهت الصيانة؟ لا نُلزم الزبون بإغلاق التطبيق وفتحه */}
      {!mustUpdate ? <Button title="أعد المحاولة" icon="refresh" variant="secondary" loading={isFetching} onPress={() => refetch()} style={{ alignSelf: 'stretch', maxWidth: 420 }} /> : null}
    </View>
  );
}
