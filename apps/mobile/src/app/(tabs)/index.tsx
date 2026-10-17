import { useQuery } from '@tanstack/react-query';
import { router } from 'expo-router';
import { ScrollView, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { HeroCarousel, StripBanners } from '@/components/banners';
import { Logo, ProductImage } from '@/components/brand';
import { appear, Bone, PressScale, Skeleton } from '@/components/motion';
import { GridSkeleton, ProductRail } from '@/components/product-card';
import { Card, ErrorState, GUTTER, Icon, IconButton, Row, Screen, T, contentColumn } from '@/components/ui';
import { api, type StoreHomeSection } from '@/lib/api';
import { useUnread } from '@/lib/hooks';
import { friendlyError } from '@/lib/errors';
import { useFmt } from '@/lib/format';
import { qk, useSettings } from '@/lib/query';
import { useTheme } from '@/lib/theme';

function moreOf(s: StoreHomeSection): (() => void) | undefined {
  if (s.kind === 'category' && s.category_id) return () => router.push(`/category/${s.category_id}`);
  if (s.kind === 'brand' && s.brand_id) return () => router.push({ pathname: '/search', params: { brand: s.brand_id!, title: s.title } });
  const sort = s.kind === 'new' ? 'newest' : s.kind === 'best_sellers' ? 'best' : null;
  if (sort) return () => router.push({ pathname: '/search', params: { sort, title: s.title } });
  return undefined;
}

export default function Home() {
  const { c } = useTheme();
  const f = useFmt();
  const unread = useUnread();
  const settings = useSettings();
  const home = useQuery({ queryKey: qk.home, queryFn: () => api.home() });
  const d = home.data;
  const hero = d?.banners.filter((b) => b.placement === 'home_hero') ?? [];
  const strip = d?.banners.filter((b) => b.placement === 'home_strip') ?? [];
  const cats = (d?.categories ?? []).filter((x) => !x.parent_id);
  const freeOver = settings.data?.checkout.free_delivery_over;

  const header = (
    <View style={[contentColumn, { paddingHorizontal: GUTTER, paddingVertical: 6, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]}>
      <Logo size={26} />
      <IconButton name="bell" label="الإشعارات" badge={unread} onPress={() => router.push('/notifications')} />
    </View>
  );

  return (
    <Screen padded={false} header={header} onRefresh={() => { home.refetch(); settings.refetch(); }} refreshing={home.isRefetching} gap={22}>
      <View style={[contentColumn, { paddingHorizontal: GUTTER }]}>
        <PressScale
          onPress={() => router.push('/search')}
          accessibilityRole="search"
          accessibilityLabel="ابحث عن منتج"
          scaleTo={0.99}
          style={{ height: 50, borderRadius: 999, backgroundColor: c.card, borderWidth: 1, borderColor: c.line, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16 }}>
          <Icon name="search" size={20} color={c.ink3} />
          <T tone="ink3" style={{ flex: 1 }}>ابحث باسم المنتج أو الماركة</T>
          <Icon name="sliders" size={20} color={c.ink2} />
        </PressScale>
      </View>

      {home.isLoading ? (
        <View style={[contentColumn, { paddingHorizontal: GUTTER, gap: 22 }]}>
          <Skeleton><Bone h={150} r={22} /></Skeleton>
          <Skeleton style={{ flexDirection: 'row', gap: 14 }}>{[0, 1, 2, 3, 4].map((i) => <Bone key={i} w={64} h={64} r={32} />)}</Skeleton>
          <GridSkeleton n={2} />
        </View>
      ) : home.error && !d ? (
        <View style={[contentColumn, { paddingHorizontal: GUTTER }]}>
          <ErrorState message={friendlyError(home.error)} onRetry={() => home.refetch()} />
        </View>
      ) : d ? (
        <Animated.View entering={appear} style={{ gap: 24 }}>
          <HeroCarousel banners={hero} />

          {cats.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[contentColumn, { flexGrow: 0 }]} contentContainerStyle={{ paddingHorizontal: GUTTER, gap: 14 }}>
              {cats.map((cat) => (
                <PressScale key={cat.id} onPress={() => router.push(`/category/${cat.id}`)} accessibilityRole="button" accessibilityLabel={cat.name} style={{ width: 72, alignItems: 'center', gap: 6 }}>
                  <View style={{ width: 66, height: 66, borderRadius: 33, overflow: 'hidden', borderWidth: 1, borderColor: c.line, backgroundColor: c.card }}>
                    <ProductImage imageKey={cat.image_key} categoryId={cat.id} width={66} radiusPx={33} iconSize={28} />
                  </View>
                  <T size={12.5} weight="medium" center lines={2}>{cat.name}</T>
                </PressScale>
              ))}
            </ScrollView>
          ) : null}

          {freeOver ? (
            <View style={[contentColumn, { paddingHorizontal: GUTTER }]}>
              <Row gap={10} style={{ backgroundColor: c.accentSoft, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10 }}>
                <Icon name="truck" size={22} color={c.accentSoftInk} />
                <T size={14} weight="bold" color={c.accentSoftInk} style={{ flex: 1 }}>توصيل مجاني للطلبات فوق {f.money(freeOver)}</T>
              </Row>
            </View>
          ) : null}

          <StripBanners banners={strip} />

          {d.sections.map((s) => <ProductRail key={s.id} title={s.title} items={s.products} onMore={moreOf(s)} />)}

          <View style={[contentColumn, { paddingHorizontal: GUTTER }]}>
            <Card onPress={() => router.push('/request/new')} accessibilityLabel="اطلب منتجاً غير موجود" style={{ flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: c.hero, borderColor: c.hero }}>
              <View style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="request" size={24} color={c.accentInk} />
              </View>
              <View style={{ flex: 1 }}>
                <T v="h3" color={c.heroInk}>لم تجد ما تريد؟</T>
                <T v="small" color={c.heroInk2}>اطلبه منّا ونحاول توفيره لك ونبلغك.</T>
              </View>
              <Icon name="forward" size={20} color={c.heroInk} />
            </Card>
          </View>
        </Animated.View>
      ) : null}
    </Screen>
  );
}
