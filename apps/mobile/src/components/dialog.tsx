import { radius } from '@raqeem/shared';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { BackHandler, Platform, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut, ReduceMotion, ZoomIn } from 'react-native-reanimated';
import { useTheme } from '@/lib/theme';
import { ease, KeyboardView } from './motion';
import { Portal } from './portal';
import { Button, Input, T } from './ui';

/**
 * نوافذ التأكيد بهوية رقيم بدل نافذة النظام الرمادية. نفس فكرة Alert.alert:
 *   dialog.confirm({ title, message, confirm: 'إلغاء الطلب', danger: true }) ← Promise<boolean>
 *   dialog.prompt({ … requireText: 'احذف' }) ← النص أو null
 */
interface DialogReq {
  id: number;
  title: string;
  message?: string;
  confirm: string;
  cancel?: string | null;
  danger?: boolean;
  input?: { placeholder?: string; requireText?: string; multiline?: boolean };
  resolve: (v: string | null) => void;
}

let current: DialogReq | null = null;
let seq = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function open(r: Omit<DialogReq, 'id' | 'resolve'>): Promise<string | null> {
  return new Promise((resolve) => {
    current?.resolve(null);
    current = { ...r, id: ++seq, resolve };
    emit();
  });
}
function close(value: string | null) {
  const r = current;
  current = null;
  emit();
  r?.resolve(value);
}

export const dialog = {
  async confirm(o: { title: string; message?: string; confirm?: string; cancel?: string; danger?: boolean }): Promise<boolean> {
    return (await open({ title: o.title, message: o.message, confirm: o.confirm ?? 'نعم', cancel: o.cancel ?? 'تراجع', danger: o.danger })) !== null;
  },
  async alert(title: string, message?: string): Promise<void> {
    await open({ title, message, confirm: 'حسناً', cancel: null });
  },
  prompt(o: { title: string; message?: string; confirm: string; danger?: boolean; placeholder?: string; requireText?: string; multiline?: boolean }) {
    return open({ title: o.title, message: o.message, confirm: o.confirm, cancel: 'تراجع', danger: o.danger, input: { placeholder: o.placeholder, requireText: o.requireText, multiline: o.multiline } });
  },
};

export function DialogHost() {
  const d = useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; }, () => current, () => null);
  const { c } = useTheme();
  const [text, setText] = useState('');
  useEffect(() => { setText(''); }, [d?.id]);
  useEffect(() => {
    if (!d || Platform.OS === 'web') return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { close(null); return true; });
    return () => sub.remove();
  }, [d]);
  if (!d) return null;
  const needs = d.input?.requireText;
  const ok = !needs || text.trim() === needs;
  return (
    <Portal>
      <KeyboardView>
        <Animated.View entering={FadeIn.duration(140)} exiting={FadeOut.duration(120)} style={[StyleSheet.absoluteFill, { backgroundColor: c.overlay }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => d.cancel !== null && close(null)} accessibilityLabel="إغلاق" />
        </Animated.View>
        <View pointerEvents="box-none" style={{ flex: 1, justifyContent: 'center', padding: 24 }}>
          <Animated.View
            key={d.id}
            entering={ZoomIn.duration(180).easing(ease).reduceMotion(ReduceMotion.System)}
            accessibilityViewIsModal
            accessibilityRole="alert"
            style={{ backgroundColor: c.card, borderRadius: radius.xl, padding: 22, gap: 12, width: '100%', maxWidth: 420, alignSelf: 'center' }}>
            <T v="h2" size={21}>{d.title}</T>
            {d.message ? <T tone="ink2">{d.message}</T> : null}
            {d.input ? (
              <Input value={text} onChangeText={setText} placeholder={d.input.placeholder} multiline={d.input.multiline} autoFocus
                style={d.input.multiline ? { minHeight: 90 } : undefined} />
            ) : null}
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 6 }}>
              {d.cancel !== null ? <Button title={d.cancel ?? 'تراجع'} variant="secondary" onPress={() => close(null)} flex /> : null}
              <Button title={d.confirm} variant={d.danger ? 'danger' : 'primary'} disabled={!ok} onPress={() => close(d.input ? text.trim() : '')} flex />
            </View>
          </Animated.View>
        </View>
      </KeyboardView>
    </Portal>
  );
}
