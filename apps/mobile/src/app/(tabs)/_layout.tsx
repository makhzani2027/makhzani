import { Tabs } from 'expo-router';
import type { BottomTabBarProps } from 'expo-router/tabs';
import { View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCartTarget, useFly } from '@/components/fly';
import { PressScale, usePop } from '@/components/motion';
import { useToastAnchor } from '@/components/toast';
import { CountBadge, Icon, T, contentColumn, type IconName } from '@/components/ui';
import { useCart } from '@/lib/cart';
import { useTheme } from '@/lib/theme';

const TABS: { name: string; label: string; icon: IconName }[] = [
  { name: 'index', label: 'الرئيسية', icon: 'home' },
  { name: 'categories', label: 'الأقسام', icon: 'grid' },
  { name: 'cart', label: 'السلة', icon: 'bag' },
  { name: 'favorites', label: 'المفضلة', icon: 'heart' },
  { name: 'account', label: 'حسابي', icon: 'user' },
];


function CartIcon({ color, active }: { color: string; active: boolean }) {
  const { count } = useCart();
  const { landed } = useFly();
  const ref = useCartTarget('always');
  const pop = usePop(`${count}-${landed}`);
  return (
    <Animated.View ref={ref} collapsable={false} style={pop}>
      <Icon name="bag" size={24} color={color} strokeWidth={active ? 2.1 : 1.75} />
      {count > 0 ? <CountBadge n={count} style={{ position: 'absolute', top: -6, end: -10 }} /> : null}
    </Animated.View>
  );
}

/** شريط التبويبات: خلفية البطاقة، ومؤشر آجُري رفيع فوق التبويب النشط */
function TabBar({ state, navigateToTab }: BottomTabBarProps) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const onLayout = useToastAnchor('tabbar');
  return (
    <View onLayout={onLayout} style={{ backgroundColor: c.card, borderTopWidth: 1, borderTopColor: c.line, paddingBottom: Math.max(insets.bottom, 8) }}>
      <View style={[contentColumn, { flexDirection: 'row' }]} accessibilityRole="tablist">
        {state.routes.map((r, i) => {
          const tab = TABS.find((t) => t.name === r.name);
          if (!tab) return null;
          const active = state.index === i;
          const color = active ? c.accent : c.ink3;
          return (
            <PressScale
              key={r.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={tab.label}
              haptic={active ? undefined : 'select'}
              scaleTo={0.92}
              onPress={() => { if (!active) navigateToTab(r.key); }}
              style={{ flex: 1, alignItems: 'center', paddingTop: 10, gap: 2 }}>
              <View style={{ position: 'absolute', top: 0, height: 3, width: 28, borderBottomLeftRadius: 3, borderBottomRightRadius: 3, backgroundColor: active ? c.accent : 'transparent' }} />
              {tab.name === 'cart' ? <CartIcon color={color} active={active} /> : <Icon name={tab.icon} size={24} color={color} strokeWidth={active ? 2.1 : 1.75} fill={active && tab.icon === 'heart' ? c.accent : undefined} />}
              <T size={11.5} weight={active ? 'bold' : 'medium'} color={color} style={{ paddingBottom: 0 }}>{tab.label}</T>
            </PressScale>
          );
        })}
      </View>
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false, animation: 'fade' }} tabBar={(p) => <TabBar {...p} />}>
      {TABS.map((t) => <Tabs.Screen key={t.name} name={t.name} options={{ title: t.label }} />)}
    </Tabs>
  );
}
