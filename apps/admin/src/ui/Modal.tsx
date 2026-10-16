import { useEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { IconButton } from './Button';

/** يحبس المؤشر داخل النافذة ويغلقها بـ Esc، ويعيد المؤشر لمكانه عند الإغلاق */
function useDialogBehavior(open: boolean, onClose: () => void, boxRef: React.RefObject<HTMLElement | null>) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const box = boxRef.current;
    const focusables = () => Array.from(box?.querySelectorAll<HTMLElement>('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])') ?? []).filter((el) => !el.hasAttribute('disabled'));
    requestAnimationFrame(() => {
      const auto = box?.querySelector<HTMLElement>('[autofocus],[data-autofocus]');
      (auto ?? focusables()[0] ?? box)?.focus();
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); closeRef.current(); }
      if (e.key === 'Tab') {
        const els = focusables();
        if (!els.length) return;
        const first = els[0], last = els[els.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = overflow; prev?.focus?.(); };
  }, [open, boxRef]);
}

export function Modal({ open, onClose, title, subtitle, children, footer, width, className, dismissible = true }: {
  open: boolean; onClose: () => void; title?: ReactNode; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode;
  width?: number; className?: string; dismissible?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useDialogBehavior(open, () => dismissible && onClose(), ref);
  if (!open) return null;
  return createPortal(
    <div className="modal-back" onMouseDown={(e) => { if (dismissible && e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} className={`modal ${className ?? ''}`} role="dialog" aria-modal="true" tabIndex={-1} style={width ? ({ '--w': `${width}px` } as React.CSSProperties) : undefined}>
        {title ? (
          <div className="modal-head">
            <div className="grow"><h2>{title}</h2>{subtitle ? <p className="dim small">{subtitle}</p> : null}</div>
            {dismissible ? <IconButton icon="close" label="إغلاق" onClick={onClose} /> : null}
          </div>
        ) : null}
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-foot">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}

export function Drawer({ open, onClose, title, children, footer, width }: { open: boolean; onClose: () => void; title?: ReactNode; children: ReactNode; footer?: ReactNode; width?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useDialogBehavior(open, onClose, ref);
  if (!open) return null;
  return createPortal(
    <>
      <div className="drawer-back" onMouseDown={onClose} />
      <div ref={ref} className="drawer" role="dialog" aria-modal="true" tabIndex={-1} style={width ? ({ '--w': `${width}px` } as React.CSSProperties) : undefined}>
        <div className="modal-head" style={{ borderBottom: '1px solid var(--line)', paddingBottom: 14 }}>
          <h2 className="grow">{title}</h2>
          <IconButton icon="close" label="إغلاق" onClick={onClose} />
        </div>
        <div className="modal-body" style={{ flex: 1, paddingTop: 16 }}>{children}</div>
        {footer ? <div className="modal-foot">{footer}</div> : null}
      </div>
    </>,
    document.body,
  );
}
