import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge, Button, DataTable, Field, Modal, PageHeader, Select, Textarea, type Column } from '../../ui';
import { useAction, useLoad } from '../../lib/hooks';
import { useFmt } from '../../lib/settings';
import { createStocktake, listStocktakes, listWarehouses, type StocktakeRow } from './api';
import '../catalog/catalog.css';

export default function Stocktakes() {
  const nav = useNavigate();
  const fmt = useFmt();
  const list = useLoad(listStocktakes, []);
  const whs = useLoad(() => listWarehouses(), []);
  const [open, setOpen] = useState(false);
  const [wh, setWh] = useState('');
  const [note, setNote] = useState('');
  const create = useAction(createStocktake);
  const columns: Column<StocktakeRow>[] = [
    { key: 'n', header: 'الجرد', primary: true, cell: (s) => <span className="code">{s.number}</span> },
    { key: 'w', header: 'المخزن', cell: (s) => s.warehouse_name },
    { key: 's', header: 'الحالة', cell: (s) => (s.status === 'draft' ? <Badge tone="warning">مفتوح</Badge> : s.status === 'applied' ? <Badge tone="success">معتمد</Badge> : <Badge tone="neutral">ملغى</Badge>) },
    { key: 'c', header: 'معدود', end: true, cell: (s) => fmt.num(s.counted) },
    { key: 'd', header: 'بدأ', cell: (s) => fmt.date(s.created_at, true) },
    { key: 'a', header: 'اعتُمد', hideOnMobile: true, cell: (s) => (s.applied_at ? fmt.date(s.applied_at, true) : '—') },
    { key: 'u', header: 'بواسطة', hideOnMobile: true, cell: (s) => <span className="dim">{s.staff_name ?? '—'}</span> },
  ];
  const start = async () => {
    const id = await create.run(wh || whs.data?.[0]?.id || '', note.trim() || null);
    if (id) nav(`/stocktakes/${id}`);
  };
  return (
    <>
      <PageHeader title="الجرد" description="افتح جرداً لمخزن، عُدّ بالقارئ أو يدوياً، راجع الفروق ثم اعتمد. الفرق يُسجَّل حركة «فرق جرد»."
        actions={<Button variant="primary" icon="stocktake" onClick={() => setOpen(true)}>جرد جديد</Button>} />
      <DataTable rows={list.data} columns={columns} rowKey={(s) => s.id} loading={list.loading} error={list.error} onRetry={list.reload} onRowClick={(s) => nav(`/stocktakes/${s.id}`)}
        empty={{ icon: 'stocktake', title: 'لا جرد بعد', text: 'جرد دوري يكشف الفروق مبكراً: ابدأ بمخزن واحد.', action: <Button variant="primary" onClick={() => setOpen(true)}>جرد جديد</Button> }} />
      <Modal open={open} onClose={() => setOpen(false)} title="جرد جديد" width={460}
        footer={<><Button variant="primary" loading={create.busy} onClick={start}>بدء الجرد</Button><Button onClick={() => setOpen(false)}>إلغاء</Button></>}>
        <Field label="المخزن"><Select value={wh || whs.data?.[0]?.id || ''} onChange={(e) => setWh(e.target.value)} options={(whs.data ?? []).map((w) => ({ value: w.id, label: w.name }))} /></Field>
        <Field label="ملاحظة"><Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="مثلاً: جرد نهاية الشهر — رف الإكسسوارات" /></Field>
      </Modal>
    </>
  );
}
