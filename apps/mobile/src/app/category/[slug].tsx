import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { activeFilters, FilterSheet, ProductResults, type Filters } from '@/components/browser';
import { AppBar, Chip, Empty, IconButton } from '@/components/ui';
import { useCategories } from '@/lib/query';
import { useTheme } from '@/lib/theme';

/** صفحة قسم: الفرعية كشرائح، والمنتجات مع الفلاتر. المعامل معرّف القسم أو اسمه اللطيف */
export default function CategoryScreen() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const cats = useCategories();
  const cat = cats.data?.find((x) => x.id === slug || x.slug === slug);
  const parent = cat?.parent_id ? cats.data?.find((x) => x.id === cat.parent_id) : null;
  const root = parent ?? cat;
  const subs = (cats.data ?? []).filter((x) => x.parent_id === root?.id).sort((a, b) => a.sort - b.sort);
  const [filters, setFilters] = useState<Filters>({ sort: 'relevance' });
  const [sheet, setSheet] = useState(false);

  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
      <AppBar
        title={cat?.name ?? 'القسم'}
        subtitle={parent?.name}
        right={<>
          <IconButton name="search" label="بحث" plain onPress={() => router.push({ pathname: '/search', params: { category: cat?.id ?? '', title: cat?.name ?? '' } })} />
          <IconButton name="sliders" label="الفلاتر" onPress={() => setSheet(true)} badge={activeFilters(filters) || undefined} />
        </>}
      />
      {!cat && !cats.isLoading ? (
        <Empty icon="grid" title="القسم غير موجود" body="ربما أُخفي أو تغيّر اسمه." action="الأقسام" onAction={() => router.navigate('/categories')} />
      ) : cat ? (
        <ProductResults
          params={{ category: cat.id, ...filters }}
          emptyTitle="لا منتجات في هذا القسم بعد"
          emptyBody="تابعنا، نضيف منتجات جديدة باستمرار."
          header={subs.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} style={{ flexGrow: 0 }}>
              {root ? <Chip label="الكل" active={cat.id === root.id} onPress={() => router.setParams({ slug: root.id })} /> : null}
              {subs.map((s) => <Chip key={s.id} label={s.name} active={s.id === cat.id} onPress={() => router.setParams({ slug: s.id })} />)}
            </ScrollView>
          ) : undefined}
        />
      ) : null}
      <FilterSheet visible={sheet} onClose={() => setSheet(false)} value={filters} onApply={setFilters} />
    </View>
  );
}
