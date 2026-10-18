import { motion } from '@raqeem/shared';
import * as Haptics from 'expo-haptics';
import { useEffect, type ReactNode } from 'react';
import { Platform, Pressable, View, type DimensionValue, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing, FadeIn, ReduceMotion, useAnimatedKeyboard, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withSequence, withTiming,
} from 'react-native-reanimated';
import { useTheme } from '@/lib/theme';

/** منحنيات الهوية (theme.ts): خروج سريع ونهاية ناعمة، بلا نوابض متأرجحة */
export const ease = Easing.bezier(...motion.easing);
export const easeEmph = Easing.bezier(...motion.emphasized);

/** نبضة لمس خفيفة (الهاتف فقط) */
export function tap(kind: 'light' | 'medium' | 'select' | 'success' | 'warning' = 'light') {
  if (Platform.OS === 'web') return;
  if (kind === 'select') Haptics.selectionAsync().catch(() => {});
  else if (kind === 'success') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  else if (kind === 'warning') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
  else Haptics.impactAsync(kind === 'medium' ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** زر ينكمش إلى ٠٫٩٧ عند اللمس ويعود بنعومة */
export function PressScale({
  children, style, scaleTo = 0.97, haptic, onPress, onPressIn, onPressOut, ...rest
}: Omit<PressableProps, 'style' | 'children'> & { style?: StyleProp<ViewStyle>; scaleTo?: number; haptic?: boolean | 'select' | 'medium'; children?: ReactNode }) {
  const s = useSharedValue(1);
  const anim = useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
  return (
    <AnimatedPressable
      {...rest}
      onPressIn={(e) => { s.value = withTiming(scaleTo, { duration: motion.instant, easing: ease }); onPressIn?.(e); }}
      onPressOut={(e) => { s.value = withTiming(1, { duration: motion.fast, easing: ease }); onPressOut?.(e); }}
      onPress={onPress ? (e) => { if (haptic) tap(haptic === true ? 'light' : haptic); onPress(e); } : undefined}
      style={[style, anim]}>
      {children}
    </AnimatedPressable>
  );
}

/** ظهور سريع للمحتوى عند وصوله بعد التحميل */
export const appear = FadeIn.duration(motion.fast).reduceMotion(ReduceMotion.System);

/** نبضة تكبير مرة واحدة عند تغيّر قيمة (عدّاد السلة) */
export function usePop(dep: unknown) {
  const s = useSharedValue(1);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (reduced) return;
    s.value = withSequence(withTiming(1.28, { duration: 120, easing: ease }), withTiming(1, { duration: 180, easing: ease }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dep]);
  return useAnimatedStyle(() => ({ transform: [{ scale: s.value }] }));
}

/** نبض الهيكل (يتوقف مع «تقليل الحركة») */
function usePulse() {
  const o = useSharedValue(1);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (reduced) return;
    o.value = withRepeat(withSequence(withTiming(0.5, { duration: 700 }), withTiming(1, { duration: 700 })), -1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced]);
  return useAnimatedStyle(() => ({ opacity: o.value }));
}

/** كتلة هيكل تحميل بلون الغائر */
export function Bone({ w = '100%', h = 14, r = 8, style }: { w?: DimensionValue; h?: number; r?: number; style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  return <View style={[{ width: w, height: h, borderRadius: r, backgroundColor: c.sunken }, style]} />;
}

/** يغلّف عدة كتل بنبض واحد */
export function Skeleton({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const pulse = usePulse();
  return <Animated.View accessibilityLabel="جارٍ التحميل" style={[style, pulse]}>{children}</Animated.View>;
}

/** حاوية تصعد مع لوحة المفاتيح (أندرويد بملء الشاشة لا يرفع المحتوى وحده) */
type KeyboardViewProps = { children: ReactNode; style?: StyleProp<ViewStyle>; bottomInset?: number };
function NativeKeyboardView({ children, style, bottomInset = 0 }: KeyboardViewProps) {
  const kb = useAnimatedKeyboard();
  const pad = useAnimatedStyle(() => ({ paddingBottom: Math.max(0, kb.height.value - bottomInset) }));
  return <Animated.View style={[{ flex: 1 }, style, pad]}>{children}</Animated.View>;
}
function WebKeyboardView({ children, style }: KeyboardViewProps) {
  // المتصفح يتكفل بلوحة المفاتيح، و useAnimatedKeyboard غير مدعوم على الويب
  return <View style={[{ flex: 1 }, style]}>{children}</View>;
}
export const KeyboardView = Platform.OS === 'web' ? WebKeyboardView : NativeKeyboardView;
