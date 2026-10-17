import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Warehouse } from '@raqeem/shared';
import { Badge, Button, DataTable, Field, Input, Menu, Modal, PageHeader, Select, Switch, Textarea, askConfirm, toast, type Column } from '../../ui';
import { useAuth } from '../../lib/auth';
import { useAction, useLoad } from '../../lib/hooks';
import { useFmt } from '../../lib/settings';
import { errorMessage } from '../../lib/supabase';
import { listBranches, listWarehouses, saveWarehouse, setDefaultWarehouse, warehouseUnits, type WarehouseDraft } from './api';
import '../catalog/catalog.css';

export default function Warehouses() {
  const fmt = useFmt();
  const { can } = useAuth();
  // كتابة المخازن تحتاج settings.manage (سياسة warehouses_write)
  const manage = can('settings.manage');
  const whs = useLoad(() => listWarehouses(true), []);
  const branches = useLoad(listBranches, []);
  const units = useLoad(warehouseUnits, []);
  const [edit, setEdit] = useState<WarehouseDraft | null>(null);
  const branchName = (id: string | null) => branches.data?.find((b) => b.id === id)?.name ?? '—';
  const reload = () => { void whs.reload(); void units.reload(); };

  const columns: Column<Warehouse>[] = [
    { key: 'n', header: 'المخزن', primary: true, cell: (w) => <span><b>{w.name}</b> <span className="code faint">{w.code}</span></span> },
    { key: 'b', header: 'الفرع', cell: (w) => branchName(w.branch_id) },
    { key: 's', header: 'الحالة', cell: (w) => <span className="row" style={{ gap: 4 }}>{w.is_default ? <Badge tone="accent">الافتراضي</Badge> : null}{w.is_sellable ? <Badge tone="success">يبيع للمتجر</Badge> : <Badge tone="neutral">تخزين فقط</Badge>}{!w.is_active ? <Badge tone="danger">معطّل</Badge> : null}</span> },
    { key: 'i', header: 'النسخ', end: true, cell: (w) => <span className="num">{fmt.num(units.data?.[w.id]?.items ?? 0)}</span> },
    { key: 'u', header: 'القطع', end: true, cell: (w) => <Link to={`/inventory?wh=${w.id}`} onClick={(e) => e.stopPropagation()} className="num">{fmt.qty(units.data?.[w.id]?.units ?? 0)}</Link> },
    {
      key: 'a', header: '', shrink: true, cell: (w) => manage ? (
        <span onClick={(e) => e.stopPropagation()}>
          <Menu trigger={(open) => <Button size="sm" variant="ghost" icon="more" onClick={open} aria-label="خيارات" />} items={[
            { label: 'تعديل', icon: 'edit', onClick: () => setEdit({ ...w }) },
            ...(!w.is_default ? [{ label: 'اجعله الافتراضي', icon: 'star' as const, onClick: async () => { try { await setDefaultWarehouse(w.id); toast.success('صار المخزن الافتراضي'); reload(); } catch (e) { toast.error(errorMessage(e)); } } }] : []),
            ...(!w.is_default ? [{ label: w.is_active ? 'تعطيل' : 'تفعيل', icon: (w.is_active ? 'eyeOff' : 'eye') as 'eye', danger: w.is_active, onClick: async () => {
              if (w.is_active && !(await askConfirm({ title: `تعطيل «${w.name}»؟`, body: 'يختفي من القوائم ويبقى رصيده وسجله.', danger: true, confirm: 'تعطيل' }))) return;
              try { await saveWarehouse({ ...w, is_active: !w.is_active }); reload(); } catch (e) { toast.error(errorMessage(e)); }
            } }] : []),
          ]} />
        </span>
      ) : null,
    },
  ];
  return (
    <>
      <PageHeader title="المخازن" description="المخزن «يبيع للمتجر» يدخل رصيده في المتوفر بالتطبيق."
        actions={manage ? <Button variant="primary" icon="plus" onClick={() => setEdit({ name: '', code: '', branch_id: branches.data?.find((b) => b.is_default)?.id ?? null, address: null, is_sellable: true, is_active: true })}>مخزن جديد</Button> : null} />
      <DataTable rows={whs.data} columns={columns} rowKey={(w) => w.id} loading={whs.loading} error={whs.error} onRetry={whs.reload}
        onRowClick={manage ? (w) => setEdit({ ...w }) : undefined} empty={{ icon: 'warehouse', title: 'لا مخازن' }} />
      {edit ? <WarehouseModal draft={edit} branches={(branches.data ?? []).map((b) => ({ value: b.id, label: b.name }))} onClose={() => setEdit(null)} onDone={reload} /> : null}
    </>
  );
}

function WarehouseModal({ draft, branches, onClose, onDone }: { draft: WarehouseDraft; branches: { value: string; label: string }[]; onClose: () => void; onDone: () => void }) {
  const [w, setW] = useState(draft);
  const save = useAction(saveWarehouse, { success: draft.id ? 'حُفظ المخزن' : 'أُضيف المخزن' });
  return (
    <Modal open onClose={onClose} title={draft.id ? 'تعديل المخزن' : 'مخزن جديد'} width={520}
      footer={<><Button variant="primary" loading={save.busy} onClick={async () => { if ((await save.run(w)) !== undefined) { onDone(); onClose(); } }}>{draft.id ? 'حفظ المخزن' : 'إضافة المخزن'}</Button><Button onClick={onClose}>إلغاء</Button></>}>
      <div className="grid-2">
        <Field label="الاسم" required><Input value={w.name} autoFocus onChange={(e) => setW({ ...w, name: e.target.value })} placeholder="مخزن الكرادة" /></Field>
        <Field label="الرمز" required hint="قصير بالإنكليزية، يظهر في المستندات"><Input value={w.code} dir="ltr" onChange={(e) => setW({ ...w, code: e.target.value.toUpperCase() })} placeholder="KRD" /></Field>
      </div>
      <Field label="الفرع"><Select value={w.branch_id ?? ''} onChange={(e) => setW({ ...w, branch_id: e.target.value || null })} placeholder="بلا فرع" options={branches} /></Field>
      <Field label="العنوان"><Textarea rows={2} value={w.address ?? ''} onChange={(e) => setW({ ...w, address: e.target.value || null })} /></Field>
      <Switch label="يبيع للمتجر" hint="رصيده يظهر متوفراً في التطبيق ويُحجز منه للطلبات" checked={w.is_sellable} onChange={(v) => setW({ ...w, is_sellable: v })} />
    </Modal>
  );
}
