import { tones } from '@raqeem/shared';
import { useEffect, useSyncExternalStore } from 'react';
import { View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown, ReduceMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/lib/theme';
import { Icon, type IconName } from './icon';
import { T } from './text';

/** رسالة قصيرة عائمة أسفل الشاشة: «تمت إضافة المنتج إلى السلة» */
type ToastTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';
interface ToastState { id: number; message: string; tone: ToastTone }

let current: ToastState | null = null;
let seq = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const toast = {
  show(message: string, tone: ToastTone = 'neutral') {
    current = { id: ++seq, message, tone };
    emit();
  },
};

const ICON: Record<ToastTone, IconName> = { success: 'checkCircle', warning: 'alert', danger: 'xCircle', info: 'info', neutral: 'info' };

/** يُرسم مرة واحدة في الجذر؛ bottomOffset يرفعه فوق شريط التبويبات */
export function ToastHost({ bottomOffset = 84 }: { bottomOffset?: number }) {
  const t = useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; }, () => current, () => null);
  const { c, dark } = useTheme();
  const insets = useSafeAreaInsets();
  useEffect(() => {
    if (!t) return;
    const timer = setTimeout(() => { if (current?.id === t.id) { current = null; emit(); } }, 2600);
    return () => clearTimeout(timer);
  }, [t]);
  if (!t) return null;
  // الخلفية بلون الحبر (معكوسة)، فألوان الحالة من الوضع المعاكس لتبقى مقروءة
  const color = t.tone === 'neutral' ? c.bg : (dark ? tones.light : tones.dark)[t.tone].ink;
  return (
    <View pointerEvents="none" style={{ position: 'absolute', start: 16, end: 16, bottom: insets.bottom + bottomOffset, alignItems: 'center', zIndex: 900 }}>
      <Animated.View
        key={t.id}
        accessibilityLiveRegion="polite"
        entering={FadeInDown.duration(180).reduceMotion(ReduceMotion.System)}
        exiting={FadeOutDown.duration(140).reduceMotion(ReduceMotion.System)}
        style={{
          flexDirection: 'row', alignItems: 'center', gap: 10, maxWidth: 520, paddingHorizontal: 16, paddingVertical: 10,
          borderRadius: 16, backgroundColor: c.ink,
          shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 16, shadowOffset: { width: 0, height: 6 }, elevation: 6,
        }}>
        <Icon name={ICON[t.tone]} size={20} color={color} />
        <T v="small" weight="bold" color={c.bg} style={{ flexShrink: 1 }}>{t.message}</T>
      </Animated.View>
    </View>
  );
}
