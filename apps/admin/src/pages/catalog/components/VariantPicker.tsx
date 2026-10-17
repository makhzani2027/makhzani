import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { cleanScan } from '@raqeem/shared';
import { Icon, Thumb, toast } from '../../../ui';
import { useDebounced } from '../../../lib/hooks';
import { useFmt } from '../../../lib/settings';
import { beep, useBarcodeScanner } from '../../../lib/scanner';
import { errorMessage } from '../../../lib/supabase';
import { findVariantByCode, searchVariants, type VariantHit } from '../api';

/**
 * حقل «ابحث أو امسح»: يكتب الموظف اسماً أو SKU فتظهر النتائج، أو يمسح بالقارئ فيُضاف المنتج فوراً.
 * scan=true يلتقط القارئ من أي مكان في الصفحة (حتى والمؤشر خارج الحقل).
 */
export const VariantPicker = forwardRef<HTMLInputElement | null, {
  onPick: (h: VariantHit) => void;
  placeholder?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  scan?: boolean;
  size_?: 'md' | 'lg';
  showStock?: boolean;
}>(function VariantPicker({ onPick, placeholder = 'ابحث بالاسم أو SKU، أو امسح الباركود…', autoFocus, disabled, scan = true, size_ = 'lg', showStock = true }, ref) {
  const fmt = useFmt();
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<VariantHit[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState(false);
  const dq = useDebounced(q, 160);
  const input = useRef<HTMLInputElement>(null);
  const box = useRef<HTMLDivElement>(null);
  useImperativeHandle(ref, () => input.current as HTMLInputElement);

  useEffect(() => {
    const term = dq.trim();
    if (term.length < 2) { setHits([]); return; }
    let alive = true;
    setBusy(true);
    searchVariants(term, 10).then((h) => { if (alive) { setHits(h); setActive(0); setOpen(true); } }).catch(() => undefined).finally(() => alive && setBusy(false));
    return () => { alive = false; };
  }, [dq]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const pick = (h: VariantHit) => {
    onPick(h);
    setQ('');
    setHits([]);
    setOpen(false);
    input.current?.focus();
  };

  /** رمز ممسوح أو مكتوب كاملاً */
  const byCode = async (raw: string): Promise<boolean> => {
    const code = cleanScan(raw);
    if (!code) return false;
    try {
      const h = await findVariantByCode(code);
      if (h) { beep('ok'); pick(h); return true; }
    } catch (e) {
      toast.error(errorMessage(e));
      return true;
    }
    return false;
  };

  useBarcodeScanner((code) => {
    void byCode(code).then((ok) => { if (!ok) { beep('error'); toast.error(`لم نجد منتجاً بالرمز ${code}`); } });
  }, { enabled: scan && !disabled });

  const onEnter = async () => {
    if (await byCode(q)) return;
    if (hits[active]) pick(hits[active]);
    else if (q.trim()) {
      const h = await searchVariants(q, 10).catch(() => []);
      if (h.length === 1) pick(h[0]);
      else if (h.length) { setHits(h); setOpen(true); }
      else { beep('error'); toast.error('لا نتائج. جرّب كلمة أخرى أو رمز SKU.'); }
    }
  };

  return (
    <div className="vpick" ref={box}>
      <span className="input-wrap">
        <Icon name={busy ? 'refresh' : 'scan'} size={19} />
        <input
          ref={input} className={`input ${size_ === 'lg' ? 'lg' : ''}`} value={q} placeholder={placeholder} autoFocus={autoFocus} disabled={disabled}
          aria-label={placeholder} aria-autocomplete="list" aria-expanded={open} role="combobox" data-scan-target="clear"
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => hits.length && setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, hits.length - 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
            else if (e.key === 'Enter') { e.preventDefault(); void onEnter(); }
            else if (e.key === 'Escape') { if (open) { e.stopPropagation(); setOpen(false); } else setQ(''); }
          }}
        />
      </span>
      {open && hits.length ? (
        <div className="vpick-list" role="listbox">
          {hits.map((h, i) => (
            <div key={h.variant_id} role="option" aria-selected={i === active} className={`vpick-item ${i === active ? 'on' : ''}`} onMouseEnter={() => setActive(i)} onMouseDown={(e) => { e.preventDefault(); pick(h); }}>
              <Thumb imageKey={h.cover_key} size="sm" />
              <div className="grow">
                <div className="truncate" style={{ fontWeight: 700 }}>{h.name}{h.title ? <span className="dim"> — {h.title}</span> : null}</div>
                <div className="small faint row nowrap" style={{ gap: 8 }}><span className="code">{h.sku}</span>{h.barcode ? <span className="code">{h.barcode}</span> : null}</div>
              </div>
              <div className="small" style={{ textAlign: 'end', lineHeight: 1.4 }}>
                <div className="money">{fmt.money(h.price)}</div>
                {showStock ? <div className={h.available_qty <= 0 ? 'qty-neg' : 'faint'}>{fmt.qty(h.available_qty)} متاح</div> : null}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
});
