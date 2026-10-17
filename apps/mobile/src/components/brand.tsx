import { icons, type IconName as BaseIcon } from '@raqeem/shared';
import { Image } from 'expo-image';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { env } from '@/lib/env';
import { useCategories } from '@/lib/query';
import { fonts, useTheme } from '@/lib/theme';
import { mediaUrl, pickSize } from '@raqeem/shared';
import { Icon } from './icon';
import { descentPadFor, lineHeightFor, T } from './text';

/** مسار الرمز: إسفين مسماري ينحني ليصير «ر»، وفي رأسه ثقب بطاقة السعر (05-brand.md) */
export const MARK_PATH = 'M56 17H98L82.5 37.7C82.5 80 62 101.5 20 103C54 93.5 71.5 75 71.5 37.7Z';
export const MARK_HOLE = { cx: 77, cy: 27, r: 6 };

export function Mark({ size = 32, color, hole }: { size?: number; color?: string; hole?: string }) {
  const { c } = useTheme();
  return (
    <Svg width={size} height={size} viewBox="0 0 120 120" accessibilityLabel="رقيم">
      <Path d={MARK_PATH} fill={color ?? c.ink} stroke={color ?? c.ink} strokeWidth={3} strokeLinejoin="round" />
      <Circle cx={MARK_HOLE.cx} cy={MARK_HOLE.cy} r={MARK_HOLE.r} fill={hole ?? c.accent} />
    </Svg>
  );
}

/** الشعار الكامل: الرمز يمين الكلمة «رَقيم» (الفتحة على الراء في الشعار فقط) */
export function Logo({ size = 30 }: { size?: number }) {
  const { c } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: size * 0.12 }} accessibilityRole="header" accessibilityLabel="رقيم">
      <Mark size={size * 1.25} />
      <T family="display" weight="black" size={size} color={c.ink}
        style={{ lineHeight: lineHeightFor(size, 'display'), paddingBottom: descentPadFor(size, 'display'), paddingHorizontal: 2, fontFamily: fonts.display }}>
        رَقيم
      </T>
    </View>
  );
}

/**
 * بطاقة السعر المثقوبة — شكل شارة الخصم في المتجر. الرأس المدبب نحو بداية السطر (اليمين) وفيه الثقب.
 */
export function PriceTag({ label, size = 'md', style }: { label: string; size?: 'sm' | 'md'; style?: StyleProp<ViewStyle> }) {
  const { c } = useTheme();
  const h = size === 'sm' ? 22 : 28;
  const fs = size === 'sm' ? 11.5 : 13.5;
  const point = h * 0.5;
  const w = Math.max(44, label.length * fs * 0.62 + point + 14);
  const r = 5;
  // الرأس يمين: مستطيل مدور من اليسار ومدبب من اليمين
  const d = `M${r} 0H${w - point}L${w} ${h / 2}L${w - point} ${h}H${r}Q0 ${h} 0 ${h - r}V${r}Q0 0 ${r} 0Z`;
  return (
    <View style={[{ width: w, height: h, direction: 'ltr' }, style]} accessibilityLabel={`خصم ${label}`}>
      <Svg width={w} height={h} style={{ position: 'absolute' }}>
        <Path d={d} fill={c.accent} />
        <Circle cx={w - point * 0.95} cy={h / 2} r={size === 'sm' ? 2.2 : 2.8} fill={c.card} />
      </Svg>
      <View style={{ ...StyleSheet.absoluteFill, paddingEnd: point + 2, alignItems: 'center', justifyContent: 'center' }}>
        <T size={fs} weight="black" color={c.accentInk} style={{ lineHeight: h - 2, paddingBottom: 0, direction: 'rtl' }} tabular>{label}</T>
      </View>
    </View>
  );
}

const isIcon = (s: string | null | undefined): s is BaseIcon => !!s && s in icons;

/** صورة منتج/قسم؛ بلا صورة ← أيقونة القسم على خلفية الآجُر الخفيفة (بديل بهوية رقيم) */
export function ProductImage({ imageKey, categoryId, width, radiusPx = 16, style, iconSize, contentFit = 'cover' }: {
  imageKey: string | null | undefined; categoryId?: string | null; width: number; radiusPx?: number;
  style?: StyleProp<ViewStyle>; iconSize?: number; contentFit?: 'cover' | 'contain';
}) {
  const { c } = useTheme();
  const { data: cats } = useCategories();
  const url = env.mediaBase || /^https?:/.test(imageKey ?? '') ? mediaUrl(imageKey, pickSize(width), env.mediaBase) : null;
  if (url) {
    // الصورة الصغيرة تظهر أولاً ضبابية، ثم المقاس المناسب فوقها
    const thumb = mediaUrl(imageKey, 'sm', env.mediaBase);
    return (
      <Image source={{ uri: url }} placeholder={thumb && thumb !== url ? { uri: thumb } : undefined} placeholderContentFit="cover"
        transition={180} contentFit={contentFit} recyclingKey={imageKey ?? undefined}
        style={[{ width: '100%', aspectRatio: 1, borderRadius: radiusPx, backgroundColor: c.sunken }, style as object]} />
    );
  }
  const cat = cats?.find((x) => x.id === categoryId);
  const parent = cat?.parent_id ? cats?.find((x) => x.id === cat.parent_id) : null;
  const icon = isIcon(cat?.icon) ? cat.icon : isIcon(parent?.icon) ? parent.icon : 'box';
  return (
    <View style={[{ width: '100%', aspectRatio: 1, borderRadius: radiusPx, backgroundColor: c.accentSoft, alignItems: 'center', justifyContent: 'center' }, style]}>
      <Icon name={icon} size={iconSize ?? Math.round(width * 0.3)} color={c.accent} strokeWidth={1.4} />
    </View>
  );
}

/** نقش أسافين مسمارية خفيف (٤٪) — للبطل والبانرات النصية فقط */
export function WedgePattern({ color, opacity = 0.06 }: { color: string; opacity?: number }) {
  const wedges: [number, number, number][] = [];
  for (let row = 0; row < 5; row++) for (let col = 0; col < 9; col++) wedges.push([col * 44 + (row % 2) * 22, row * 40, (row * 3 + col) % 4]);
  return (
    <Svg width="100%" height="100%" style={{ position: 'absolute' }} viewBox="0 0 400 200" preserveAspectRatio="xMidYMid slice" pointerEvents="none">
      {wedges.map(([x, y, k], i) => (
        <Path key={i} d={`M${x} ${y}h12l-4.5 6c0 5-2 8-7.5 9c3.5-2 4.5-5 4.5-9z`} fill={color} opacity={opacity * (k === 0 ? 1.6 : 1)}
          transform={`rotate(${k * 90 - 45} ${x + 6} ${y + 7})`} />
      ))}
    </Svg>
  );
}
