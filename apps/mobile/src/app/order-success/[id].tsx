import { whatsappLink } from '@raqeem/shared';
import { useQuery } from '@tanstack/react-query';
import * as Linking from 'expo-linking';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';
import { View } from 'react-native';
import Animated, { useAnimatedProps, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withTiming } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import { easeEmph, tap } from '@/components/motion';
import { Button, Card, KeyValue, Screen, T } from '@/components/ui';
import { api } from '@/lib/api';
import { useFmt } from '@/lib/format';
import { qk, useSettings } from '@/lib/query';
import { useTheme } from '@/lib/theme';

const APath = Animated.createAnimatedComponent(Path);

/** علامة صح تُرسم داخل دائرة آجُرية */
function SuccessMark() {
  const { c } = useTheme();
  const reduced = useReducedMotion();
  const s = useSharedValue(reduced ? 1 : 0);
  const d = useSharedValue(reduced ? 1 : 0);
  useEffect(() => {
    tap('success');
    if (reduced) return;
    s.value = withTiming(1, { duration: 260, easing: easeEmph });
    d.value = withDelay(180, withTiming(1, { duration: 360 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const circle = useAnimatedStyle(() => ({ transform: [{ scale: 0.6 + 0.4 * s.value }], opacity: s.value }));
  const check = useAnimatedProps(() => ({ strokeDashoffset: 60 * (1 - d.value) }));
  return (
    <Animated.View style={[{ width: 112, height: 112, borderRadius: 56, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' }, circle]}>
      <Svg width={64} height={64} viewBox="0 0 24 24">
        <APath d="M5 12.5l4.5 4.5L19 7.5" stroke={c.accentInk} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" fill="none" strokeDasharray={60} animatedProps={check} />
      </Svg>
    </Animated.View>
  );
}

export default function OrderSuccess() {
  const f = useFmt();
  const { id, number } = useLocalSearchParams<{ id: string; number?: string }>();
  const store = useSettings().data?.store;
  const o = useQuery({ queryKey: qk.order(id), queryFn: () => api.order(id) });
  const order = o.data?.order;
  const num = order?.number ?? number ?? '';
  const wa = whatsappLink(store?.whatsapp ?? store?.phone, `مرحباً، أرسلت الطلب ${num} من تطبيق رقيم.`);
  const next = !order ? '' : order.payment_method === 'office'
    ? 'ادفع في المكتب لنبدأ تجهيز طلبك. أرسل رقم الطلب لنا على واتساب لنسرّع الأمر.'
    : order.fulfillment === 'pickup' ? 'سنؤكد طلبك قريباً ونبلغك حين يجهز للاستلام.'
      : 'سنتصل بك لتأكيد الطلب، ثم يصلك إشعار عند كل خطوة حتى باب بيتك.';

  return (
    <Screen
      footer={
        <View style={{ gap: 10 }}>
          <Button title="تابع طلبك" icon="truck" onPress={() => router.replace(`/orders/${id}`)} />
          <Button title="العودة للمتجر" variant="secondary" onPress={() => router.replace('/')} />
        </View>
      }
      style={{ paddingTop: 48 }} gap={18}>
      <SuccessMark />
      <T v="h1" center>وصلنا طلبك</T>
      <T tone="ink2" center>رقم طلبك <T weight="bold" tone="ink">{f.doc(num)}</T></T>
      {order ? (
        <Card style={{ gap: 8 }}>
          <KeyValue label="الإجمالي" value={f.money(order.total)} strong />
          <T v="small" tone="ink2">{next}</T>
        </Card>
      ) : null}
      {wa && order?.payment_method === 'office' ? <Button title="أرسل رقم الطلب على واتساب" icon="whatsapp" variant="ink" onPress={() => Linking.openURL(wa)} /> : null}
    </Screen>
  );
}
