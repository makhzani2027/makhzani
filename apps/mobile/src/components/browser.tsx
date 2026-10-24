import { toLatinDigits } from '@raqeem/shared';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, View } from 'react-native';
import { api, type SearchParams, type SearchSort } from '@/lib/api';
import { friendlyError } from '@/lib/errors';
import { useFmt } from '@/lib/format';
import { useBrands } from '@/lib/query';
import { useTheme } from '@/lib/theme';
import { GridSkeleton, ProductCard, useGridWidth } from './product-card';
import { Sheet } from './sheet';
import { Button, Chip, Empty, ErrorState, GUTTER, Input, Row, T, Toggle, contentColumn } from './ui';

export const SORTS: { key: SearchSort; label: string }[] = [
  { key: 'relevance', label: 'الأنسب' },
  { key: 'newest', label: 'الأحدث' },
  { key: 'best', label: 'الأكثر مبيعاً' },
  { key: 'price_asc', label: 'السعر: من الأقل' },
  { key: 'price_desc', label: 'السعر: من الأعلى' },
];

export type Filters = Pick<SearchParams, 'brand' | 'min_price' | 'max_price' | 'in_stock' | 'sort'>;

export const activeFilters = (f: Filters) => [f.brand, f.min_price != null, f.max_price != null, f.in_stock].filter(Boolean).length;

/** ورقة الفلاتر والترتيب */
export function FilterSheet({ visible, onClose, value, onApply }: { visible: boolean; onClose: () => void; value: Filters; onApply: (f: Filters) => void }) {
  const brands = useBrands().data ?? [];
  const fmt = useFmt();
  const [d, setD] = useState<Filters>(value);
  const [min, setMin] = useState(value.min_price != null ? String(value.min_price) : '');
  const [max, setMax] = useState(value.max_price != null ? String(value.max_price) : '');
  // الفلاتر قد تتغير من خارج الورقة (شريحة «المتوفر فقط»): نبدأ من القيمة الحالية عند كل فتح
  useEffect(() => {
    if (!visible) return;
    setD(value);
    setMin(value.min_price != null ? String(value.min_price) : '');
    setMax(value.max_price != null ? String(value.max_price) : '');
  }, [visible]); // eslint-disable-line react-hooks/exhaustive-deps
  const num = (s: string) => { const v = toLatinDigits(s).replace(/[^\d]/g, ''); return v ? Number(v) : null; };
  return (
    <Sheet visible={visible} onClose={onClose} title="الترتيب والفلاتر"
      footer={
        <Row>
          <Button flex variant="secondary" title="مسح" onPress={() => { setD({ sort: 'relevance' }); setMin(''); setMax(''); }} />
          <Button flex title="عرض النتائج" onPress={() => { onApply({ ...d, min_price: num(min), max_price: num(max) }); onClose(); }} />
        </Row>
      }>
      <View style={{ gap: 18 }}>
        <View style={{ gap: 8 }}>
          <T weight="bold">الترتيب</T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {SORTS.map((s) => <Chip key={s.key} label={s.label} active={(d.sort ?? 'relevance') === s.key} onPress={() => setD({ ...d, sort: s.key })} />)}
          </View>
        </View>
        {brands.length ? (
          <View style={{ gap: 8 }}>
            <T weight="bold">العلامة التجارية</T>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              <Chip label="الكل" active={!d.brand} onPress={() => setD({ ...d, brand: null })} />
              {brands.map((b) => <Chip key={b.id} label={b.name} active={d.brand === b.id} onPress={() => setD({ ...d, brand: b.id })} />)}
            </View>
          </View>
        ) : null}
        <View style={{ gap: 8 }}>
          <T weight="bold">السعر ({fmt.currencyLabel})</T>
          <Row gap={10}>
            <View style={{ flex: 1 }}><Input value={min} onChangeText={setMin} placeholder="من" keyboardType="number-pad" ltr /></View>
            <View style={{ flex: 1 }}><Input value={max} onChangeText={setMax} placeholder="إلى" keyboardType="number-pad" ltr /></View>
          </Row>
        </View>
        <Toggle label="المتوفر فقط" value={!!d.in_stock} onChange={(v) => setD({ ...d, in_stock: v })} />
      </View>
    </Sheet>
  );
}

const PAGE = 24;

/** شبكة نتائج store_search بصفحات متتالية */
export function ProductResults({ params, header, emptyTitle = 'لا نتائج', emptyBody }: {
  params: SearchParams; header?: React.ReactElement; emptyTitle?: string; emptyBody?: string;
}) {
  const { c } = useTheme();
  const f = useFmt();
  const { cols, w } = useGridWidth();
  const q = useInfiniteQuery({
    queryKey: ['search', params],
    queryFn: ({ pageParam }) => api.search({ ...params, lim: PAGE, off: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => {
      const loaded = pages.reduce((n, p) => n + p.items.length, 0);
      return loaded < last.total && last.items.length ? loaded : undefined;
    },
  });
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  const total = q.data?.pages[0]?.total ?? 0;

  return (
    <FlatList
      key={cols}
      data={items}
      numColumns={cols}
      keyExtractor={(p) => p.id}
      renderItem={({ item }) => <ProductCard p={item} width={w} />}
      columnWrapperStyle={{ gap: 12 }}
      style={{ flex: 1 }}
      contentContainerStyle={[contentColumn, { paddingHorizontal: GUTTER, gap: 12, paddingBottom: 40 }]}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
      onEndReachedThreshold={0.6}
      onEndReached={() => { if (q.hasNextPage && !q.isFetchingNextPage) q.fetchNextPage(); }}
      refreshControl={<RefreshControl refreshing={q.isRefetching && !q.isFetchingNextPage} onRefresh={() => { q.refetch(); }} tintColor={c.accent} colors={[c.accent]} />}
      ListHeaderComponent={
        <View style={{ gap: 12 }}>
          {header}
          {q.data && total > 0 ? <T v="small" tone="ink2">{f.products(total)}</T> : null}
        </View>
      }
      ListEmptyComponent={
        q.isPending ? <GridSkeleton /> : q.error ? <ErrorState message={friendlyError(q.error)} onRetry={() => q.refetch()} /> : <Empty icon="search" title={emptyTitle} body={emptyBody} />
      }
      ListFooterComponent={q.isFetchingNextPage ? <ActivityIndicator color={c.accent} style={{ marginTop: 12 }} /> : undefined}
    />
  );
}
