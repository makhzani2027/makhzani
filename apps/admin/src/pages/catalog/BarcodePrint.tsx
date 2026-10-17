import { useState } from 'react';
import { Button, Card, EmptyState, IconButton, NumberInput, PageHeader, Thumb } from '../../ui';
import { useFmt } from '../../lib/settings';
import { VariantPicker } from './components/VariantPicker';
import { LabelPrintModal } from './components/LabelPrintModal';
import type { VariantHit } from './api';
import './catalog.css';

interface Line { hit: VariantHit; copies: number }

/** طباعة الباركود: امسح أو ابحث، حدد عدد النسخ، ثم اطبع بمقاس الملصق */
export default function BarcodePrint() {
  const fmt = useFmt();
  const [lines, setLines] = useState<Line[]>([]);
  const [open, setOpen] = useState(false);
  const add = (h: VariantHit) => setLines((ls) => {
    const i = ls.findIndex((l) => l.hit.variant_id === h.variant_id);
    if (i >= 0) return ls.map((l, j) => (j === i ? { ...l, copies: l.copies + 1 } : l));
    return [{ hit: h, copies: 1 }, ...ls];
  });
  const total = lines.reduce((s, l) => s + l.copies, 0);
  return (
    <>
      <PageHeader title="طباعة الباركود" description="امسح المنتج أو ابحث عنه، وكل مسحة تزيد نسخة." actions={<Button variant="primary" icon="printer" disabled={!lines.length} onClick={() => setOpen(true)}>طباعة {fmt.num(total)} ملصق</Button>} />
      <div className="scan-box" style={{ marginBottom: 14 }}><VariantPicker onPick={add} showStock={false} autoFocus /></div>
      <Card flush>
        {!lines.length ? <EmptyState icon="barcode" title="القائمة فارغة" text="امسح باركود منتج بالقارئ، أو اكتب اسمه في الحقل أعلاه." /> : (
          <table className="lines-table">
            <thead><tr><th>المنتج</th><th>الرمز</th><th className="end">السعر</th><th>النسخ</th><th /></tr></thead>
            <tbody>{lines.map((l) => (
              <tr key={l.hit.variant_id}>
                <td className="line-main"><div className="pcell"><Thumb imageKey={l.hit.cover_key} size="sm" /><div className="meta"><b className="truncate">{l.hit.name}</b><span>{l.hit.title}</span></div></div></td>
                <td data-label="الرمز" className="code">{l.hit.barcode ?? l.hit.sku}</td>
                <td data-label="السعر" className="end money">{fmt.money(l.hit.price)}</td>
                <td data-label="النسخ" style={{ width: 120 }}><NumberInput value={l.copies} min={1} max={500} onChange={(n) => setLines((ls) => ls.map((x) => (x === l ? { ...x, copies: Math.max(1, n ?? 1) } : x)))} ariaLabel="عدد النسخ" /></td>
                <td><IconButton icon="trash" label="حذف" onClick={() => setLines((ls) => ls.filter((x) => x !== l))} /></td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </Card>
      {open ? <LabelPrintModal open onClose={() => setOpen(false)} items={lines.map((l) => ({ name: l.hit.name, variant: l.hit.title || null, price: l.hit.price, code: l.hit.barcode ?? l.hit.sku, copies: l.copies }))} /> : null}
    </>
  );
}
