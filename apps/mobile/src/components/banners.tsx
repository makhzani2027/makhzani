import { brand, mediaUrl } from '@raqeem/shared';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useRef, useState } from 'react';
import { FlatList, View, useWindowDimensions, type FlatListProps } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { env } from '@/lib/env';
import { useTheme } from '@/lib/theme';
import type { StoreBanner } from '@/lib/api';
import { WedgePattern } from './brand';
import { PressScale } from './motion';
import { GUTTER, Icon, T } from './ui';

/** وجهة البانر حسب نوع الرابط */
export function openLink(kind: StoreBanner['link_kind'], value: string | null) {
  if (!value || kind === 'none') return;
  if (kind === 'product') router.push(`/product/${value}`);
  else if (kind === 'category') router.push(`/category/${value}`);
  else if (kind === 'brand') router.push({ pathname: '/search', params: { brand: value } });
  else if (kind === 'search') router.push({ pathname: '/search', params: { q: value } });
  else if (kind === 'url' && /^https?:\/\//.test(value)) WebBrowser.openBrowserAsync(value).catch(() => {});
}

/**
 * بانر واحد: صورة، أو نصي بألوان الهوية — الطين للبطل (home_hero) والحبر للشريط (home_strip)،
 * نفس قاعدة معاينة لوحة التحكم.
 */
function BannerTile({ b, width, height }: { b: StoreBanner; width: number; height: number }) {
  const url = b.image_key ? mediaUrl(b.image_key, 'lg', env.mediaBase) : null;
  const bg = b.placement === 'home_strip' ? brand.ink : brand.brick;
  const linked = b.link_kind !== 'none' && !!b.link_value;
  return (
    <PressScale
      onPress={linked ? () => openLink(b.link_kind, b.link_value) : undefined}
      disabled={!linked}
      accessibilityRole={linked ? 'button' : 'image'}
      accessibilityLabel={[b.title, b.subtitle].filter(Boolean).join('، ') || 'عرض'}
      scaleTo={0.985}
      style={{ width, height, borderRadius: 22, overflow: 'hidden', backgroundColor: bg }}>
      {url ? (
        <Image source={{ uri: url }} style={{ width: '100%', height: '100%' }} contentFit="cover" transition={200} />
      ) : (
        <View style={{ flex: 1, padding: 20, justifyContent: 'center', gap: 4 }}>
          <WedgePattern color="#FFFFFF" opacity={0.07} />
          {b.title ? <T v="display" size={height > 120 ? 26 : 19} color="#FFFFFF" lines={2}>{b.title}</T> : null}
          {b.subtitle ? <T size={14} color="rgba(255,255,255,0.82)" lines={2}>{b.subtitle}</T> : null}
          {linked ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 6 }}>
              <T v="small" weight="bold" color="#FFFFFF">تسوّق الآن</T>
              <Icon name="forward" size={16} color="#FFFFFF" strokeWidth={2} />
            </View>
          ) : null}
        </View>
      )}
    </PressScale>
  );
}

/** دوّار البانرات الكبيرة: يتقدم وحده كل ٥ ثوانٍ (يتوقف مع «تقليل الحركة» أو أثناء اللمس) */
export function HeroCarousel({ banners }: { banners: StoreBanner[] }) {
  const { c } = useTheme();
  const { width: win } = useWindowDimensions();
  const width = Math.min(win, 720) - GUTTER * 2;
  const height = Math.round(width * 0.46);
  const [i, setI] = useState(0);
  const list = useRef<FlatList<StoreBanner>>(null);
  const touching = useRef(false);
  const reduced = useReducedMotion();
  const step = width + 12;

  // النقطة النشطة من البانر الظاهر فعلاً، لا من موضع التمرير: في RTL على أندرويد يُحسب الموضع من الطرف
  // الآخر فكانت النقاط تتحرك عكس السحب
  const current = useRef(0);
  const viewConfig = useRef({ itemVisiblePercentThreshold: 60 }).current;
  const onViewable = useRef<NonNullable<FlatListProps<StoreBanner>['onViewableItemsChanged']>>(({ viewableItems }) => {
    const v = viewableItems.find((x) => x.isViewable && x.index != null);
    if (v?.index != null) { current.current = v.index; setI(v.index); }
  }).current;

  useEffect(() => {
    if (banners.length < 2 || reduced) return;
    const t = setInterval(() => {
      if (touching.current) return;
      const n = (current.current + 1) % banners.length;
      list.current?.scrollToIndex({ index: n, animated: true });
    }, 5000);
    return () => clearInterval(t);
  }, [banners.length, reduced]);

  if (!banners.length) return null;
  return (
    <View style={{ gap: 10, alignSelf: 'center', width }}>
      <FlatList
        ref={list}
        horizontal
        data={banners}
        keyExtractor={(b) => b.id}
        renderItem={({ item }) => <BannerTile b={item} width={width} height={height} />}
        snapToInterval={step}
        decelerationRate="fast"
        showsHorizontalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={{ width: 12 }} />}
        onScrollBeginDrag={() => { touching.current = true; }}
        onMomentumScrollEnd={() => { touching.current = false; }}
        onViewableItemsChanged={onViewable}
        viewabilityConfig={viewConfig}
        getItemLayout={(_, index) => ({ length: step, offset: step * index, index })}
        style={{ width, flexGrow: 0, overflow: 'visible' }}
      />
      {banners.length > 1 ? (
        <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 6 }} accessibilityLabel={`بانر ${i + 1} من ${banners.length}`}>
          {banners.map((b, k) => (
            <View key={b.id} style={{ height: 6, width: k === i ? 18 : 6, borderRadius: 3, backgroundColor: k === i ? c.accent : c.lineStrong }} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** بانرات الشريط الرفيع (home_strip) */
export function StripBanners({ banners }: { banners: StoreBanner[] }) {
  const { width: win } = useWindowDimensions();
  const width = Math.min(win, 720) - GUTTER * 2;
  if (!banners.length) return null;
  return (
    <View style={{ gap: 10, alignSelf: 'center', width }}>
      {banners.map((b) => <BannerTile key={b.id} b={b} width={width} height={Math.round(width * 0.26)} />)}
    </View>
  );
}
