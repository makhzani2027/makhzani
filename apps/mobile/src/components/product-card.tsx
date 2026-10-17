import { router } from 'expo-router';
import { useRef } from 'react';
import { FlatList, View, useWindowDimensions } from 'react-native';
import { formatPercent } from '@raqeem/shared';
import { useCart } from '@/lib/cart';
import { useFavorites } from '@/lib/favorites';
import { useFmt } from '@/lib/format';
import { useTheme } from '@/lib/theme';
import type { StoreProductCard } from '@/lib/api';
import { PriceTag, ProductImage } from './brand';
import { useFly, type ViewRef } from './fly';
import { Bone, PressScale, Skeleton } from './motion';
import { toast } from './toast';
import { GUTTER, Icon, SectionTitle, T, contentColumn } from './ui';

/** نسبة الخصم (٠ إن لم يوجد) */
export function discountOf(price: number, compare: number | null | undefined): number {
  if (!compare || compare <= price) return 0;
  return (compare - price) / compare;
}

export function ProductCard({ p, width }: { p: StoreProductCard; width: number }) {
  const { c, tone } = useTheme();
  const f = useFmt();
  const cart = useCart();
  const fav = useFavorites();
  const { fly } = useFly();
  const imgRef = useRef<ViewRef>(null);
  const off = discountOf(p.price_min, p.compare_at_price);
  const out = !p.in_stock;
  const faved = fav.has(p.id);
  const quick = !!p.default_variant_id && !out;

  const add = () => {
    if (!p.default_variant_id) return router.push(`/product/${p.slug}`);
    cart.add(p.default_variant_id, 1, p.price_min);
    fly(imgRef, <View style={{ width: 64, height: 64 }}><ProductImage imageKey={p.cover_key} categoryId={p.category_id} width={64} radiusPx={18} /></View>);
  };

  return (
    <PressScale
      onPress={() => router.push(`/product/${p.slug}`)}
      accessibilityRole="button"
      accessibilityLabel={`${p.name}، ${f.money(p.price_min)}`}
      style={{ width, backgroundColor: c.card, borderRadius: 20, borderWidth: 1, borderColor: c.line, overflow: 'hidden' }}>
      <View ref={imgRef} collapsable={false} style={{ padding: 6 }}>
        <View style={{ opacity: out ? 0.55 : 1 }}>
          <ProductImage imageKey={p.cover_key} categoryId={p.category_id} width={width - 12} radiusPx={15} />
        </View>
        {off >= 0.01 ? <PriceTag label={formatPercent(off, f.digits, 0)} size="sm" style={{ position: 'absolute', top: 12, start: 12 }} /> : null}
        {out ? (
          <View style={{ position: 'absolute', top: 12, start: 12, backgroundColor: c.ink, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 2 }}>
            <T size={11.5} weight="bold" color={c.bg} style={{ paddingBottom: 0 }}>نفد</T>
          </View>
        ) : null}
        <PressScale
          hitSlop={8}
          scaleTo={0.85}
          haptic="select"
          accessibilityRole="button"
          accessibilityLabel={faved ? 'إزالة من المفضلة' : 'أضف للمفضلة'}
          onPress={() => { const on = fav.toggle(p.id); if (on) toast.show('أُضيف للمفضلة', 'success'); }}
          style={{ position: 'absolute', top: 12, end: 12, width: 34, height: 34, borderRadius: 17, backgroundColor: c.card, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="heart" size={18} color={faved ? c.accent : c.ink2} fill={faved ? c.accent : undefined} />
        </PressScale>
      </View>
      <View style={{ paddingHorizontal: 12, paddingBottom: 12, gap: 2 }}>
        {p.brand_name ? <T v="micro" tone="ink3" lines={1}>{p.brand_name}</T> : null}
        <T size={14} weight="medium" lines={2} style={{ minHeight: 44 }}>{p.name}</T>
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 6, marginTop: 2 }}>
          <View style={{ flexShrink: 1 }}>
            {p.compare_at_price && off > 0 ? (
              <T v="micro" tone="ink3" style={{ textDecorationLine: 'line-through' }} lines={1}>{f.money(p.compare_at_price)}</T>
            ) : null}
            <T size={15.5} weight="black" lines={1} tabular>
              {p.price_max > p.price_min ? `من ${f.money(p.price_min)}` : f.money(p.price_min)}
            </T>
          </View>
          {quick ? (
            <PressScale
              onPress={add}
              scaleTo={0.85}
              accessibilityRole="button"
              accessibilityLabel={`أضف ${p.name} للسلة`}
              style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: c.ink, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="plus" size={20} color={c.bg} strokeWidth={2.2} />
            </PressScale>
          ) : out && p.allow_request ? (
            <T v="micro" color={tone.warning.ink} weight="bold">اطلبه</T>
          ) : null}
        </View>
      </View>
    </PressScale>
  );
}

/** عرض البطاقة في الشبكة: عمودان على الهاتف، ٣ على اللوحي (داخل عمود ٧٢٠) */
export function useGridWidth(cols?: number) {
  const { width } = useWindowDimensions();
  const inner = Math.min(width, 720) - GUTTER * 2;
  const n = cols ?? (inner > 560 ? 3 : 2);
  return { cols: n, w: Math.floor((inner - (n - 1) * 12) / n) };
}

export function ProductGrid({ items }: { items: StoreProductCard[] }) {
  const { w } = useGridWidth();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
      {items.map((p) => <ProductCard key={p.id} p={p} width={w} />)}
    </View>
  );
}

export function GridSkeleton({ n = 4 }: { n?: number }) {
  const { w } = useGridWidth();
  return (
    <Skeleton style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
      {Array.from({ length: n }, (_, i) => (
        <View key={i} style={{ width: w, gap: 8 }}>
          <Bone w={w} h={w} r={18} />
          <Bone w="80%" />
          <Bone w="40%" h={18} />
        </View>
      ))}
    </Skeleton>
  );
}

/** شريط أفقي لقسم من أقسام الرئيسية */
export function ProductRail({ title, items, onMore }: { title: string; items: StoreProductCard[]; onMore?: () => void }) {
  const { width } = useWindowDimensions();
  const w = Math.min(176, Math.round(Math.min(width, 720) * 0.42));
  return (
    <View style={{ gap: 12 }}>
      <View style={[contentColumn, { paddingHorizontal: GUTTER }]}>
        <SectionTitle title={title} action={onMore ? 'عرض الكل' : undefined} onAction={onMore} />
      </View>
      <FlatList
        horizontal
        data={items}
        keyExtractor={(p) => p.id}
        renderItem={({ item }) => <ProductCard p={item} width={w} />}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: GUTTER, gap: 12 }}
        style={[contentColumn, { flexGrow: 0 }]}
      />
    </View>
  );
}
