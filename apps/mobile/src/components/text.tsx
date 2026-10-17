import type { ReactNode } from 'react';
import { Text, type StyleProp, type TextStyle } from 'react-native';
import { fonts, useTheme } from '@/lib/theme';

/**
 * النص الوحيد في التطبيق. خط ثمانية: الياء الأخيرة والنقاط تنزل تحت السطر ≈٠٫٥٥–٠٫٦ من الحجم
 * والخط يعلن ٠٫٢٥ فقط، وأندرويد يقص ما يخرج عن صندوق النص. لذلك نعطي كل نص مساحة سفلية داخل صندوقه
 * (paddingBottom، لا margin سالب — الهامش السالب قصّ الكلمات في مشروع سعي).
 */
type Family = 'display' | 'sans' | 'serif';
const LINE: Record<Family, number> = { display: 1.5, sans: 1.6, serif: 1.9 };

export function lineHeightFor(size: number, family: Family = 'sans') {
  return Math.ceil(size * LINE[family]);
}
export function descentPadFor(size: number, family: Family = 'sans') {
  const room = 0.25 + (LINE[family] - 1.25) / 2;
  return Math.max(0, Math.ceil(size * (0.6 - room)));
}

export type Weight = 'regular' | 'medium' | 'bold' | 'black';
export type Variant = 'display' | 'h1' | 'h2' | 'h3' | 'body' | 'bodyStrong' | 'small' | 'micro' | 'number' | 'serif';

const VARIANTS: Record<Variant, { size: number; family: Family; weight: Weight }> = {
  display: { size: 44, family: 'display', weight: 'black' },
  h1: { size: 30, family: 'display', weight: 'black' },
  h2: { size: 23, family: 'display', weight: 'black' },
  h3: { size: 18, family: 'sans', weight: 'bold' },
  body: { size: 16, family: 'sans', weight: 'regular' },
  bodyStrong: { size: 16, family: 'sans', weight: 'bold' },
  small: { size: 13.5, family: 'sans', weight: 'regular' },
  micro: { size: 11.5, family: 'sans', weight: 'bold' },
  number: { size: 28, family: 'display', weight: 'black' },
  serif: { size: 16.5, family: 'serif', weight: 'regular' },
};

export type TextTone = 'ink' | 'ink2' | 'ink3' | 'accent' | 'inverse' | 'accentInk';

export function T({
  children, v = 'body', size, weight, color, tone = 'ink', center, lines, style, selectable, tabular, family: familyProp,
}: {
  children: ReactNode;
  v?: Variant;
  size?: number;
  weight?: Weight;
  color?: string;
  tone?: TextTone;
  center?: boolean;
  lines?: number;
  style?: StyleProp<TextStyle>;
  selectable?: boolean;
  /** أرقام بعرض ثابت (المبالغ والجداول) */
  tabular?: boolean;
  family?: Family;
}) {
  const { c } = useTheme();
  const base = VARIANTS[v];
  const fam = familyProp ?? base.family;
  const s = size ?? base.size;
  const w = weight ?? base.weight;
  const fontFamily = fam === 'display' ? (w === 'black' ? fonts.display : fonts.displayBold) : fam === 'serif' ? fonts.serif : fonts[w];
  const toneColor = { ink: c.ink, ink2: c.ink2, ink3: c.ink3, accent: c.accent, inverse: c.bg, accentInk: c.accentInk }[tone];
  return (
    <Text
      numberOfLines={lines}
      selectable={selectable}
      // تكبير خط الهاتف مسموح بحد، حتى لا يخرج النص من الأزرار والبطاقات
      maxFontSizeMultiplier={1.3}
      style={[
        {
          fontFamily,
          fontSize: s,
          lineHeight: lineHeightFor(s, fam),
          paddingBottom: descentPadFor(s, fam),
          color: color ?? toneColor,
          writingDirection: 'rtl',
        },
        center ? { textAlign: 'center' } : null,
        tabular ? { fontVariant: ['tabular-nums'] } : null,
        style,
      ]}>
      {children}
    </Text>
  );
}
