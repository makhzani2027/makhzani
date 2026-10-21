import { icons, type Category, type IconName } from '@raqeem/shared';
import { router } from 'expo-router';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { RefreshControl, ScrollView, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn, ReduceMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ProductImage, WedgePattern } from '@/components/brand';
import { Icon } from '@/components/icon';
import { Bone, PressScale, Skeleton } from '@/components/motion';
import { Empty, ErrorState, IconButton, PageTitle, T, contentColumn } from '@/components/ui';
import { friendlyError } from '@/lib/errors';
import { useFmt } from '@/lib/format';
import { useCategories } from '@/lib/query';
import { useTheme } from '@/lib/theme';

const RAIL = 92;
const PAD = 14;
const COLS = 3;
const GAP = 10;

const iconOf = (c: Category, fallback: IconName = 'tag'): IconName => (c.icon && c.icon in icons ? (c.icon as IconName) : fallback);

/**
 * الأقسام: شريط جانبي بأيقونة واسم لكل قسم رئيسي (النشط كبسولة آجُرية فاتحة)،
 * وبجانبه لوحة القسم: بطاقة «تصفح الكل» ثم شبكة الأقسام الفرعية بثلاثة أعمدة.
 */
export default function Categories() {
  const { c } = useTheme();
  const f = useFmt();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const q = useCategories();
  const all = q.data ?? [];
  const roots = all.filter((x) => !x.parent_id).sort((a, b) => a.sort - b.sort);
  const [sel, setSel] = useState<string | null>(null);
  useEffect(() => { if (!sel && roots[0]) setSel(roots[0].id); }, [roots, sel]);
  const current = roots.find((r) => r.id === sel) ?? roots[0];
  const subs = all.filter((x) => x.parent_id === current?.id).sort((a, b) => a.sort - b.sort);
  const panelW = Math.min(width, 720) - RAIL;
  const tileW = Math.floor((panelW - PAD * 2 - GAP * (COLS - 1)) / COLS);
  const content = useRef<ComponentRef<typeof ScrollView>>(null);
  const pick = (id: string) => { setSel(id); content.current?.scrollTo({ y: 0, animated: false }); };

  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
      <PageTitle title="الأقسام" right={<IconButton name="search" label="بحث" onPress={() => router.push('/search')} />} />
      {q.isLoading ? (
        <Skeleton style={[contentColumn, { flexDirection: 'row', gap: 12, paddingHorizontal: 12, paddingTop: 8 }]}>
          <View style={{ width: RAIL - 16, gap: 10 }}>{[0, 1, 2, 3, 4, 5].map((i) => <Bone key={i} h={72} r={18} />)}</View>
          <View style={{ flex: 1, gap: 12 }}>
            <Bone h={96} r={20} />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: GAP }}>{[0, 1, 2, 3, 4, 5].map((i) => <Bone key={i} w={tileW} h={tileW + 30} r={16} />)}</View>
          </View>
        </Skeleton>
      ) : q.error && !q.data ? (
        <View style={[contentColumn, { padding: 20 }]}><ErrorState message={friendlyError(q.error)} onRetry={() => q.refetch()} /></View>
      ) : !roots.length ? (
        <Empty icon="grid" title="لا أقسام بعد" body="سيضيف المتجر أقسامه قريباً." />
      ) : (
        <View style={[contentColumn, { flex: 1, flexDirection: 'row' }]}>
          {/* الشريط الجانبي */}
          <ScrollView style={{ width: RAIL, flexGrow: 0 }} contentContainerStyle={{ paddingTop: 6, paddingBottom: 28, paddingHorizontal: 8, gap: 4 }} showsVerticalScrollIndicator={false}>
            {roots.map((r) => {
              const on = r.id === current?.id;
              return (
                <PressScale key={r.id} onPress={() => pick(r.id)} haptic={on ? undefined : 'select'} scaleTo={0.94}
                  accessibilityRole="tab" accessibilityState={{ selected: on }} accessibilityLabel={r.name}
                  style={{ alignItems: 'center', gap: 6, paddingVertical: 10, paddingHorizontal: 4, borderRadius: 18, backgroundColor: on ? c.accentSoft : 'transparent' }}>
                  <View style={{ width: 42, height: 42, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? c.card : c.sunken }}>
                    <Icon name={iconOf(r, 'grid')} size={22} color={on ? c.accent : c.ink2} strokeWidth={on ? 2 : 1.75} />
                  </View>
                  <T size={11.5} weight={on ? 'bold' : 'medium'} color={on ? c.accentSoftInk : c.ink2} center lines={2} style={{ lineHeight: 16 }}>{r.name}</T>
                </PressScale>
              );
            })}
          </ScrollView>

          {/* لوحة القسم */}
          <View style={{ flex: 1, backgroundColor: c.card, borderTopStartRadius: 26, borderStartWidth: 1, borderTopWidth: 1, borderColor: c.line, overflow: 'hidden' }}>
            <ScrollView ref={content} contentContainerStyle={{ padding: PAD, gap: 16, paddingBottom: 36 }} showsVerticalScrollIndicator={false}
              refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => { q.refetch(); }} tintColor={c.accent} colors={[c.accent]} progressBackgroundColor={c.card} />}>
              {current ? (
                <Animated.View key={current.id} entering={FadeIn.duration(180).reduceMotion(ReduceMotion.System)} style={{ gap: 16 }}>
                  <PressScale onPress={() => router.push(`/category/${current.id}`)} accessibilityRole="button" accessibilityLabel={`تصفح كل منتجات ${current.name}`} scaleTo={0.98}
                    style={{ borderRadius: 20, overflow: 'hidden', backgroundColor: c.accentSoft, padding: 16, gap: 10 }}>
                    <WedgePattern color={c.accent} opacity={0.08} />
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                      <View style={{ width: 48, height: 48, borderRadius: 16, backgroundColor: c.card, alignItems: 'center', justifyContent: 'center' }}>
                        <Icon name={iconOf(current, 'grid')} size={26} color={c.accent} strokeWidth={1.9} />
                      </View>
                      <View style={{ flex: 1, gap: 2 }}>
                        <T v="h3" color={c.accentSoftInk} lines={2}>{current.name}</T>
                        <T size={12.5} color={c.accentSoftInk} style={{ opacity: 0.8 }} lines={2}>
                          {current.description || (subs.length ? `${f.num(subs.length)} أقسام فرعية` : 'كل المنتجات في مكان واحد')}
                        </T>
                      </View>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6, backgroundColor: c.accent, borderRadius: 99, paddingVertical: 8, paddingHorizontal: 14 }}>
                      <T size={13} weight="bold" color={c.accentInk}>تصفح الكل</T>
                      <Icon name="forward" size={15} color={c.accentInk} strokeWidth={2.2} />
                    </View>
                  </PressScale>

                  {subs.length ? (
                    <View style={{ gap: 10 }}>
                      <T size={13} weight="bold" tone="ink2">الأقسام الفرعية</T>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: GAP, rowGap: 14 }}>
                        {subs.map((s) => (
                          <PressScale key={s.id} onPress={() => router.push(`/category/${s.id}`)} accessibilityRole="button" accessibilityLabel={s.name}
                            scaleTo={0.95} style={{ width: tileW, gap: 7, alignItems: 'center' }}>
                            <View style={{ width: tileW, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: c.line }}>
                              <ProductImage imageKey={s.image_key} categoryId={s.id} width={tileW} radiusPx={0} iconSize={26} />
                            </View>
                            <T size={12} weight="medium" center lines={2} style={{ lineHeight: 17 }}>{s.name}</T>
                          </PressScale>
                        ))}
                      </View>
                    </View>
                  ) : (
                    <View style={{ alignItems: 'center', gap: 6, paddingVertical: 24 }}>
                      <Icon name="package" size={28} color={c.ink3} />
                      <T size={13} tone="ink2" center>لا أقسام فرعية هنا. اضغط «تصفح الكل» لرؤية المنتجات.</T>
                    </View>
                  )}
                </Animated.View>
              ) : null}
            </ScrollView>
          </View>
        </View>
      )}
    </View>
  );
}
