import { icons, ICON_STROKE, type IconName } from '@raqeem/shared';
import type { CSSProperties } from 'react';

/** أيقونة من مجموعة رقيم. flip: يعكس الأسهم حسب الاتجاه عند الحاجة */
export function Icon({ name, size = 20, stroke = ICON_STROKE, className, style, flip, title }: {
  name: IconName; size?: number; stroke?: number; className?: string; style?: CSSProperties; flip?: boolean; title?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={stroke}
      strokeLinecap="round" strokeLinejoin="round" className={className}
      style={flip ? { transform: 'scaleX(-1)', ...style } : style}
      aria-hidden={title ? undefined : true} role={title ? 'img' : undefined}
    >
      {title ? <title>{title}</title> : null}
      <path d={icons[name]} />
    </svg>
  );
}
export type { IconName };
