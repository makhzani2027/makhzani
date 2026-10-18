import { tones } from '@raqeem/shared';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { Platform, type LayoutChangeEvent } from 'react-native';
import Animated, { FadeInDown, FadeOutDown, ReduceMotion, useAnimatedKeyboard, useAnimatedStyle } from 'react-native-reanimated';
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

// ---------------------------------------------------------------- ما يشغل أسفل الشاشة الظاهرة
// شريط الإجراءات (Footer) وشريط التبويبات يسجلان ارتفاعهما ما دامت شاشتهما ظاهرة،
// فتظهر الرسالة فوقهما دائماً بدل أن تغطي زر «تأكيد الطلب» أو «أضف للسلة».
const anchors = new Map<number, { kind: 'tabbar' | 'footer'; h: number }>();
let anchorSeq = 0;
let anchorTotal = 0;
const anchorListeners = new Set<() => void>();
function recompute() {
  let tab = 0;
  let foot = 0;
  for (const a of anchors.values()) {
    if (a.kind === 'tabbar') tab = Math.max(tab, a.h);
    else foot = Math.max(foot, a.h);
  }
  anchorTotal = tab + foot;
  anchorListeners.forEach((l) => l());
}
export const toastAnchor = {
  /** يسجل ارتفاعاً ويعيد دالة إلغائه (تُستدعى عند مغادرة الشاشة) */
  add(kind: 'tabbar' | 'footer', h: number): () => void {
    const id = ++anchorSeq;
    anchors.set(id, { kind, h });
    recompute();
    return () => { anchors.delete(id); recompute(); };
  },
};

/** onLayout لشريط سفلي: يسجل ارتفاعه ما دامت الشاشة التي هو فيها ظاهرة */
export function useToastAnchor(kind: 'tabbar' | 'footer') {
  const [h, setH] = useState(0);
  useFocusEffect(useCallback(() => (h > 0 ? toastAnchor.add(kind, h) : undefined), [kind, h]));
  return useCallback((e: LayoutChangeEvent) => {
    const next = Math.round(e.nativeEvent.layout.height);
    setH((prev) => (Math.abs(prev - next) > 1 ? next : prev));
  }, []);
}

/** ترفع الرسالة فوق لوحة المفاتيح (على الهاتف؛ المتصفح يتكفل بها) */
const useKeyboardLift = Platform.OS === 'web'
  ? () => undefined
  : () => {
    const kb = useAnimatedKeyboard();
    return useAnimatedStyle(() => ({ transform: [{ translateY: -kb.height.value }] }));
  };

/** يُرسم مرة واحدة في الجذر، فوق أي شريط سفلي مسجَّل */
export function ToastHost() {
  const t = useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; }, () => current, () => null);
  const occupied = useSyncExternalStore((cb) => { anchorListeners.add(cb); return () => { anchorListeners.delete(cb); }; }, () => anchorTotal, () => 0);
  const { c, dark } = useTheme();
  const insets = useSafeAreaInsets();
  const bottomOffset = occupied ? occupied + 12 : insets.bottom + 24;
  const lift = useKeyboardLift();
  useEffect(() => {
    if (!t) return;
    const timer = setTimeout(() => { if (current?.id === t.id) { current = null; emit(); } }, 2600);
    return () => clearTimeout(timer);
  }, [t]);
  if (!t) return null;
  // الخلفية بلون الحبر (معكوسة)، فألوان الحالة من الوضع المعاكس لتبقى مقروءة
  const color = t.tone === 'neutral' ? c.bg : (dark ? tones.light : tones.dark)[t.tone].ink;
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', start: 16, end: 16, bottom: bottomOffset, alignItems: 'center', zIndex: 900 }, lift]}>
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
    </Animated.View>
  );
}
