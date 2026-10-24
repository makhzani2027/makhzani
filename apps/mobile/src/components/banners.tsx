import { brand, mediaUrl } from '@raqeem/shared';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useRef, useState } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';
import { env } from '@/lib/env';
import { useTheme } from '@/lib/theme';
import type { StoreBanner } from '@/lib/api';
import { WedgePattern } from './brand';
import { PressScale } from './motion';
import { Pager, PagerDots } from './pager';
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
function BannerTile({ b, width, height, inPager }: { b: StoreBanner; width: number; height: number; inPager?: boolean }) {
  const url = b.image_key ? mediaUrl(b.image_key, 'lg', env.mediaBase) : null;
  const bg = b.placement === 'home_strip' ? brand.ink : brand.brick;
  const linked = b.link_kind !== 'none' && !!b.link_value;
  const style = { width, height, borderRadius: 22, overflow: 'hidden' as const, backgroundColor: bg };
  const label = [b.title, b.subtitle].filter(Boolean).join('، ') || 'عرض';
  const body = url ? (
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
  );
  // داخل العارض: اللمس يعالجه Pager مع السحب، فالبانر هنا عرض فقط
  if (inPager) return <View style={style} accessibilityLabel={label}>{body}</View>;
  return (
    <PressScale
      onPress={linked ? () => openLink(b.link_kind, b.link_value) : undefined}
      disabled={!linked}
      accessibilityRole={linked ? 'button' : 'image'}
      accessibilityLabel={label}
      scaleTo={0.985}
      style={style}>
      {body}
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
  const touching = useRef(false);
  // يزيد مع كل نهاية لمس: يعيد عدّ الثواني الخمس ولو رجع السحب للبانر نفسه
  const [touchEnd, setTouchEnd] = useState(0);
  const reduced = useReducedMotion();
  const n = banners.length;

  useEffect(() => { if (i > n - 1) setI(0); }, [n, i]);
  // مؤقت واحد يُعاد ضبطه مع كل تغيّر للفهرس (تلقائي أو بالسحب) ومع نهاية اللمس، فلا يقفز البانر بعد سحب المستخدم مباشرة
  useEffect(() => {
    if (n < 2 || reduced) return;
    const t = setTimeout(() => { if (!touching.current) setI((x) => (x + 1) % n); }, 5000);
    return () => clearTimeout(t);
  }, [n, reduced, i, touchEnd]);

  if (!n) return null;
  return (
    <View style={{ gap: 10, alignSelf: 'center', width }}>
      <Pager
        data={banners}
        width={width}
        height={height}
        gap={12}
        index={Math.min(i, n - 1)}
        onIndexChange={setI}
        onDragChange={(d) => { touching.current = d; if (!d) setTouchEnd((x) => x + 1); }}
        keyOf={(b) => b.id}
        label="العروض"
        onPressItem={(k) => { const b = banners[k]; if (b) openLink(b.link_kind, b.link_value); }}
        renderItem={(b) => <BannerTile b={b} width={width} height={height} inPager />}
      />
      <PagerDots n={n} index={Math.min(i, n - 1)} active={c.accent} idle={c.lineStrong} />
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
