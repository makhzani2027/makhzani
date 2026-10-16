import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon, type IconName } from './Icon';

export interface MenuItem { label: ReactNode; icon?: IconName; onClick?: () => void; danger?: boolean; disabled?: boolean; divider?: boolean; href?: string }

/** قائمة منسدلة تُفتح من أي زر: <Menu trigger={(open) => <IconButton … onClick={open} />} items={[…]} /> */
export function Menu({ trigger, items, align = 'end' }: { trigger: (open: (e: React.MouseEvent) => void) => ReactNode; items: MenuItem[]; align?: 'start' | 'end' }) {
  const [pos, setPos] = useState<{ x: number; y: number; w: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const open = (e: React.MouseEvent) => {
    e.stopPropagation();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    setPos({ x: align === 'end' ? r.left : r.right, y: r.bottom + 6, w: r.width });
  };
  useLayoutEffect(() => {
    if (!pos || !ref.current) return;
    const box = ref.current.getBoundingClientRect();
    // لا تخرج القائمة من الشاشة
    const x = Math.min(Math.max(8, align === 'end' ? pos.x : pos.x - box.width), window.innerWidth - box.width - 8);
    const y = pos.y + box.height > window.innerHeight - 8 ? pos.y - box.height - 44 : pos.y;
    ref.current.style.left = `${x}px`;
    ref.current.style.top = `${Math.max(8, y)}px`;
  }, [pos, align]);
  useEffect(() => {
    if (!pos) return;
    const close = () => setPos(null);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('mousedown', close);
    window.addEventListener('scroll', close, true);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('mousedown', close); window.removeEventListener('scroll', close, true); window.removeEventListener('keydown', onKey); };
  }, [pos]);
  return (
    <>
      {trigger(open)}
      {pos ? createPortal(
        <div ref={ref} className="menu" role="menu" style={{ left: pos.x, top: pos.y }} onMouseDown={(e) => e.stopPropagation()}>
          {items.map((it, i) => it.divider ? <hr key={i} /> : it.href ? (
            <a key={i} role="menuitem" href={it.href} target="_blank" rel="noreferrer" onClick={() => setPos(null)}>{it.icon ? <Icon name={it.icon} size={17} /> : null}{it.label}</a>
          ) : (
            <button key={i} type="button" role="menuitem" className={it.danger ? 'danger' : ''} disabled={it.disabled} onClick={() => { setPos(null); it.onClick?.(); }}>
              {it.icon ? <Icon name={it.icon} size={17} /> : null}{it.label}
            </button>
          ))}
        </div>, document.body) : null}
    </>
  );
}
