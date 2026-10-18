import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatPhone, normalizeArabic } from '@raqeem/shared';
import { Button, DataTable, PageHeader, SearchInput, Segmented, Stat, type Column } from '../../ui';
import { useAuth } from '../../lib/auth';
import { useLoad } from '../../lib/hooks';
import { useFmt } from '../../lib/settings';
import { downloadText, toCsv } from '../../lib/csv';
import { listSuppliers, type SupplierRow } from './api';
import { SupplierModal, emptySupplier } from './components/SupplierModal';
import { useMoneyIn } from '../catalog/components/hooks';
import '../catalog/catalog.css';

export default function Suppliers() {
  const nav = useNavigate();
  const fmt = useFmt();
  const m = useMoneyIn();
  const { can } = useAuth();
  const fin = can('finance.view');
  const list = useLoad(listSuppliers, []);
  const [q, setQ] = useState('');
  const [only, setOnly] = useState<'all' | 'due'>('all');
  const [add, setAdd] = useState(false);
  const t = normalizeArabic(q);
  const rows = list.data?.filter((s) => (!t || normalizeArabic(`${s.name} ${s.company ?? ''}`).includes(t) || (s.phone ?? '').includes(q.trim())) && (only === 'all' || s.balance > 0 || s.balance_usd > 0));
  const totIqd = (list.data ?? []).reduce((s, x) => s + Math.max(0, x.balance), 0);
  const totUsd = (list.data ?? []).reduce((s, x) => s + Math.max(0, x.balance_usd), 0);
  const columns: Column<SupplierRow>[] = [
    { key: 'n', header: 'المورد', primary: true, cell: (s) => <div><b>{s.name}</b>{s.company ? <div className="small faint">{s.company}</div> : null}</div> },
    { key: 'p', header: 'الهاتف', hideOnMobile: true, cell: (s) => <span className="ltr">{s.phone ? formatPhone(s.phone) : '—'}</span> },
    ...(fin ? [
      { key: 'b', header: 'علينا بالدينار', end: true, cell: (s: SupplierRow) => <span className={s.balance > 0 ? 'qty-neg' : 'faint'}>{m(s.balance)}</span> },
      { key: 'u', header: 'علينا بالدولار', end: true, cell: (s: SupplierRow) => <span className={s.balance_usd > 0 ? 'qty-neg' : 'faint'}>{m(s.balance_usd, 'USD')}</span> },
    ] : []),
    { key: 'l', header: 'آخر تعامل', hideOnMobile: true, cell: (s) => <span className="dim">{s.last_activity_at ? fmt.ago(s.last_activity_at) : '—'}</span> },
  ];
  return (
    <>
      <PageHeader title="الموردون والشركات" description="من تشتري منهم، وكم عليك لكل واحد بالدينار والدولار."
        actions={<>
          <Button icon="download" onClick={() => downloadText('suppliers.csv', toCsv(list.data ?? [], [
            { key: 'name', label: 'name', value: (s) => s.name }, { key: 'company', label: 'company', value: (s) => s.company }, { key: 'phone', label: 'phone', value: (s) => s.phone },
            { key: 'b', label: 'balance_iqd', value: (s) => s.balance }, { key: 'u', label: 'balance_usd', value: (s) => s.balance_usd },
          ]))}>تصدير</Button>
          <Button variant="primary" icon="plus" onClick={() => setAdd(true)}>مورد جديد</Button>
        </>} />
      {fin ? (
        <div className="stat-row" style={{ marginBottom: 16 }}>
          <Stat label="الموردون" icon="supplier" value={fmt.num(list.data?.length ?? 0)} />
          <Stat label="مستحق علينا (دينار)" icon="debt" value={m(totIqd)} />
          <Stat label="مستحق علينا (دولار)" icon="coins" value={m(totUsd, 'USD')} />
        </div>
      ) : null}
      <DataTable rows={rows} columns={columns} rowKey={(s) => s.id} loading={list.loading} error={list.error} onRetry={list.reload} onRowClick={(s) => nav(`/suppliers/${s.id}`)}
        toolbar={<div className="filters" style={{ width: '100%' }}><SearchInput value={q} onChange={setQ} placeholder="ابحث بالاسم أو الهاتف…" />{fin ? <Segmented value={only} onChange={setOnly} options={[{ value: 'all', label: 'الكل' }, { value: 'due', label: 'عليهم مستحق' }]} /> : null}</div>}
        empty={q ? { icon: 'search', title: 'لا نتائج' } : { icon: 'supplier', title: 'لا موردين بعد', text: 'أضف المورد مرة واحدة، ثم اختره في كل فاتورة شراء.', action: <Button variant="primary" onClick={() => setAdd(true)}>مورد جديد</Button> }} />
      {add ? <SupplierModal draft={emptySupplier()} onClose={() => setAdd(false)} onSaved={(s) => nav(`/suppliers/${s.id}`)} /> : null}
    </>
  );
}
