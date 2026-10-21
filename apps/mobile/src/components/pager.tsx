import { useEffect, type ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

/**
 * عارض صفحات أفقي بالسحب (البانرات وصور المنتج).
 * لا نستعمل تمرير FlatList الأصلي: في RTL على أندرويد يُحسب موضعه من الطرف الآخر فكانت النقاط تنعكس
 * والبانر يختفي. هنا الموضع محسوب بأيدينا: التطبيق عربي دائماً، فالعنصر التالي على اليسار والسحب لليمين يتقدم.
 */
const DIR = -1; // RTL: العنصر k يقع يسار السابق

const SPRING = { damping: 22, stiffness: 190, mass: 0.8 };

function Page({ k, pos, step, width, height, children }: { k: number; pos: SharedValue<number>; step: number; width: number; height: number; children: ReactNode }) {
  const style = useAnimatedStyle(() => ({ transform: [{ translateX: DIR * (k - pos.value) * step }] }));
  return <Animated.View style={[{ position: 'absolute', top: 0, start: 0, width, height }, style]}>{children}</Animated.View>;
}

export function Pager<T>({
  data, width, height, gap = 0, index, onIndexChange, onDragChange, onPressItem, renderItem, keyOf, style, label,
}: {
  data: T[];
  width: number;
  height: number;
  gap?: number;
  index: number;
  onIndexChange: (i: number) => void;
  onDragChange?: (dragging: boolean) => void;
  /** اللمس يُعالَج هنا مع السحب (أيهما يبدأ أولاً يفوز)، فلا تضع أزراراً داخل الصفحات */
  onPressItem?: (i: number) => void;
  renderItem: (item: T, i: number) => ReactNode;
  keyOf: (item: T, i: number) => string;
  style?: StyleProp<ViewStyle>;
  label?: string;
}) {
  const reduced = useReducedMotion();
  const n = data.length;
  const step = width + gap;
  const pos = useSharedValue(index);
  const start = useSharedValue(index);

  // تغيّر الفهرس من الخارج (التقليب التلقائي أو النقاط)
  useEffect(() => {
    pos.value = reduced ? withTiming(index, { duration: 0 }) : withSpring(index, SPRING);
  }, [index, reduced, pos]);

  const settle = (i: number) => onIndexChange(i);
  const press = (i: number) => onPressItem?.(i);
  const dragging = (d: boolean) => onDragChange?.(d);

  const pan = Gesture.Pan()
    .enabled(n > 1)
    .activeOffsetX([-12, 12])
    .failOffsetY([-10, 10])
    .onBegin(() => { start.value = pos.value; scheduleOnRN(dragging, true); })
    .onUpdate((e) => {
      let p = start.value + (DIR * -e.translationX) / step;
      // مقاومة مطاطية عند الطرفين
      if (p < 0) p *= 0.3;
      else if (p > n - 1) p = n - 1 + (p - (n - 1)) * 0.3;
      pos.value = p;
    })
    .onEnd((e) => {
      // يكفي سحب خُمس العرض أو دفعة سريعة للانتقال للصفحة المجاورة
      const from = Math.round(start.value);
      const delta = pos.value - from;
      const fling = (DIR * -e.velocityX) / step; // صفحات/ثانية باتجاه الموضع
      let target = from;
      if (Math.abs(fling) > 0.8) target = from + (fling > 0 ? 1 : -1);
      else if (Math.abs(delta) > 0.2) target = from + (delta > 0 ? 1 : -1);
      target = Math.max(0, Math.min(n - 1, target));
      pos.value = reduced ? withTiming(target, { duration: 0 }) : withSpring(target, { ...SPRING, velocity: fling });
      scheduleOnRN(settle, target);
    })
    .onFinalize(() => { scheduleOnRN(dragging, false); });

  const tap = Gesture.Tap()
    .enabled(!!onPressItem)
    .maxDuration(400)
    .maxDistance(10)
    .onEnd((_e, ok) => { if (ok) scheduleOnRN(press, Math.max(0, Math.min(n - 1, Math.round(pos.value)))); });

  return (
    <GestureDetector gesture={Gesture.Race(pan, tap)}>
      <View
        style={[{ width, height }, style]}
        accessible={n > 1 || !!onPressItem}
        accessibilityRole={n > 1 ? 'adjustable' : onPressItem ? 'button' : undefined}
        accessibilityLabel={label}
        accessibilityValue={n > 1 ? { text: `${index + 1} من ${n}` } : undefined}
        accessibilityActions={[...(n > 1 ? [{ name: 'increment' }, { name: 'decrement' }] : []), ...(onPressItem ? [{ name: 'activate' }] : [])]}
        onAccessibilityAction={(e) => {
          if (e.nativeEvent.actionName === 'activate') onPressItem?.(index);
          if (e.nativeEvent.actionName === 'increment') onIndexChange(Math.min(n - 1, index + 1));
          if (e.nativeEvent.actionName === 'decrement') onIndexChange(Math.max(0, index - 1));
        }}>
        {data.map((item, k) => (
          <Page key={keyOf(item, k)} k={k} pos={pos} step={step} width={width} height={height}>
            {renderItem(item, k)}
          </Page>
        ))}
      </View>
    </GestureDetector>
  );
}

/** نقاط الصفحات: الأولى يميناً في RTL كترتيب الصفحات */
export function PagerDots({ n, index, active, idle }: { n: number; index: number; active: string; idle: string }) {
  if (n < 2) return null;
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6 }} importantForAccessibility="no-hide-descendants">
      {Array.from({ length: n }, (_, k) => (
        <View key={k} style={{ height: 6, width: k === index ? 18 : 6, borderRadius: 3, backgroundColor: k === index ? active : idle }} />
      ))}
    </View>
  );
}
