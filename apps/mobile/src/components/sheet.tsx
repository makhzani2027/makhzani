import { radius } from '@raqeem/shared';
import { useEffect, type ReactNode } from 'react';
import { BackHandler, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut, ReduceMotion, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/lib/theme';
import { ease, KeyboardView } from './motion';
import { Portal } from './portal';
import { IconButton, Row, T } from './ui';

/** لوحة سفلية تُرسم في طبقة التطبيق (لا Modal) فتلتصق بحافة الشاشة بلا فجوة */
export function Sheet({ visible, onClose, title, children, footer, maxHeight = 0.86 }: {
  visible: boolean; onClose: () => void; title?: string; children: ReactNode; footer?: ReactNode; maxHeight?: number;
}) {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  useEffect(() => {
    if (!visible || Platform.OS === 'web') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { onClose(); return true; });
    return () => sub.remove();
  }, [visible, onClose]);
  if (!visible) return null;
  return (
    <Portal>
      <KeyboardView bottomInset={0}>
        <Animated.View entering={FadeIn.duration(160).reduceMotion(ReduceMotion.System)} exiting={FadeOut.duration(140)} style={[StyleSheet.absoluteFill, { backgroundColor: c.overlay }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="إغلاق" />
        </Animated.View>
        <View style={{ flex: 1, justifyContent: 'flex-end' }} pointerEvents="box-none">
          <Animated.View
            entering={SlideInDown.duration(220).easing(ease).reduceMotion(ReduceMotion.System)}
            exiting={SlideOutDown.duration(180)}
            accessibilityViewIsModal
            style={{
              backgroundColor: c.card, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl,
              paddingTop: 10, paddingBottom: Math.max(insets.bottom, 12) + 8, width: '100%', maxWidth: 680, alignSelf: 'center',
              maxHeight: `${Math.round(maxHeight * 100)}%`,
            }}>
            <View style={{ alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: c.lineStrong, marginBottom: 6 }} />
            {title ? (
              <Row style={{ justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 6 }}>
                <T v="h2" size={21}>{title}</T>
                <IconButton name="close" label="إغلاق" onPress={onClose} size={38} plain />
              </Row>
            ) : null}
            <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 8, gap: 12 }} keyboardShouldPersistTaps="handled" bounces={false}>
              {children}
            </ScrollView>
            {footer ? <View style={{ paddingHorizontal: 20, paddingTop: 10, gap: 10 }}>{footer}</View> : null}
          </Animated.View>
        </View>
      </KeyboardView>
    </Portal>
  );
}
