/** رمز رقيم: إسفين مسماري على شكل «ر» بثقب بطاقة السعر — المرجع brand/logo/mark.svg */
const GLYPH = 'M56 17H98L82.5 37.7C82.5 80 62 101.5 20 103C54 93.5 71.5 75 71.5 37.7Z';

export function Mark({ size = 32, ink = 'currentColor', hole = 'var(--accent)' }: { size?: number; ink?: string; hole?: string }) {
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} aria-hidden="true">
      <path d={GLYPH} fill={ink} stroke={ink} strokeWidth={3} strokeLinejoin="round" />
      <circle cx={77} cy={27} r={6} fill={hole} />
    </svg>
  );
}

/** أيقونة التطبيق (مربع بزوايا) */
export function AppIcon({ size = 40, tone = 'ink' }: { size?: number; tone?: 'ink' | 'brick' }) {
  const bg = tone === 'brick' ? '#C2410E' : '#121513';
  const fg = tone === 'brick' ? '#FFF7F0' : '#EDEEEC';
  const hole = tone === 'brick' ? '#121513' : '#E8622A';
  return (
    <svg viewBox="0 0 120 120" width={size} height={size} aria-hidden="true">
      <rect width="120" height="120" rx="34" fill={bg} />
      <path d={GLYPH} fill={fg} stroke={fg} strokeWidth={3} strokeLinejoin="round" />
      <circle cx={77} cy={27} r={6} fill={hole} />
    </svg>
  );
}

export function Wordmark({ size = 28 }: { size?: number }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: size * 0.3 }}>
      <Mark size={size * 1.15} />
      <b style={{ fontFamily: 'Display, serif', fontWeight: 900, fontSize: size, lineHeight: 1.3, paddingBottom: '.1em' }}>رَقيم</b>
    </span>
  );
}
