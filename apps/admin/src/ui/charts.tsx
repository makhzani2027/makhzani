/**
 * رسوم بيانية SVG خفيفة بألوان الهوية (بلا مكتبة). تعرض نفسها على عرض الحاوية.
 * الألوان من --c1..--c6 (طين، لازورد، نخيل، زعفران، رمادي، نبيذي).
 */
import { useMemo, useState, type ReactNode } from 'react';

const COLORS = ['var(--c1)', 'var(--c2)', 'var(--c3)', 'var(--c4)', 'var(--c5)', 'var(--c6)'];
export const chartColor = (i: number) => COLORS[i % COLORS.length];

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}

export interface Series { name: string; values: number[]; color?: string }

/** أعمدة (مجمّعة إن تعددت السلاسل). labels تحت المحور، format للقيم */
export function BarChart({ labels, series, height = 220, format = (v) => String(v), tooltip }: {
  labels: string[]; series: Series[]; height?: number; format?: (v: number) => string; tooltip?: (i: number) => ReactNode;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 640, H = height, padL = 8, padR = 56, padT = 10, padB = 26;
  const max = niceMax(Math.max(1, ...series.flatMap((s) => s.values)));
  const n = labels.length || 1;
  const band = (W - padL - padR) / n;
  const bw = Math.min(28, (band * 0.7) / series.length);
  const y = (v: number) => padT + (H - padT - padB) * (1 - v / max);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => max * t);
  const every = Math.ceil(n / 8);
  return (
    <div style={{ position: 'relative' }}>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ height }} role="img" aria-label="رسم بياني">
        {ticks.map((t, i) => (
          <g key={i}>
            <line className="grid-line" x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} />
            <text x={W - padR + 6} y={y(t) + 4} textAnchor="start">{format(t)}</text>
          </g>
        ))}
        {labels.map((l, i) => {
          // RTL: الأقدم يميناً
          const cx = W - padR - band * (i + 0.5);
          return (
            <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={cx - band / 2} y={padT} width={band} height={H - padT - padB} fill={hover === i ? 'var(--sunken)' : 'transparent'} rx={6} />
              {series.map((s, si) => {
                const v = s.values[i] ?? 0;
                const x = cx - (bw * series.length) / 2 + si * bw;
                return <rect key={si} x={x + 1} y={y(v)} width={bw - 2} height={Math.max(0, H - padB - y(v))} rx={4} fill={s.color ?? chartColor(si)} />;
              })}
              {i % every === 0 ? <text x={cx} y={H - 8} textAnchor="middle">{l}</text> : null}
            </g>
          );
        })}
      </svg>
      {hover !== null && tooltip ? (
        <div className="card tight" style={{ position: 'absolute', top: 0, insetInlineStart: 12, pointerEvents: 'none', boxShadow: 'var(--shadow-float)', fontSize: 13 }}>{tooltip(hover)}</div>
      ) : null}
    </div>
  );
}

/** خط/مساحة لسلسلة أو أكثر */
export function LineChart({ labels, series, height = 220, format = (v) => String(v), area = true }: { labels: string[]; series: Series[]; height?: number; format?: (v: number) => string; area?: boolean }) {
  const W = 640, H = height, padL = 8, padR = 56, padT = 12, padB = 26;
  const max = niceMax(Math.max(1, ...series.flatMap((s) => s.values)));
  const n = Math.max(1, labels.length - 1);
  const x = (i: number) => W - padR - ((W - padL - padR) * i) / n;
  const y = (v: number) => padT + (H - padT - padB) * (1 - v / max);
  const every = Math.ceil(labels.length / 8);
  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ height }} role="img" aria-label="رسم بياني">
      {[0, 0.5, 1].map((t, i) => (
        <g key={i}><line className="grid-line" x1={padL} x2={W - padR} y1={y(max * t)} y2={y(max * t)} /><text x={W - padR + 6} y={y(max * t) + 4}>{format(max * t)}</text></g>
      ))}
      {series.map((s, si) => {
        const pts = s.values.map((v, i) => `${x(i)},${y(v)}`).join(' ');
        const c = s.color ?? chartColor(si);
        return (
          <g key={si}>
            {area && si === 0 ? <polygon points={`${x(0)},${H - padB} ${pts} ${x(s.values.length - 1)},${H - padB}`} fill={c} opacity={0.12} /> : null}
            <polyline points={pts} fill="none" stroke={c} strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          </g>
        );
      })}
      {labels.map((l, i) => (i % every === 0 ? <text key={i} x={x(i)} y={H - 8} textAnchor="middle">{l}</text> : null))}
    </svg>
  );
}

/** حلقة نسب: قيم بأسماء */
export function Donut({ data, size = 160, thickness = 22, center }: { data: { label: string; value: number }[]; size?: number; thickness?: number; center?: ReactNode }) {
  const total = data.reduce((s, d) => s + Math.max(0, d.value), 0) || 1;
  const r = (size - thickness) / 2;
  const C = 2 * Math.PI * r;
  const arcs = useMemo(() => {
    let acc = 0;
    return data.map((d, i) => {
      const len = (Math.max(0, d.value) / total) * C;
      const a = { len, off: acc, color: chartColor(i) };
      acc += len;
      return a;
    });
  }, [data, total, C]);
  return (
    <div className="row nowrap" style={{ gap: 18 }}>
      <div style={{ position: 'relative', width: size, height: size, flex: 'none' }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform: 'rotate(-90deg)' }} aria-hidden="true">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--sunken)" strokeWidth={thickness} />
          {arcs.map((a, i) => (
            <circle key={i} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={a.color} strokeWidth={thickness} strokeDasharray={`${Math.max(0, a.len - 2)} ${C}`} strokeDashoffset={-a.off} />
          ))}
        </svg>
        {center ? <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>{center}</div> : null}
      </div>
      <div className="legend" style={{ flexDirection: 'column', gap: 6 }}>
        {data.map((d, i) => <span key={i}><i style={{ background: chartColor(i) }} />{d.label}</span>)}
      </div>
    </div>
  );
}

/** خط صغير داخل بطاقة مؤشر */
export function Sparkline({ values, width = 96, height = 28, color = 'var(--accent)' }: { values: number[]; width?: number; height?: number; color?: string }) {
  if (values.length < 2) return null;
  const max = Math.max(...values), min = Math.min(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => `${width - (width * i) / (values.length - 1)},${height - 2 - ((v - min) / span) * (height - 4)}`).join(' ');
  return <svg width={width} height={height} aria-hidden="true"><polyline points={pts} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" /></svg>;
}
