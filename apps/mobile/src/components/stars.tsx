import { useTheme } from '@/lib/theme';
import { Icon, Row } from './ui';

/** نجوم التقييم (تعبئة حتى أقرب ربع) */
export function Stars({ value, size = 15 }: { value: number; size?: number }) {
  const { c } = useTheme();
  return (
    <Row gap={1}>
      {[1, 2, 3, 4, 5].map((n) => <Icon key={n} name="star" size={size} color={c.accent} fill={value >= n - 0.25 ? c.accent : undefined} />)}
    </Row>
  );
}
