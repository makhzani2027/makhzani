import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, View, useWindowDimensions } from 'react-native';
import { ProductImage } from '@/components/brand';
import { Bone, PressScale, Skeleton } from '@/components/motion';
import { Empty, ErrorState, Icon, IconButton, PageTitle, T, contentColumn } from '@/components/ui';
import { friendlyError } from '@/lib/errors';
import { useCategories } from '@/lib/query';
import { useTheme } from '@/lib/theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/** الأقسام الرئيسية يميناً، والفرعية بصورها في شبكة */
export default function Categories() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const q = useCategories();
  const all = q.data ?? [];
  const roots = all.filter((x) => !x.parent_id).sort((a, b) => a.sort - b.sort);
  const [sel, setSel] = useState<string | null>(null);
  useEffect(() => { if (!sel && roots[0]) setSel(roots[0].id); }, [roots, sel]);
  const current = roots.find((r) => r.id === sel) ?? roots[0];
  const subs = all.filter((x) => x.parent_id === current?.id).sort((a, b) => a.sort - b.sort);
  const railW = 112;
  const gridW = Math.min(width, 720) - railW - 16 * 2;
  const tileW = Math.floor((gridW - 12) / 2);

  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
      <PageTitle title="الأقسام" right={<IconButton name="search" label="بحث" onPress={() => router.push('/search')} />} />
      {q.isLoading ? (
        <Skeleton style={[contentColumn, { padding: 16, gap: 10 }]}>{[0, 1, 2, 3, 4].map((i) => <Bone key={i} h={52} r={14} />)}</Skeleton>
      ) : q.error && !q.data ? (
        <View style={[contentColumn, { padding: 20 }]}><ErrorState message={friendlyError(q.error)} onRetry={() => q.refetch()} /></View>
      ) : !roots.length ? (
        <Empty icon="grid" title="لا أقسام بعد" body="سيضيف المتجر أقسامه قريباً." />
      ) : (
        <View style={[contentColumn, { flex: 1, flexDirection: 'row', paddingTop: 8 }]}>
          <ScrollView style={{ width: railW, flexGrow: 0 }} contentContainerStyle={{ paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
            {roots.map((r) => {
              const on = r.id === current?.id;
              return (
                <PressScale key={r.id} onPress={() => setSel(r.id)} haptic="select" accessibilityRole="tab" accessibilityState={{ selected: on }}
                  style={{ paddingVertical: 14, paddingHorizontal: 12, backgroundColor: on ? c.card : 'transparent', borderTopLeftRadius: 16, borderBottomLeftRadius: 16 }}>
                  {on ? <View style={{ position: 'absolute', start: 0, top: 12, bottom: 12, width: 3, borderRadius: 2, backgroundColor: c.accent }} /> : null}
                  <T size={14} weight={on ? 'bold' : 'medium'} tone={on ? 'ink' : 'ink2'} lines={2}>{r.name}</T>
                </PressScale>
              );
            })}
          </ScrollView>
          <ScrollView style={{ flex: 1, backgroundColor: c.card }} contentContainerStyle={{ padding: 16, gap: 14, paddingBottom: 32 }}>
            {current ? (
              <PressScale onPress={() => router.push(`/category/${current.id}`)} accessibilityRole="button"
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: c.accentSoft, borderRadius: 14, padding: 12 }}>
                <T weight="bold" color={c.accentSoftInk}>كل منتجات {current.name}</T>
                <Icon name="forward" size={18} color={c.accentSoftInk} />
              </PressScale>
            ) : null}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
              {subs.map((s) => (
                <PressScale key={s.id} onPress={() => router.push(`/category/${s.id}`)} accessibilityRole="button" accessibilityLabel={s.name} style={{ width: tileW, gap: 6, alignItems: 'center' }}>
                  <ProductImage imageKey={s.image_key} categoryId={s.id} width={tileW} radiusPx={16} iconSize={30} />
                  <T size={13} weight="medium" center lines={2}>{s.name}</T>
                </PressScale>
              ))}
            </View>
          </ScrollView>
        </View>
      )}
    </View>
  );
}
