import { useEffect, useState, type ReactNode } from 'react';
import { Modal } from './Modal';
import { Button } from './Button';
import { Icon, type IconName } from './Icon';
import { Input } from './form';

/**
 * نوافذ تأكيد وإدخال بتصميم رقيم بدل confirm/prompt المتصفح.
 *   if (await askConfirm({ title: 'حذف المنتج؟', danger: true })) …
 *   const reason = await askText({ title: 'سبب الإلغاء', required: true })
 *   askConfirm({ typeToConfirm: 'حذف' }) ← يجب كتابة الكلمة للعمليات الخطرة
 */
interface ConfirmOpts { title: string; body?: ReactNode; confirm?: string; cancel?: string; danger?: boolean; icon?: IconName; typeToConfirm?: string }
interface TextOpts { title: string; body?: ReactNode; label?: string; placeholder?: string; initial?: string; confirm?: string; required?: boolean; multiline?: boolean }

type Req = { kind: 'confirm'; opts: ConfirmOpts; resolve: (v: boolean) => void } | { kind: 'text'; opts: TextOpts; resolve: (v: string | null) => void };
let setReq: ((r: Req | null) => void) | null = null;
const queue: Req[] = [];

function next() { if (setReq && queue.length) setReq(queue.shift()!); }

export function askConfirm(opts: ConfirmOpts): Promise<boolean> {
  return new Promise((resolve) => { queue.push({ kind: 'confirm', opts, resolve }); next(); });
}
export function askText(opts: TextOpts): Promise<string | null> {
  return new Promise((resolve) => { queue.push({ kind: 'text', opts, resolve }); next(); });
}

export function DialogHost() {
  const [req, set] = useState<Req | null>(null);
  const [text, setText] = useState('');
  useEffect(() => { setReq = (r) => { set(r); setText(r?.kind === 'text' ? r.opts.initial ?? '' : ''); }; next(); return () => { setReq = null; }; }, []);
  if (!req) return null;
  const close = (v: boolean | string | null) => {
    if (req.kind === 'confirm') req.resolve(v === true);
    else req.resolve(typeof v === 'string' ? v : null);
    set(null);
    setTimeout(next, 0);
  };
  const o = req.opts;
  const danger = req.kind === 'confirm' && req.opts.danger;
  const typed = req.kind === 'confirm' && req.opts.typeToConfirm;
  const okDisabled = (typed && text.trim() !== req.opts.typeToConfirm) || (req.kind === 'text' && req.opts.required && !text.trim());
  const submit = () => { if (!okDisabled) close(req.kind === 'confirm' ? true : text.trim()); };
  return (
    <Modal open onClose={() => close(req.kind === 'confirm' ? false : null)} className="dialog"
      footer={<>
        <Button variant={danger ? 'danger-solid' : 'primary'} size="lg" onClick={submit} disabled={!!okDisabled}>{o.confirm ?? (danger ? 'نعم، تابع' : 'تأكيد')}</Button>
        <Button size="lg" onClick={() => close(req.kind === 'confirm' ? false : null)}>{req.kind === 'confirm' ? req.opts.cancel ?? 'تراجع' : 'إلغاء'}</Button>
      </>}>
      <span className={`dialog-icon ${danger ? 'danger' : ''}`}><Icon name={req.kind === 'confirm' ? req.opts.icon ?? (danger ? 'alert' : 'help') : 'edit'} size={26} /></span>
      <h2 style={{ fontSize: 20 }}>{o.title}</h2>
      {o.body ? <div className="dim">{o.body}</div> : null}
      {req.kind === 'text' ? (
        req.opts.multiline
          ? <textarea className="textarea" autoFocus value={text} placeholder={req.opts.placeholder} onChange={(e) => setText(e.target.value)} aria-label={req.opts.label ?? o.title} />
          : <Input autoFocus value={text} placeholder={req.opts.placeholder} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} aria-label={req.opts.label ?? o.title} />
      ) : typed ? (
        <Input autoFocus value={text} placeholder={`اكتب «${req.opts.typeToConfirm}» للتأكيد`} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && submit()} aria-label="كلمة التأكيد" />
      ) : null}
    </Modal>
  );
}
