import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { formatMoney, type Category, type CurrencyCode } from '@raqeem/shared';
import { useFmt } from '../../../lib/settings';
import { useLoad } from '../../../lib/hooks';
import { askConfirm } from '../../../ui';
import { listBrands, listCategories } from '../api';
import { listWarehouses } from '../../inventory/api';

/** الأقسام والعلامات والمخازن (قوائم الاختيار في أغلب الصفحات) */
export function useCatalogMeta() {
  const cats = useLoad(listCategories, []);
  const brands = useLoad(listBrands, []);
  const whs = useLoad(() => listWarehouses(), []);
  return {
    categories: cats.data ?? [],
    brands: brands.data ?? [],
    warehouses: whs.data ?? [],
    loading: cats.loading || brands.loading || whs.loading,
    error: cats.error ?? brands.error ?? whs.error,
    reload: () => { void cats.reload(); void brands.reload(); void whs.reload(); },
    reloadCategories: cats.reload,
    reloadBrands: brands.reload,
  };
}

/** خيارات القسم مرتبة كشجرة: الرئيسي ثم فروعه بإزاحة */
export function categoryOptions(cats: Category[]): { value: string; label: string }[] {
  const roots = cats.filter((c) => !c.parent_id).sort((a, b) => a.sort - b.sort);
  return roots.flatMap((r) => [
    { value: r.id, label: r.name },
    ...cats.filter((c) => c.parent_id === r.id).sort((a, b) => a.sort - b.sort).map((c) => ({ value: c.id, label: `\u00A0\u00A0\u00A0↳ ${c.name}` })),
  ]);
}

/**
 * حارس التغييرات غير المحفوظة: يمنع إغلاق التبويب، ويعترض روابط اللوحة الداخلية بنافذة تأكيد.
 * (اللوحة تستعمل BrowserRouter فلا يتوفر useBlocker؛ نعترض النقرات على الروابط بدلاً منه.)
 */
export function useUnsavedGuard(dirty: boolean) {
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const bypass = useRef(false);

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return;
      e.preventDefault();
      e.returnValue = '';
    };
    const onClick = (e: MouseEvent) => {
      if (!dirtyRef.current || bypass.current || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as HTMLElement | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a || a.target === '_blank' || a.origin !== window.location.origin) return;
      if (a.pathname === window.location.pathname && a.search === window.location.search) return;
      e.preventDefault();
      e.stopPropagation();
      void askLeave().then((ok) => {
        if (!ok) return;
        bypass.current = true;
        a.click();
        bypass.current = false;
      });
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    document.addEventListener('click', onClick, true);
    return () => { window.removeEventListener('beforeunload', onBeforeUnload); document.removeEventListener('click', onClick, true); };
  }, []);

  /** للتنقل البرمجي (زر «إلغاء»…): يعيد true إن سُمح بالمغادرة */
  return useCallback(async () => (dirtyRef.current ? askLeave() : true), []);
}

const askLeave = () => askConfirm({ title: 'لديك تغييرات لم تُحفظ', body: 'إن غادرت الآن ستضيع هذه التغييرات.', confirm: 'مغادرة بلا حفظ', cancel: 'البقاء هنا', danger: true });

/** حالة فلاتر محفوظة في رابط الصفحة (حتى يعمل «رجوع» ومشاركة الرابط) */
export function useQueryState<T extends Record<string, string>>(defaults: T): [T, (patch: Partial<T>) => void] {
  const [sp, setSp] = useSearchParams();
  const value = useMemo(() => {
    const out = { ...defaults };
    for (const k of Object.keys(defaults) as (keyof T)[]) {
      const v = sp.get(k as string);
      if (v !== null) out[k] = v as T[keyof T];
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sp]);
  const set = useCallback((patch: Partial<T>) => {
    setSp((prev) => {
      const next = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(patch)) {
        if (v === undefined || v === '' || v === defaults[k]) next.delete(k);
        else next.set(k, String(v));
      }
      return next;
    }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setSp]);
  return [value, set];
}

/** تنسيق مبلغ بعملة مستنده (الدينار أو الدولار) بشكل أرقام المتجر */
export function useMoneyIn() {
  const fmt = useFmt();
  return useCallback((n: number | null | undefined, currency: CurrencyCode = 'IQD', bare = false) => formatMoney(n, { currency, digits: fmt.digits, bare }), [fmt.digits]);
}
