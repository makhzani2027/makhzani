import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react';
import { errorMessage } from './supabase';
import { toast } from '../ui/toast';

export interface Loaded<T> {
  data: T | undefined;
  error: string | null;
  loading: boolean;
  reload: () => Promise<void>;
  setData: (fn: T | ((prev: T | undefined) => T)) => void;
}

/**
 * يحمّل بيانات عند تغيّر deps. البيانات السابقة تبقى ظاهرة أثناء إعادة التحميل (بلا وميض)،
 * والطلب الأقدم يُتجاهل إن وصل بعد الأحدث.
 */
export function useLoad<T>(fn: () => Promise<T>, deps: DependencyList): Loaded<T> {
  const [data, setDataState] = useState<T | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const reload = useCallback(async () => {
    const my = ++seq.current;
    setLoading(true);
    try {
      const d = await fnRef.current();
      if (my === seq.current) {
        setDataState(d);
        setError(null);
      }
    } catch (e) {
      if (my === seq.current) setError(errorMessage(e));
    } finally {
      if (my === seq.current) setLoading(false);
    }
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => void reload(), deps);

  const setData = useCallback((v: T | ((prev: T | undefined) => T)) => {
    setDataState((prev) => (typeof v === 'function' ? (v as (p: T | undefined) => T)(prev) : v));
  }, []);

  return { data, error, loading, reload, setData };
}

/**
 * ينفّذ عملية (حفظ، حذف…) مع حالة تحميل، ويعرض الخطأ كإشعار عربي تلقائياً.
 * يعيد النتيجة أو undefined عند الفشل.
 */
export function useAction<A extends unknown[], R>(fn: (...args: A) => Promise<R>, opts: { success?: string } = {}) {
  const [busy, setBusy] = useState(false);
  const run = useCallback(
    async (...args: A): Promise<R | undefined> => {
      setBusy(true);
      try {
        const r = await fn(...args);
        if (opts.success) toast.success(opts.success);
        return r;
      } catch (e) {
        toast.error(errorMessage(e));
        return undefined;
      } finally {
        setBusy(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fn, opts.success],
  );
  return { run, busy };
}

export function useDebounced<T>(value: T, ms = 250): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** اختصار لوحة مفاتيح: useHotkey('F2', fn) أو useHotkey('mod+k', fn) */
export function useHotkey(combo: string, handler: (e: KeyboardEvent) => void, enabled = true) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!enabled) return;
    const parts = combo.toLowerCase().split('+');
    const key = parts[parts.length - 1];
    const mod = parts.includes('mod');
    const shift = parts.includes('shift');
    const onKey = (e: KeyboardEvent) => {
      if (mod && !(e.metaKey || e.ctrlKey)) return;
      if (shift !== e.shiftKey) return;
      if (e.key.toLowerCase() !== key && e.code.toLowerCase() !== `key${key}`) return;
      e.preventDefault();
      ref.current(e);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [combo, enabled]);
}

/** قيمة محفوظة في المتصفح (تفضيلات العرض فقط — لا بيانات أعمال) */
export function useStored<T>(key: string, initial: T): [T, (v: T) => void] {
  const [v, setV] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });
  const set = useCallback(
    (nv: T) => {
      setV(nv);
      try {
        localStorage.setItem(key, JSON.stringify(nv));
      } catch {
        /* التخزين غير متاح (وضع خاص) */
      }
    },
    [key],
  );
  return [v, set];
}
