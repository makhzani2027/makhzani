import { useEffect, useState } from 'react';
import { Alert, Button, Field, Modal, NumberInput, Segmented, Select, Textarea, Thumb } from '../../../ui';
import { useAction, useLoad } from '../../../lib/hooks';
import { useFmt } from '../../../lib/settings';
import { useCounts } from '../../../lib/counts';
import { VariantPicker } from '../../catalog/components/VariantPicker';
import { adjustStock, levelOf, listWarehouses } from '../api';

export interface AdjustTarget { variant_id: string; name: string; title: string | null; sku: string; cover_key?: string | null }

const REASONS = ['جرد سريع', 'تالف أثناء النقل', 'كسر في المخزن', 'مفقود', 'تصحيح خطأ إدخال', 'عيّنة عرض'];

/**
 * تعديل سريع للرصيد: «اضبط على» (الكمية الصحيحة كما عُدّت) أو «أضف/اخصم»، بنوع تعديل أو تالف، والسبب إلزامي.
 * ← adjust_stock
 */
export function AdjustModal({ open, onClose, onDone, target, warehouseId }: {
  open: boolean; onClose: () => void; onDone?: () => void; target?: AdjustTarget | null; warehouseId?: string;
}) {
  const fmt = useFmt();
  const counts = useCounts();
  const whs = useLoad(() => listWarehouses(), []);
  const [item, setItem] = useState<AdjustTarget | null>(target ?? null);
  const [wh, setWh] = useState(warehouseId ?? '');
  const [mode, setMode] = useState<'set' | 'delta'>('set');
  const [kind, setKind] = useState<'adjustment' | 'damage'>('adjustment');
  const [qty, setQty] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [tried, setTried] = useState(false);
  const level = useLoad(() => (item && wh ? levelOf(item.variant_id, wh) : Promise.resolve(null)), [item?.variant_id, wh, open]);
  const save = useAction(adjustStock, { success: 'تم تعديل الرصيد' });

  useEffect(() => {
    if (!open) return;
    setItem(target ?? null); setWh(warehouseId ?? ''); setMode('set'); setKind('adjustment'); setQty(null); setNote(''); setTried(false);
  }, [open, target, warehouseId]);
  useEffect(() => { if (open && !wh && whs.data?.length) setWh((whs.data.find((w) => w.is_default) ?? whs.data[0]).id); }, [open, wh, whs.data]);
  // التالف دائماً خصم
  useEffect(() => { if (kind === 'damage') setMode('delta'); }, [kind]);

  const cur = level.data?.qty ?? 0;
  const delta = qty === null ? 0 : mode === 'set' ? qty - cur : kind === 'damage' ? -Math.abs(qty) : qty;
  const after = cur + delta;
  const errors = {
    item: !item ? 'اختر المنتج' : null,
    qty: qty === null ? 'اكتب الكمية' : mode === 'set' && qty < 0 ? 'الكمية لا تكون سالبة' : delta === 0 ? 'لا تغيير على الرصيد' : null,
    note: !note.trim() ? 'السبب إلزامي حتى يبقى السجل واضحاً' : null,
    after: after < 0 ? 'الرصيد سيصير سالباً' : null,
  };
  const valid = !errors.item && !errors.qty && !errors.note && !errors.after;

  const submit = async () => {
    setTried(true);
    if (!valid || !item) return;
    const r = await save.run({ variant_id: item.variant_id, warehouse_id: wh, mode, qty: mode === 'delta' && kind === 'damage' ? -Math.abs(qty ?? 0) : qty ?? 0, kind, note: note.trim() });
    if (r !== undefined) { counts.refresh(); onDone?.(); onClose(); }
  };

  return (
    <Modal open={open} onClose={onClose} title="تعديل الرصيد" subtitle="كل تعديل يُسجَّل حركةً باسمك ولا يُحذف." width={560}
      footer={<>
        <Button variant="primary" size="lg" loading={save.busy} onClick={submit}>حفظ التعديل</Button>
        <Button size="lg" onClick={onClose}>إلغاء</Button>
      </>}>
      {item ? (
        <div className="row nowrap" style={{ gap: 12 }}>
          <Thumb imageKey={item.cover_key} />
          <div className="grow">
            <b className="truncate" style={{ display: 'block' }}>{item.name}{item.title ? <span className="dim"> — {item.title}</span> : null}</b>
            <span className="code faint">{item.sku}</span>
          </div>
          {!target ? <Button size="sm" variant="ghost" onClick={() => setItem(null)}>تغيير</Button> : null}
        </div>
      ) : (
        <Field label="المنتج" error={tried ? errors.item : null}>
          <VariantPicker size_="md" autoFocus onPick={(h) => setItem({ variant_id: h.variant_id, name: h.name, title: h.title || null, sku: h.sku, cover_key: h.cover_key })} />
        </Field>
      )}
      <div className="grid-2">
        <Field label="المخزن">
          <Select value={wh} onChange={(e) => setWh(e.target.value)} options={(whs.data ?? []).map((w) => ({ value: w.id, label: w.name }))} />
        </Field>
        <Field label="نوع الحركة">
          <Segmented value={kind} onChange={setKind} label="نوع الحركة" options={[{ value: 'adjustment', label: 'تعديل' }, { value: 'damage', label: 'تالف / مفقود' }]} />
        </Field>
      </div>
      <div className="grid-2">
        <Field label="الطريقة">
          <Segmented value={mode} onChange={(m) => kind !== 'damage' && setMode(m)} label="الطريقة" options={[{ value: 'set', label: 'اضبط على' }, { value: 'delta', label: kind === 'damage' ? 'اخصم' : 'أضف / اخصم' }]} />
        </Field>
        <Field label={mode === 'set' ? 'الكمية الصحيحة' : kind === 'damage' ? 'الكمية التالفة' : 'الكمية (سالب للخصم)'} error={tried ? errors.qty ?? errors.after : errors.after}>
          <NumberInput value={qty} onChange={setQty} allowDecimal min={mode === 'set' || kind === 'damage' ? 0 : undefined} autoFocus={!!target} onEnter={submit} />
        </Field>
      </div>
      {item && wh ? (
        <div className="preview-box row between">
          <span className="dim">الرصيد الحالي <b className="num">{level.loading && !level.data ? '…' : fmt.qty(cur)}</b></span>
          <span className="dim">التغيير <b className={delta > 0 ? 'qty-pos' : delta < 0 ? 'qty-neg' : ''}>{delta > 0 ? '+' : ''}{fmt.qty(delta)}</b></span>
          <span className="dim">بعد التعديل <b className="num">{fmt.qty(after)}</b></span>
        </div>
      ) : null}
      {level.data && level.data.reserved > 0 ? <Alert tone="info">{fmt.qty(level.data.reserved)} محجوزة لطلبات التطبيق في هذا المخزن.</Alert> : null}
      <Field label="السبب" required error={tried ? errors.note : null}>
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} style={{ minHeight: 64 }} placeholder="مثلاً: وجدنا ٣ قطع زائدة عند الترتيب" />
      </Field>
      <div className="chips">
        {REASONS.map((r) => <button key={r} type="button" className="chip" onClick={() => setNote(r)}>{r}</button>)}
      </div>
    </Modal>
  );
}
