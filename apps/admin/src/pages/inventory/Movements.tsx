import { MOVEMENT_KIND, MOVEMENT_KINDS, type MovementKind } from '@raqeem/shared';
import { Link } from 'react-router-dom';
import { Badge, Button, DataTable, Input, PageHeader, Pagination, Select, toast, type Column } from '../../ui';
import { useLoad } from '../../lib/hooks';
import { useFmt } from '../../lib/settings';
import { downloadText, toCsv } from '../../lib/csv';
import { errorMessage } from '../../lib/supabase';
import { useQueryState } from '../catalog/components/hooks';
import { listMovements, listStaff, listWarehouses, type MovementQuery, type MovementRow } from './api';
import '../catalog/catalog.css';

const PAGE = 50;

/** دفتر الحركات: كل دخول وخروج باسم من قام به — لا يُعدَّل ولا يُحذف */
export default function Movements() {
  const fmt = useFmt();
  const [qs, setQs] = useQueryState({ wh: '', kind: '', from: '', to: '', staff: '', page: '1', variant: '' });
  const whs = useLoad(() => listWarehouses(true), []);
  const staff = useLoad(listStaff, []);
  const query: MovementQuery = { variant_ids: qs.variant ? [qs.variant] : null, warehouse_id: qs.wh, kind: qs.kind as MovementKind | '', from: qs.from, to: qs.to, staff_id: qs.staff, page: Number(qs.page) || 1, pageSize: PAGE };
  const list = useLoad(() => listMovements(query), [JSON.stringify(query)]);
  const columns: Column<MovementRow>[] = [
    { key: 't', header: 'الوقت', cell: (m) => <span className="nowrap">{fmt.date(m.created_at, true)}</span> },
    { key: 'p', header: 'المنتج', primary: true, cell: (m) => <div><Link to={`/products/${m.product_id}`}><b>{m.name}</b></Link>{m.variant_title ? <span className="dim"> — {m.variant_title}</span> : null}<div className="small faint code">{m.sku}</div></div> },
    { key: 'k', header: 'النوع', cell: (m) => <Badge tone={MOVEMENT_KIND[m.kind].tone}>{MOVEMENT_KIND[m.kind].label}</Badge> },
    { key: 'w', header: 'المخزن', hideOnMobile: true, cell: (m) => m.warehouse_name },
    { key: 'q', header: 'الكمية', end: true, cell: (m) => <span className={m.qty > 0 ? 'qty-pos' : 'qty-neg'}>{m.qty > 0 ? '+' : ''}{fmt.qty(m.qty)}</span> },
    { key: 'b', header: 'الرصيد بعدها', end: true, hideOnMobile: true, cell: (m) => <span className="num">{fmt.qty(m.balance_after)}</span> },
    { key: 'n', header: 'المرجع', hideOnMobile: true, cell: (m) => <span className="dim small">{m.note ?? ''}</span> },
    { key: 's', header: 'بواسطة', hideOnMobile: true, cell: (m) => <span className="dim">{m.staff_name ?? '—'}</span> },
  ];
  const exportCsv = async () => {
    try {
      const all = await listMovements({ ...query, page: 1, pageSize: 10000 });
      downloadText(`movements-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(all.rows, [
        { key: 't', label: 'at', value: (m) => m.created_at }, { key: 'sku', label: 'sku', value: (m) => m.sku }, { key: 'n', label: 'name', value: (m) => m.name },
        { key: 'k', label: 'kind', value: (m) => MOVEMENT_KIND[m.kind].label }, { key: 'w', label: 'warehouse', value: (m) => m.warehouse_name }, { key: 'q', label: 'qty', value: (m) => m.qty },
        { key: 'b', label: 'balance_after', value: (m) => m.balance_after }, { key: 'note', label: 'note', value: (m) => m.note }, { key: 's', label: 'staff', value: (m) => m.staff_name },
      ]));
    } catch (e) { toast.error(errorMessage(e)); }
  };
  const filtered = qs.wh || qs.kind || qs.from || qs.to || qs.staff || qs.variant;
  return (
    <>
      <PageHeader title="حركة المخزون" description="سجل دائم لكل دخول وخروج. التصحيح يكون بحركة جديدة لا بتعديل القديمة." actions={<Button icon="download" onClick={exportCsv}>تصدير CSV</Button>} />
      <DataTable rows={list.data?.rows} columns={columns} rowKey={(m) => String(m.id)} loading={list.loading} error={list.error} onRetry={list.reload} dense
        toolbar={<div className="filters" style={{ width: '100%' }}>
          <Select value={qs.wh} onChange={(e) => setQs({ wh: e.target.value, page: '1' })} placeholder="كل المخازن" options={(whs.data ?? []).map((w) => ({ value: w.id, label: w.name }))} aria-label="المخزن" />
          <Select value={qs.kind} onChange={(e) => setQs({ kind: e.target.value, page: '1' })} placeholder="كل الأنواع" options={MOVEMENT_KINDS.map((k) => ({ value: k, label: MOVEMENT_KIND[k].label }))} aria-label="النوع" />
          <Input type="date" value={qs.from} onChange={(e) => setQs({ from: e.target.value, page: '1' })} aria-label="من" />
          <Input type="date" value={qs.to} onChange={(e) => setQs({ to: e.target.value, page: '1' })} aria-label="إلى" />
          {staff.data?.length ? <Select value={qs.staff} onChange={(e) => setQs({ staff: e.target.value, page: '1' })} placeholder="كل الموظفين" options={staff.data.map((s) => ({ value: s.id, label: s.full_name }))} aria-label="الموظف" /> : null}
          {filtered ? <Button variant="ghost" size="sm" onClick={() => setQs({ wh: '', kind: '', from: '', to: '', staff: '', variant: '', page: '1' })}>مسح الفلاتر</Button> : null}
        </div>}
        empty={{ icon: 'activity', title: filtered ? 'لا حركات تطابق الفلاتر' : 'لا حركات بعد' }}
        footer={list.data ? <Pagination page={query.page} pageSize={PAGE} total={list.data.total} onPage={(p) => setQs({ page: String(p) })} /> : null} />
    </>
  );
}
