import { useEffect, useState } from 'react';
import { Alert, Button, Checkbox, Field, Modal, NumberInput, Segmented, toast } from '../../../ui';
import { useFmt } from '../../../lib/settings';
import { useLoad } from '../../../lib/hooks';
import { getLabelSize } from '../api';
import { labelCss, labelHtml, printLabels, type LabelItem, type LabelOptions } from '../labels';

/** نافذة طباعة الملصقات: عدد لكل منتج، باركود أو QR، معاينة بالمقاس الحقيقي */
export function LabelPrintModal({ open, onClose, items: initial }: { open: boolean; onClose: () => void; items: LabelItem[] }) {
  const fmt = useFmt();
  const size = useLoad(getLabelSize, []);
  const [items, setItems] = useState<LabelItem[]>(initial);
  const [mode, setMode] = useState<LabelOptions['mode']>('barcode');
  const [showName, setShowName] = useState(true);
  const [showPrice, setShowPrice] = useState(true);
  const [w, setW] = useState<number | null>(null);
  const [h, setH] = useState<number | null>(null);
  const [preview, setPreview] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (open) setItems(initial); }, [open, initial]);
  useEffect(() => { if (size.data) { setW(size.data.width_mm); setH(size.data.height_mm); } }, [size.data]);

  const dims = { width_mm: Math.max(20, w ?? 50), height_mm: Math.max(12, h ?? 25) };
  const opts: LabelOptions = { size: dims, mode, showName, showPrice, money: (n) => fmt.money(n) };
  const first = items.find((i) => i.code);
  const total = items.reduce((s, i) => s + (i.code ? i.copies : 0), 0);
  const missing = items.filter((i) => !i.code).length;

  useEffect(() => {
    if (!open || !first) { setPreview(''); return; }
    let alive = true;
    void labelHtml(first, opts).then((html) => alive && setPreview(html));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, first?.code, first?.name, mode, showName, showPrice, dims.width_mm, dims.height_mm, fmt]);

  const print = async () => {
    if (!total) return toast.error('لا ملصقات للطباعة. اكتب عدداً لمنتج واحد على الأقل.');
    setBusy(true);
    try { await printLabels(items, opts); } finally { setBusy(false); }
  };

  // معاينة مكبّرة ×٢ حتى تُقرأ بوضوح على الشاشة
  const scale = Math.min(2.2, 300 / (dims.width_mm * 3.78));

  return (
    <Modal open={open} onClose={onClose} title="طباعة ملصقات" subtitle={`${fmt.num(total)} ملصق · ${fmt.num(dims.width_mm)}×${fmt.num(dims.height_mm)} ملم`} width={760}
      footer={<>
        <Button variant="primary" size="lg" icon="printer" loading={busy} onClick={print} disabled={!total}>طباعة {fmt.num(total)} ملصق</Button>
        <Button size="lg" onClick={onClose}>إغلاق</Button>
      </>}>
      <div className="grid-2" style={{ alignItems: 'start' }}>
        <div className="col" style={{ gap: 14 }}>
          <Segmented value={mode} onChange={setMode} label="نوع الرمز" options={[{ value: 'barcode', label: 'باركود' }, { value: 'qr', label: 'رمز QR' }]} />
          <div className="row" style={{ gap: 16 }}>
            <Checkbox label="اسم المنتج" checked={showName} onChange={setShowName} />
            <Checkbox label="السعر" checked={showPrice} onChange={setShowPrice} />
          </div>
          <div className="row nowrap" style={{ gap: 10 }}>
            <Field label="العرض (ملم)"><NumberInput value={w} onChange={setW} min={20} max={120} /></Field>
            <Field label="الارتفاع (ملم)"><NumberInput value={h} onChange={setH} min={12} max={100} /></Field>
          </div>
          <p className="small faint">المقاس الافتراضي من «الإعدادات ← الفواتير والطباعة». التغيير هنا لهذه الطباعة فقط.</p>
        </div>
        <div className="preview-box" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 170 }}>
          {preview ? (
            <div style={{ width: `${dims.width_mm * scale}mm`, height: `${dims.height_mm * scale}mm` }}>
              <div className="label-preview" style={{ width: `${dims.width_mm}mm`, height: `${dims.height_mm}mm`, transform: `scale(${scale})`, transformOrigin: 'top right' }}>
                <style>{labelCss(dims)}</style>
                <div dangerouslySetInnerHTML={{ __html: preview }} />
              </div>
            </div>
          ) : <span className="small faint">لا معاينة</span>}
        </div>
      </div>
      {missing ? <Alert tone="warning">{fmt.num(missing)} من النسخ بلا باركود ولا SKU فلن تُطبع.</Alert> : null}
      <div className="scroll-x">
        <table className="table-plain">
          <thead><tr><th>المنتج</th><th>الرمز</th><th className="end">السعر</th><th className="end" style={{ width: 110 }}>عدد الملصقات</th></tr></thead>
          <tbody>
            {items.map((it, i) => (
              <tr key={`${it.code}-${i}`}>
                <td style={{ whiteSpace: 'normal' }}><b>{it.name}</b>{it.variant ? <span className="dim"> — {it.variant}</span> : null}</td>
                <td><span className="code">{it.code || '—'}</span></td>
                <td className="end money">{it.price !== null ? fmt.money(it.price) : '—'}</td>
                <td className="end"><NumberInput value={it.copies} min={0} max={500} ariaLabel="عدد الملصقات" onChange={(v) => setItems((list) => list.map((x, j) => (j === i ? { ...x, copies: v ?? 0 } : x)))} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}
