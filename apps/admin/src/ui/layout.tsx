import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { stockState, type Tone } from '@raqeem/shared';
import { useFmt } from '../lib/settings';
import { Icon, type IconName } from './Icon';
import { Button } from './Button';

/** رأس كل صفحة: عنوان + وصف + إجراءات. crumbs للصفحات الداخلية */
export function PageHeader({ title, description, actions, crumbs, eyebrow }: {
  title: ReactNode; description?: ReactNode; actions?: ReactNode; crumbs?: { label: string; to?: string }[]; eyebrow?: ReactNode;
}) {
  return (
    <header className="page-head">
      <div className="titles">
        {crumbs?.length ? (
          <nav className="crumbs" aria-label="المسار">
            {crumbs.map((c, i) => (
              <span key={i} className="row" style={{ gap: 6 }}>
                {c.to ? <Link to={c.to}>{c.label}</Link> : <span>{c.label}</span>}
                {i < crumbs.length - 1 ? <Icon name="chevronLeft" size={14} /> : null}
              </span>
            ))}
          </nav>
        ) : null}
        {eyebrow ? <div className="eyebrow">{eyebrow}</div> : null}
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {actions ? <div className="actions">{actions}</div> : null}
    </header>
  );
}

export function Card({ title, icon, actions, children, className, flush, tone }: {
  title?: ReactNode; icon?: IconName; actions?: ReactNode; children?: ReactNode; className?: string; flush?: boolean; tone?: 'hero' | 'accent' | 'sunken';
}) {
  return (
    <section className={`card ${flush ? 'flush' : ''} ${tone ?? ''} ${className ?? ''}`}>
      {title || actions ? (
        <div className="card-head">
          <h3>{icon ? <Icon name={icon} size={18} /> : null}{title}</h3>
          {actions ? <div className="row" style={{ gap: 6 }}>{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function Stat({ label, value, unit, icon, foot, delta, tone }: {
  label: ReactNode; value: ReactNode; unit?: ReactNode; icon?: IconName; foot?: ReactNode; delta?: { value: string; up: boolean } | null; tone?: 'hero' | 'accent';
}) {
  return (
    <div className={`card ${tone ?? ''}`}>
      <div className="stat">
        <span className="label">{icon ? <Icon name={icon} size={16} /> : null}{label}</span>
        <span className="value">{value}{unit ? <small>{unit}</small> : null}</span>
        {foot || delta ? (
          <span className="foot">
            {delta ? <span className={`delta ${delta.up ? 'up' : 'down'}`}><Icon name={delta.up ? 'trendUp' : 'trendDown'} size={13} />{delta.value}</span> : null}
            {foot}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export function Badge({ tone = 'neutral', children, plain, title }: { tone?: Tone; children: ReactNode; plain?: boolean; title?: string }) {
  return <span className={`badge ${tone} ${plain ? 'plain' : ''}`} title={title}>{children}</span>;
}

/** شارة حالة المخزون (نفد/قليل/متوفر) */
export function StockBadge({ qty, min = 0, label }: { qty: number; min?: number; label?: string }) {
  const s = stockState(qty, min);
  return <Badge tone={s.tone}>{label ?? s.label}</Badge>;
}

export function EmptyState({ icon = 'box', title, text, action }: { icon?: IconName; title: string; text?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <span className="art"><Icon name={icon} size={34} stroke={1.5} /></span>
      <h3>{title}</h3>
      {text ? <p>{text}</p> : null}
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="empty">
      <span className="art" style={{ background: 'var(--danger-bg)', color: 'var(--danger)' }}><Icon name="alert" size={30} /></span>
      <h3>تعذّر التحميل</h3>
      <p>{message}</p>
      {onRetry ? <Button icon="refresh" onClick={onRetry}>إعادة المحاولة</Button> : null}
    </div>
  );
}

export function Loading({ label = 'جارٍ التحميل…' }: { label?: string }) {
  return <div className="center-page" role="status"><span className="spinner" /><span className="sr-only">{label}</span></div>;
}

export function Skeleton({ h = 16, w = '100%', r }: { h?: number; w?: number | string; r?: number }) {
  return <span className="skeleton" style={{ display: 'block', height: h, width: w, borderRadius: r }} />;
}

export function Alert({ tone = 'info', children, icon }: { tone?: 'info' | 'warning' | 'danger' | 'success'; children: ReactNode; icon?: IconName }) {
  return (
    <div className={`alert ${tone}`} role={tone === 'danger' ? 'alert' : undefined}>
      <Icon name={icon ?? (tone === 'success' ? 'checkCircle' : tone === 'info' ? 'info' : 'alert')} size={18} />
      <div>{children}</div>
    </div>
  );
}

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { value: T; label: ReactNode; count?: number | null; icon?: IconName }[] }) {
  const fmt = useFmt();
  return (
    <div className="tabs" role="tablist">
      {items.map((t) => (
        <button key={t.value} type="button" role="tab" aria-selected={value === t.value} className={value === t.value ? 'on' : ''} onClick={() => onChange(t.value)}>
          {t.icon ? <Icon name={t.icon} size={17} /> : null}
          {t.label}
          {t.count !== undefined && t.count !== null ? <span className="count">{fmt.num(t.count)}</span> : null}
        </button>
      ))}
    </div>
  );
}

export function Chips<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: { value: T; label: ReactNode }[] }) {
  return (
    <div className="chips">
      {items.map((t) => <button key={t.value} type="button" className={`chip ${value === t.value ? 'on' : ''}`} aria-pressed={value === t.value} onClick={() => onChange(t.value)}>{t.label}</button>)}
    </div>
  );
}

export function Pagination({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const fmt = useFmt();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <div className="pager">
      <Button size="sm" icon="chevronRight" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="السابق" />
      <span className="small dim num">{fmt.num(page)} من {fmt.num(pages)}</span>
      <Button size="sm" icon="chevronLeft" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="التالي" />
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <span className="kbd">{children}</span>;
}
