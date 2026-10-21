import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeIn, FadeOut, ReduceMotion, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { selfUpdate } from '@/lib/env';
import { useFmt } from '@/lib/format';
import { storage } from '@/lib/storage';
import { useTheme } from '@/lib/theme';
import { checkForUpdate, cleanupUpdates, downloadAndInstall, type AppUpdate } from '@/lib/update';
import { Mark } from './brand';
import { toast } from './toast';
import { Button, T } from './ui';

const LAST_CHECK = 'raqeem.update.lastCheck';
const SNOOZED = 'raqeem.update.snoozed'; // {build, until}
const EVERY = 6 * 60 * 60 * 1000; // فحص تلقائي كل ٦ ساعات كحد أقصى
const SNOOZE = 24 * 60 * 60 * 1000; // «لاحقاً» يؤجل يوماً

/** فحص يدوي من «حسابي ← تحديث التطبيق» */
const manual = new Set<() => void>();
export const updates = {
  enabled: selfUpdate,
  checkNow: () => manual.forEach((l) => l()),
};

/** بطاقة «تحديث جديد متاح» أسفل الشاشة: تنزيل بنسبة تقدم ثم شاشة التثبيت في أندرويد */
export function UpdatePrompt() {
  const { c } = useTheme();
  const f = useFmt();
  const insets = useSafeAreaInsets();
  const [u, setU] = useState<AppUpdate | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const busy = useRef(false);

  const run = useCallback(async (force: boolean) => {
    if (!selfUpdate || busy.current) return;
    const last = (await storage.get<number>(LAST_CHECK)) ?? 0;
    if (!force && Date.now() - last < EVERY) return;
    busy.current = true;
    try {
      await storage.set(LAST_CHECK, Date.now());
      const found = await checkForUpdate();
      if (!found) {
        if (force) toast.show('لديك آخر نسخة من التطبيق', 'success');
        return;
      }
      const snoozed = await storage.get<{ build: number; until: number }>(SNOOZED);
      if (!force && snoozed && snoozed.build === found.build && snoozed.until > Date.now()) return;
      setU(found);
    } catch {
      if (force) toast.show('تعذّر التحقق من التحديثات. تأكد من الإنترنت.', 'danger');
    } finally {
      busy.current = false;
    }
  }, []);

  useEffect(() => {
    if (!selfUpdate) return;
    cleanupUpdates();
    const t = setTimeout(() => run(false), 4000); // بعد استقرار الشاشة الأولى
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') run(false); });
    const onManual = () => run(true);
    manual.add(onManual);
    return () => { clearTimeout(t); sub.remove(); manual.delete(onManual); };
  }, [run]);

  if (!u) return null;
  const downloading = progress !== null && progress < 1;

  const later = async () => {
    await storage.set(SNOOZED, { build: u.build, until: Date.now() + SNOOZE });
    setU(null);
  };
  const install = async () => {
    setProgress(0);
    try {
      await downloadAndInstall(u, setProgress);
      toast.show('اضغط «تثبيت» أو «تحديث» في الشاشة التالية');
    } catch (e) {
      toast.show(e instanceof Error ? e.message : 'تعذّر التحديث', 'danger');
    } finally {
      setProgress(null);
    }
  };

  return (
    <View style={[StyleSheet.absoluteFill, { zIndex: 700, elevation: 700, justifyContent: 'flex-end' }]} pointerEvents="box-none">
      <Animated.View entering={FadeIn.duration(160).reduceMotion(ReduceMotion.System)} exiting={FadeOut.duration(140)} style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(0,0,0,0.35)' }]}>
        <Pressable style={{ flex: 1 }} onPress={downloading ? undefined : later} accessibilityLabel="لاحقاً" />
      </Animated.View>
      <Animated.View
        entering={SlideInDown.springify().damping(20).reduceMotion(ReduceMotion.System)}
        exiting={SlideOutDown.duration(180)}
        accessibilityViewIsModal
        style={{ margin: 12, marginBottom: Math.max(insets.bottom, 12), backgroundColor: c.card, borderRadius: 26, borderWidth: 1, borderColor: c.line, padding: 18, gap: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ width: 52, height: 52, borderRadius: 16, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
            <Mark size={32} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <T v="h3">تحديث جديد متاح</T>
            <T size={13} tone="ink2">
              النسخة {f.text(u.version)}{u.sizeMb ? ` · ${f.num(u.sizeMb)} ميغا` : ''} · يُثبَّت فوق نسختك دون حذف بياناتك
            </T>
          </View>
        </View>
        {downloading ? (
          <View style={{ gap: 8 }} accessibilityLiveRegion="polite">
            <View style={{ height: 8, borderRadius: 4, backgroundColor: c.sunken, overflow: 'hidden' }}>
              <View style={{ height: '100%', width: `${Math.round((progress ?? 0) * 100)}%`, backgroundColor: c.accent, borderRadius: 4 }} />
            </View>
            <T size={13} tone="ink2" center>يتنزّل… {f.num(Math.round((progress ?? 0) * 100))}٪</T>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Button title="حدّث الآن" icon="download" onPress={install} style={{ flex: 1 }} />
            <Button title="لاحقاً" variant="secondary" onPress={later} />
          </View>
        )}
      </Animated.View>
    </View>
  );
}
