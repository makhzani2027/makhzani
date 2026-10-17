import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Button, DataTable, Field, IconButton, Input, Modal, MoneyInput, NumberInput, PageHeader, SearchInput, Segmented, askConfirm, toast, type Column } from '../../ui';
import { useAction, useDebounced, useLoad } from '../../lib/hooks';
import { useFmt } from '../../lib/settings';
import { errorMessage } from '../../lib/supabase';
import { nextBarcode } from './api';
import { addVariantUnit, deleteVariantUnit, listBarcodes, setVariantBarcode, symbology, type BarcodeRow } from '../inventory/api-extra';
import { LabelPrintModal } from './components/LabelPrintModal';
import type { LabelItem } from './labels';
import './catalog.css';

/** إدارة الباركود: باركود كل نسخة ووحدات تعبئتها (كرتونة = ١٢ قطعة بباركود خاص) */
export default function Barcodes() {
  const fmt = useFmt();
  const [q, setQ] = useState('');
  const [missing, setMissing] = useState<'all' | 'missing'>('all');
  const dq = useDebounced(q, 250);
  const list = useLoad(() => listBarcodes(dq, missing === 'missing'), [dq, missing]);
  const [edit, setEdit] = useState<BarcodeRow | null>(null);
  const [unitFor, setUnitFor] = useState<BarcodeRow | null>(null);
  const [labels, setLabels] = useState<LabelItem[] | null>(null);
  const gen = useAction(async (r: BarcodeRow) => { await setVariantBarcode(r.variant_id, await nextBarcode()); await list.reload(); }, { success: 'وُلّد الباركود' });

  const columns: Column<BarcodeRow>[] = [
    { key: 'p', header: 'المنتج', primary: true, cell: (r) => <div className="meta" style={{ display: 'flex', flexDirection: 'column' }}><Link to={`/products/${r.product_id}`} onClick={(e) => e.stopPropagation()}><b>{r.name}</b></Link><span className="small faint">{r.variant_title ?? ''} <span className="code">{r.sku}</span></span></div> },
    { key: 'u', header: 'الوحدة', cell: (r) => (r.kind === 'unit' ? <Badge tone="info">{r.unit_name} × {fmt.num(r.factor)}</Badge> : <span className="dim">{r.unit_name}</span>) },
    { key: 'b', header: 'الباركود', cell: (r) => (r.barcode ? <span className="row" style={{ gap: 6 }}><span className="code">{r.barcode}</span><Badge tone="neutral" plain>{symbology(r.barcode)}</Badge></span> : <Badge tone="warning">بلا باركود</Badge>) },
    { key: 'price', header: 'السعر', end: true, cell: (r) => <span className="money">{fmt.money(r.kind === 'unit' ? r.unit_price ?? r.price * r.factor : r.price)}</span> },
    {
      key: 'a', header: '', shrink: true, cell: (r) => (
        <span className="inline-btns" onClick={(e) => e.stopPropagation()}>
          {r.kind === 'variant' && !r.barcode ? <Button size="sm" icon="barcode" loading={gen.busy} onClick={() => gen.run(r)}>توليد</Button> : null}
          {r.kind === 'variant' ? <IconButton size="sm" icon="edit" label="تعديل الباركود" onClick={() => setEdit(r)} /> : null}
          {r.kind === 'variant' ? <IconButton size="sm" icon="boxes" label="إضافة وحدة تعبئة" onClick={() => setUnitFor(r)} /> : null}
          {r.barcode ? <IconButton size="sm" icon="printer" label="طباعة" onClick={() => setLabels([{ name: r.name, variant: r.kind === 'unit' ? `${r.unit_name} (${r.factor})` : r.variant_title, price: r.kind === 'unit' ? r.unit_price ?? r.price * r.factor : r.price, code: r.barcode!, copies: 1 }])} /> : null}
          {r.kind === 'unit' && r.unit_id ? <IconButton size="sm" icon="trash" label="حذف الوحدة" onClick={async () => {
            if (!(await askConfirm({ title: `حذف وحدة «${r.unit_name}»؟`, danger: true, confirm: 'حذف' }))) return;
            try { await deleteVariantUnit(r.unit_id!); void list.reload(); } catch (e) { toast.error(errorMessage(e)); }
          }} /> : null}
        </span>
      ),
    },
  ];

  const miss = (list.data ?? []).filter((r) => r.kind === 'variant' && !r.barcode);
  return (
    <>
      <PageHeader title="إدارة الباركود" description="كل رمز يُمسح في البيع والشراء والجرد. الكرتونة بباركودها تضيف عدد قطعها دفعة واحدة."
        actions={miss.length ? <Button icon="barcode" loading={gen.busy} onClick={async () => {
          if (!(await askConfirm({ title: `توليد باركود داخلي لـ ${fmt.num(miss.length)} نسخة؟`, body: 'رموز EAN-13 تبدأ بـ 20، لا تتكرر.', confirm: 'توليد' }))) return;
          try { for (const r of miss) await setVariantBarcode(r.variant_id, await nextBarcode()); toast.success('وُلّدت الرموز'); } catch (e) { toast.error(errorMessage(e)); }
          void list.reload();
        }}>توليد للناقص ({fmt.num(miss.length)})</Button> : null} />
      <DataTable rows={list.data} columns={columns} rowKey={(r) => r.key} loading={list.loading} error={list.error} onRetry={list.reload}
        toolbar={<div className="filters" style={{ width: '100%' }}><SearchInput value={q} onChange={setQ} placeholder="ابحث بالاسم أو SKU أو الرمز…" /><Segmented value={missing} onChange={setMissing} options={[{ value: 'all', label: 'الكل' }, { value: 'missing', label: 'بلا باركود' }]} /></div>}
        empty={{ icon: 'barcode', title: missing === 'missing' ? 'كل النسخ لها باركود' : 'لا نتائج' }} />
      {edit ? <EditBarcode row={edit} onClose={() => setEdit(null)} onDone={() => void list.reload()} /> : null}
      {unitFor ? <UnitModal row={unitFor} onClose={() => setUnitFor(null)} onDone={() => void list.reload()} /> : null}
      {labels ? <LabelPrintModal open onClose={() => setLabels(null)} items={labels} /> : null}
    </>
  );
}

function EditBarcode({ row, onClose, onDone }: { row: BarcodeRow; onClose: () => void; onDone: () => void }) {
  const [code, setCode] = useState(row.barcode ?? '');
  const save = useAction(setVariantBarcode, { success: 'حُفظ الباركود' });
  return (
    <Modal open onClose={onClose} title="باركود النسخة" subtitle={`${row.name}${row.variant_title ? ` — ${row.variant_title}` : ''}`} width={460}
      footer={<><Button variant="primary" loading={save.busy} onClick={async () => { if ((await save.run(row.variant_id, code.trim() || null)) !== undefined) { onDone(); onClose(); } }}>حفظ</Button><Button onClick={onClose}>إلغاء</Button></>}>
      <Field label="الرمز" hint="امسحه بالقارئ والمؤشر في الحقل، أو ولّد رمزاً داخلياً.">
        <div className="row nowrap" style={{ gap: 8 }}>
          <Input value={code} dir="ltr" autoFocus data-scan-target="keep" onChange={(e) => setCode(e.target.value)} />
          <Button icon="barcode" onClick={async () => setCode(await nextBarcode())}>توليد</Button>
        </div>
      </Field>
      {code ? <Badge tone="neutral">{symbology(code)}</Badge> : null}
    </Modal>
  );
}

function UnitModal({ row, onClose, onDone }: { row: BarcodeRow; onClose: () => void; onDone: () => void }) {
  const fmt = useFmt();
  const [name, setName] = useState('كرتونة');
  const [factor, setFactor] = useState<number | null>(12);
  const [code, setCode] = useState('');
  const [price, setPrice] = useState<number | null>(null);
  const save = useAction(addVariantUnit, { success: 'أُضيفت الوحدة' });
  return (
    <Modal open onClose={onClose} title="وحدة تعبئة جديدة" subtitle={`${row.name}${row.variant_title ? ` — ${row.variant_title}` : ''}`} width={520}
      footer={<><Button variant="primary" loading={save.busy} disabled={!name.trim() || !(factor && factor > 1)} onClick={async () => {
        if ((await save.run({ variant_id: row.variant_id, unit_name: name.trim(), factor: factor ?? 0, barcode: code.trim() || null, price })) !== undefined) { onDone(); onClose(); }
      }}>إضافة الوحدة</Button><Button onClick={onClose}>إلغاء</Button></>}>
      <div className="grid-2">
        <Field label="اسم الوحدة"><Input value={name} onChange={(e) => setName(e.target.value)} list="unit-names" /></Field>
        <Field label="عدد القطع"><NumberInput value={factor} onChange={setFactor} min={2} suffix="قطعة" /></Field>
      </div>
      <datalist id="unit-names">{['كرتونة', 'درزن', 'علبة', 'باكيت', 'شدة'].map((s) => <option key={s} value={s} />)}</datalist>
      <Field label="باركود الوحدة"><div className="row nowrap" style={{ gap: 8 }}><Input value={code} dir="ltr" data-scan-target="keep" onChange={(e) => setCode(e.target.value)} /><Button icon="barcode" onClick={async () => setCode(await nextBarcode())}>توليد</Button></div></Field>
      <Field label="سعر الوحدة" hint={`فارغ = ${fmt.money(row.price * (factor ?? 1))} (عدد القطع × سعر القطعة)`}><MoneyInput value={price} onChange={setPrice} /></Field>
    </Modal>
  );
}
