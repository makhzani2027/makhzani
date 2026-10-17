/** الزبائن: بحث، رصيد بالدينار والدولار، إضافة، تصدير */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatPhone, governorateName, normalizeArabic } from '@raqeem/shared';
import { Badge, Button, DataTable, PageHeader, SearchInput, Segmented, Stat, type Column } from '../../ui';
import { useAuth } from '../../lib/auth';
import { useLoad } from '../../lib/hooks';
import { useFmt } from '../../lib/settings';
import { downloadText, toCsv } from '../../lib/csv';
import { listCustomers, type CustomerRow } from './api';
import { QuickCustomer, useMoney } from '../sales/components/common';
import '../sales/sales.css';

export default function Customers() {
  const nav = useNavigate();
  const fmt = useFmt();
  const m = useMoney();
  const { can } = useAuth();
  const fin = can('finance.view');
  const list = useLoad(listCustomers, []);
  const [q, setQ] = useState('');
  const [only, setOnly] = useState<'all' | 'due' | 'app'>('all');
  const [add, setAdd] = useState(false);
  const t = normalizeArabic(q.trim());
  const digits = q.replace(/\D/g, '').replace(/^0/, '');
  const rows = list.data?.filter((c) => (!t || normalizeArabic(c.name).includes(t) || (digits.length > 3 && `${c.phone ?? ''}${c.phone2 ?? ''}`.includes(digits)))
    && (only === 'all' || (only === 'due' ? c.balance > 0 || c.balance_usd > 0 : !!c.profile_id)));
  const due = (list.data ?? []).reduce((s, c) => s + Math.max(0, c.balance), 0);
  const dueUsd = (list.data ?? []).reduce((s, c) => s + Math.max(0, c.balance_usd), 0);
  const cols: Column<CustomerRow>[] = [
    { key: 'n', header: 'الزبون', primary: true, cell: (c) => <div><b>{c.name}</b> {c.profile_id ? <Badge plain tone="info">التطبيق</Badge> : null}<div className="small faint">{c.governorate ? governorateName(c.governorate) : ''}{c.city ? ` — ${c.city}` : ''}</div></div> },
    { key: 'p', header: 'الهاتف', cell: (c) => <span className="ltr">{c.phone ? formatPhone(c.phone) : '—'}</span> },
    ...(fin ? [
      { key: 'b', header: 'الرصيد (دينار)', end: true, cell: (c: CustomerRow) => <span className={c.balance > 0 ? 'sx-neg' : c.balance < 0 ? 'sx-pos' : 'faint'}>{m(Math.abs(c.balance))}{c.balance < 0 ? ' له' : ''}</span> },
      { key: 'u', header: 'الرصيد (دولار)', end: true, hideOnMobile: true, cell: (c: CustomerRow) => <span className={c.balance_usd > 0 ? 'sx-neg' : 'faint'}>{m(c.balance_usd, 'USD')}</span> },
      { key: 's', header: 'المشتريات', end: true, hideOnMobile: true, cell: (c: CustomerRow) => m(c.sales_total) },
    ] : []),
    { key: 'l', header: 'آخر تعامل', hideOnMobile: true, cell: (c) => <span className="dim">{c.last_activity_at ? fmt.ago(c.last_activity_at) : '—'}</span> },
  ];
  return (
    <>
      <PageHeader title="الزبائن" description="زبائن المحل والتطبيق، وأرصدتهم بالدينار والدولار."
        actions={<>
          <Button icon="download" onClick={() => downloadText('customers.csv', toCsv(list.data ?? [], [
            { key: 'name', label: 'name', value: (c) => c.name }, { key: 'phone', label: 'phone', value: (c) => c.phone }, { key: 'gov', label: 'governorate', value: (c) => c.governorate },
            { key: 'b', label: 'balance_iqd', value: (c) => c.balance }, { key: 'u', label: 'balance_usd', value: (c) => c.balance_usd }, { key: 'lim', label: 'credit_limit', value: (c) => c.credit_limit },
          ]))}>تصدير</Button>
          {can('customers.manage') ? <Button variant="primary" icon="userPlus" onClick={() => setAdd(true)}>زبون جديد</Button> : null}
        </>} />
      <div className="sx-stats">
        <Stat label="الزبائن" icon="users" value={fmt.num(list.data?.length ?? 0)} foot={`${fmt.num((list.data ?? []).filter((c) => c.profile_id).length)} من التطبيق`} />
        {fin ? <Stat label="لنا عندهم (دينار)" icon="debt" value={m(due)} /> : null}
        {fin && dueUsd ? <Stat label="لنا عندهم (دولار)" icon="coins" value={m(dueUsd, 'USD')} /> : null}
      </div>
      <DataTable rows={rows} columns={cols} rowKey={(c) => c.id} loading={list.loading} error={list.error} onRetry={list.reload} onRowClick={(c) => nav(`/customers/${c.id}`)}
        toolbar={<div className="sx-filters"><div className="grow"><SearchInput value={q} onChange={setQ} placeholder="الاسم أو رقم الهاتف…" /></div><Segmented value={only} onChange={setOnly} options={[{ value: 'all', label: 'الكل' }, ...(fin ? [{ value: 'due' as const, label: 'عليهم دين' }] : []), { value: 'app', label: 'التطبيق' }]} /></div>}
        empty={q ? { icon: 'search', title: 'لا نتائج' } : { icon: 'users', title: 'لا زبائن بعد', text: 'أضف الزبون مرة، واختره في كل بيع.', action: <Button variant="primary" onClick={() => setAdd(true)}>زبون جديد</Button> }} />
      <QuickCustomer open={add} onClose={() => setAdd(false)} onSaved={(c) => nav(`/customers/${c.id}`)} />
    </>
  );
}
