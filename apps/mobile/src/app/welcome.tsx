import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { FlatList, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Logo, WedgePattern } from '@/components/brand';
import { Button, Icon, T, type IconName } from '@/components/ui';
import { WELCOMED_KEY } from '@/lib/hooks';
import { storage } from '@/lib/storage';
import { useTheme } from '@/lib/theme';

const SLIDES: { icon: IconName; title: string; body: string }[] = [
  { icon: 'store', title: 'تصفّح براحتك', body: 'كل منتجات المتجر بأسعارها الحقيقية وتوفرها الفعلي، من بيتك.' },
  { icon: 'bag', title: 'اطلب بخطوة واحدة', body: 'توصيل لكل المحافظات أو استلام من المكتب، وادفع عند الاستلام.' },
  { icon: 'truck', title: 'تابع طلبك لحظة بلحظة', body: 'من التأكيد إلى باب بيتك، ويصلك إشعار عند كل خطوة.' },
];

export default function Welcome() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [i, setI] = useState(0);
  const list = useRef<FlatList>(null);
  const last = i === SLIDES.length - 1;

  const finish = async (to: '/' | '/login') => {
    await storage.set(WELCOMED_KEY, true);
    router.replace('/');
    if (to === '/login') setTimeout(() => router.push('/login'), 50);
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top + 12, paddingBottom: insets.bottom + 16 }}>
      <View style={{ paddingHorizontal: 24, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Logo size={24} />
        {!last ? <Button small variant="ghost" title="تخطَّ" onPress={() => finish('/')} /> : null}
      </View>
      <FlatList
        ref={list}
        horizontal
        pagingEnabled
        data={SLIDES}
        keyExtractor={(s) => s.title}
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={(e) => setI(Math.round(Math.abs(e.nativeEvent.contentOffset.x) / width))}
        renderItem={({ item }) => (
          <View style={{ width, paddingHorizontal: 28, justifyContent: 'center', gap: 18 }}>
            <View style={{ alignSelf: 'center', width: 200, height: 200, borderRadius: 100, backgroundColor: c.hero, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
              <WedgePattern color={c.heroInk} opacity={0.08} />
              <Icon name={item.icon} size={84} color={c.heroInk} strokeWidth={1.4} />
            </View>
            <T v="h1" center>{item.title}</T>
            <T tone="ink2" center style={{ maxWidth: 420, alignSelf: 'center' }}>{item.body}</T>
          </View>
        )}
      />
      <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6, marginBottom: 20 }}>
        {SLIDES.map((s, k) => <View key={s.title} style={{ height: 6, width: k === i ? 22 : 6, borderRadius: 3, backgroundColor: k === i ? c.accent : c.lineStrong }} />)}
      </View>
      <View style={{ paddingHorizontal: 24, gap: 10, width: '100%', maxWidth: 520, alignSelf: 'center' }}>
        {last ? (
          <>
            <Button title="ابدأ التسوق" icon="next" onPress={() => finish('/')} />
            <Button title="لدي حساب — تسجيل الدخول" variant="secondary" onPress={() => finish('/login')} />
          </>
        ) : (
          <Button title="التالي" icon="next" onPress={() => { const n = i + 1; list.current?.scrollToOffset({ offset: n * width, animated: true }); setI(n); }} />
        )}
      </View>
    </View>
  );
}
