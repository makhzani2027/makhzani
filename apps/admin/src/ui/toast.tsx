import { useEffect, useState } from 'react';
import { Icon } from './Icon';

type ToastKind = 'info' | 'success' | 'error';
interface ToastItem { id: number; kind: ToastKind; text: string; action?: { label: string; run: () => void } }

let items: ToastItem[] = [];
let seq = 0;
const subs = new Set<(t: ToastItem[]) => void>();
const emit = () => subs.forEach((f) => f(items));

function push(kind: ToastKind, text: string, action?: ToastItem['action'], ms = kind === 'error' ? 6000 : 3200) {
  // الرسالة نفسها مرتين متتاليتين (ضغط مزدوج) تُعرض مرة واحدة
  if (items.some((t) => t.kind === kind && t.text === text)) return;
  const id = ++seq;
  items = [...items.slice(-3), { id, kind, text, action }];
  emit();
  setTimeout(() => { items = items.filter((t) => t.id !== id); emit(); }, ms);
}

/** إشعار منبثق قصير. toast.success('تم الحفظ') — بلا علامات تعجب */
export const toast = {
  info: (text: string, action?: ToastItem['action']) => push('info', text, action),
  success: (text: string, action?: ToastItem['action']) => push('success', text, action),
  error: (text: string) => push('error', text),
};

export function Toaster() {
  const [list, setList] = useState<ToastItem[]>(items);
  useEffect(() => { subs.add(setList); return () => { subs.delete(setList); }; }, []);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {list.map((t) => (
        <div key={t.id} className={`toast ${t.kind}`}>
          <Icon name={t.kind === 'error' ? 'alert' : t.kind === 'success' ? 'checkCircle' : 'info'} size={18} />
          <span>{t.text}</span>
          {t.action ? <button type="button" onClick={() => { t.action!.run(); items = items.filter((x) => x.id !== t.id); emit(); }}>{t.action.label}</button> : null}
        </div>
      ))}
    </div>
  );
}
