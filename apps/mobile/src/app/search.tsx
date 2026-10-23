import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState, type ComponentRef } from 'react';
import { TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { activeFilters, FilterSheet, ProductResults, SORTS, type Filters } from '@/components/browser';
import { PressScale } from '@/components/motion';
import { Chip, GUTTER, Icon, IconButton, Row, T, contentColumn, goBack } from '@/components/ui';
import type { SearchSort } from '@/lib/api';
import { storage } from '@/lib/storage';
import { fonts, useTheme } from '@/lib/theme';

const RECENT = 'raqeem.search.recent';

export default function Search() {
  const { c } = useTheme();
  const insets = useSafeAreaInsets();
  const p = useLocalSearchParams<{ q?: string; brand?: string; sort?: string; title?: string; category?: string }>();
  const [text, setText] = useState(p.q ?? '');
  const [q, setQ] = useState(p.q ?? '');
  const [filters, setFilters] = useState<Filters>({ brand: p.brand ?? null, sort: (p.sort as SearchSort) ?? 'relevance' });
  const [sheet, setSheet] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const input = useRef<ComponentRef<typeof TextInput>>(null);
  const preset = !!(p.brand || p.sort || p.category);

  useEffect(() => { storage.get<string[]>(RECENT).then((r) => setRecent(r ?? [])); }, []);
  useEffect(() => { const t = setTimeout(() => setQ(text.trim()), 280); return () => clearTimeout(t); }, [text]);
  useEffect(() => {
    if (q.length < 2) return;
    const t = setTimeout(() => {
      setRecent((r) => { const next = [q, ...r.filter((x) => x !== q)].slice(0, 8); storage.set(RECENT, next); return next; });
    }, 1500);
    return () => clearTimeout(t);
  }, [q]);

  const browsing = !q && !preset && activeFilters(filters) === 0 && (filters.sort ?? 'relevance') === 'relevance';
  const nFilters = activeFilters(filters);
  const sortLabel = SORTS.find((s) => s.key === (filters.sort ?? 'relevance'))?.label;

  return (
    <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: insets.top }}>
      <View style={[contentColumn, { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8 }]}>
        <IconButton name="back" label="رجوع" plain onPress={goBack} />
        <View style={{ flex: 1, height: 48, borderRadius: 999, backgroundColor: c.card, borderWidth: 1, borderColor: c.line, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, gap: 8 }}>
          <Icon name="search" size={19} color={c.ink3} />
          <TextInput
            ref={input}
            value={text}
            onChangeText={setText}
            autoFocus={!preset}
            placeholder={p.title ? `ابحث في ${p.title}` : 'ابحث عن منتج، ماركة، أو رمز'}
            placeholderTextColor={c.ink3}
            returnKeyType="search"
            selectionColor={c.accent}
            maxFontSizeMultiplier={1.3}
            style={{ flex: 1, minWidth: 0, height: '100%', color: c.ink, fontFamily: fonts.regular, fontSize: 15.5, textAlign: 'right', writingDirection: 'rtl', paddingVertical: 0, ...({ outlineStyle: 'none' } as object) }}
            accessibilityLabel="البحث"
          />
          {text ? (
            <PressScale onPress={() => { setText(''); input.current?.focus(); }} hitSlop={10} accessibilityRole="button" accessibilityLabel="مسح" style={{ padding: 4 }}>
              <Icon name="xCircle" size={19} color={c.ink3} />
            </PressScale>
          ) : null}
        </View>
        <View>
          <IconButton name="sliders" label="الفلاتر والترتيب" onPress={() => setSheet(true)} badge={nFilters || undefined} />
        </View>
      </View>

      <ProductResults
        params={{ q: q || null, category: p.category || null, ...filters, sort: browsing ? 'best' : filters.sort }}
        emptyTitle={q ? `لا نتائج لـ«${q}»` : 'لا نتائج'}
        emptyBody="جرّب كلمة أقصر، أو اطلب المنتج ونوفّره لك."
        header={
          <View style={{ gap: 12 }}>
            {p.title ? <T v="h2">{p.title}</T> : null}
            {browsing && recent.length ? (
              <View style={{ gap: 8 }}>
                <Row style={{ justifyContent: 'space-between' }}>
                  <T weight="bold">عمليات بحثك الأخيرة</T>
                  <PressScale onPress={() => { setRecent([]); storage.remove(RECENT); }} hitSlop={8}><T v="small" tone="accent" weight="bold">مسح</T></PressScale>
                </Row>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {recent.map((r) => <Chip key={r} small icon="history" label={r} onPress={() => setText(r)} />)}
                </View>
              </View>
            ) : null}
            {browsing ? <T weight="bold">الأكثر طلباً</T> : (
              <Row gap={8} style={{ flexWrap: 'wrap', paddingHorizontal: 0 }}>
                <Chip small icon="sort" label={sortLabel ?? 'الترتيب'} active={filters.sort !== 'relevance'} onPress={() => setSheet(true)} />
                <Chip small label="المتوفر فقط" active={!!filters.in_stock} onPress={() => setFilters({ ...filters, in_stock: !filters.in_stock })} />
              </Row>
            )}
          </View>
        }
      />
      <FilterSheet visible={sheet} onClose={() => setSheet(false)} value={filters} onApply={setFilters} />
      <View style={{ height: GUTTER / 2 }} />
    </View>
  );
}
