import { Tabs } from 'expo-router';
import type { BottomTabBarProps } from 'expo-router/tabs';
import { useEffect, useRef, useState } from 'react';
import { Platform, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
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

const SPRING = { damping: 18, stiffness: 220, mass: 0.7 };

/** أيقونة تبويب ترتفع وتكبر قليلاً حين تنشط */
function TabIcon({ tab, active, color }: { tab: (typeof TABS)[number]; active: boolean; color: string }) {
  const { c } = useTheme();
  const reduced = useReducedMotion();
  const lift = useSharedValue(active ? 1 : 0);
  useEffect(() => { lift.value = reduced ? (active ? 1 : 0) : withSpring(active ? 1 : 0, SPRING); }, [active, reduced, lift]);
  const style = useAnimatedStyle(() => ({ transform: [{ translateY: -2 * lift.value }, { scale: 1 + 0.08 * lift.value }] }));
  return (
    <Animated.View style={style}>
      {tab.name === 'cart'
        ? <CartIcon color={color} active={active} />
        : <Icon name={tab.icon} size={24} color={color} strokeWidth={active ? 2.1 : 1.75} fill={active && tab.icon === 'heart' ? c.accent : undefined} />}
    </Animated.View>
  );
}

/**
 * شريط التبويبات: «رصيف» عائم بزوايا دائرية، وكبسولة آجُرية فاتحة تنزلق بنابض إلى التبويب النشط،
 * في أعلاها نقطة آجُر صغيرة (ثقب بطاقة السعر في شعار رقيم).
 */
function TabBar({ state, navigateToTab }: BottomTabBarProps) {
  const { c, dark } = useTheme();
  const insets = useSafeAreaInsets();
  const onLayout = useToastAnchor('tabbar');
  const reduced = useReducedMotion();
  const tabs = state.routes.filter((r) => TABS.some((t) => t.name === r.name));
  // مواضع التبويبات كما رُسمت فعلاً (فيزيائية)، فتنزلق الكبسولة صحيحة في RTL وLTR وعلى الويب
  const [tabX, setTabX] = useState<Record<string, number>>({});
  const [tabW, setTabW] = useState(0);
  const [pillX0, setPillX0] = useState<number | null>(null);
  const activeKey = state.routes[state.index]?.key;
  const target = activeKey != null ? tabX[activeKey] : undefined;
  const x = useSharedValue(0);
  const placed = useRef(false);
  useEffect(() => {
    if (target == null || pillX0 == null) return;
    const to = target - pillX0;
    x.value = reduced || !placed.current ? withTiming(to, { duration: 0 }) : withSpring(to, SPRING);
    placed.current = true;
  }, [target, pillX0, reduced, x]);
  const pill = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  return (
    <View onLayout={onLayout} style={{ backgroundColor: c.bg, paddingHorizontal: 12, paddingTop: 6, paddingBottom: Math.max(insets.bottom, 10) }}>
      <View
        style={[contentColumn, {
          backgroundColor: c.card, borderRadius: 26, borderWidth: 1, borderColor: c.line, padding: 5,
          ...Platform.select({
            ios: { shadowColor: '#000', shadowOpacity: dark ? 0.4 : 0.1, shadowRadius: 18, shadowOffset: { width: 0, height: 8 } },
            android: { elevation: 8 },
            default: { boxShadow: `0 10px 28px -12px rgba(0,0,0,${dark ? 0.6 : 0.22})` },
          }),
        }]}>
        <View style={{ flexDirection: 'row' }} accessibilityRole="tablist">
          {tabW > 0 ? (
            <Animated.View
              pointerEvents="none"
              onLayout={(e) => setPillX0(e.nativeEvent.layout.x)}
              style={[{ position: 'absolute', top: 0, bottom: 0, start: 0, width: tabW, opacity: target == null || pillX0 == null ? 0 : 1 }, pill]}>
              <View style={{ flex: 1, marginHorizontal: 4, borderRadius: 21, backgroundColor: c.accentSoft, alignItems: 'center' }}>
                <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: c.accent, marginTop: 3 }} />
              </View>
            </Animated.View>
          ) : null}
          {tabs.map((r) => {
            const tab = TABS.find((t) => t.name === r.name)!;
            const active = state.routes[state.index]?.key === r.key;
            const color = active ? c.accent : c.ink3;
            return (
              <PressScale
                key={r.key}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                accessibilityLabel={tab.label}
                haptic={active ? undefined : 'select'}
                scaleTo={0.9}
                onPress={() => { if (!active) navigateToTab(r.key); }}
                onLayout={(e) => {
                  const { x: lx, width } = e.nativeEvent.layout;
                  setTabW(width);
                  setTabX((m) => (m[r.key] === lx ? m : { ...m, [r.key]: lx }));
                }}
                style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 15, paddingBottom: 7, gap: 3 }}>
                <TabIcon tab={tab} active={active} color={color} />
                <T size={11} weight={active ? 'bold' : 'medium'} color={active ? c.accentSoftInk : c.ink3} style={{ paddingBottom: 0 }}>{tab.label}</T>
              </PressScale>
            );
          })}
        </View>
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
