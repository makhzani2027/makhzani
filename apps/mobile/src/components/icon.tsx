import { ICON_STROKE, icons, type IconName as BaseIcon } from '@raqeem/shared';
import Svg, { Path } from 'react-native-svg';

/**
 * أيقونات رقيم من icons.ts (شبكة ٢٤، خط ١٫٧٥، أطراف مدورة).
 * الاتجاه: التطبيق من اليمين لليسار دائماً، فـ«رجوع» يشير لليمين و«التالي» لليسار.
 */
const ALIASES = {
  back: 'chevronRight',
  forward: 'chevronLeft',
  next: 'arrowLeft',
} as const satisfies Record<string, BaseIcon>;

export type IconName = BaseIcon | keyof typeof ALIASES;

export function Icon({ name, size = 22, color = '#000', strokeWidth = ICON_STROKE, fill }: {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
  /** تعبئة الشكل (القلب في المفضلة، النجوم) */
  fill?: string;
}) {
  const key = (name in ALIASES ? ALIASES[name as keyof typeof ALIASES] : name) as BaseIcon;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d={icons[key]} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" fill={fill ?? 'none'} />
    </Svg>
  );
}
