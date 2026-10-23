/** فواتير البيع (/invoices) والمرتجعات (/returns): بحث، فترة، قناة، حالة، تصدير */
import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { INVOICE_CHANNEL, type InvoiceChannel } from '@raqeem/shared';
import { Badge, Button, DataTable, PageHeader, Pagination, SearchInput, Select, Stat, askText, toast, type Column } from '../../ui';
import { useAuth } from '../../lib/auth';
import { useDebounced, useLoad } from '../../lib/hooks';
import { useFmt } from '../../lib/settings';
import { downloadText, toCsv } from '../../lib/csv';
import { listInvoices } from './api';
import type { InvoiceRow } from './data/types';
import { RangePicker, useMoney, useRange } from './components/common';
import './sales.css';

export default function Invoices() {
  const nav = useNavigate();
  const loc = useLocation();
  const isReturns = loc.pathname.startsWith('/returns');
  const fmt = useFmt();
  const m = useMoney();
  const { can } = useAuth();
  const r = useRange(isReturns ? '30d' : 'month');
  const [q, setQ] = useState('');
  const dq = useDebounced(q, 250);
  const [channel, setChannel] = useState<InvoiceChannel | ''>('');
  const [status, setStatus] = useState<'posted' | 'void' | ''>('');
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const kind = isReturns ? 'sale_return' : 'sale';
  // تغيير الفترة يعيد للصفحة الأولى (وإلا تظهر صفحة فارغة بعد تضييق الفترة)
  useEffect(() => setPage(1), [r.range]);
  const list = useLoad(() => listInvoices({ kind, q: dq, channel, status, range: r.range, page, pageSize }), [kind, dq, channel, status, r.range, page]);

  const columns: Column<InvoiceRow>[] = [
    { key: 'n', header: 'الرقم', primary: true, cell: (i) => <span><b className="ltr">{i.number}</b>{i.status === 'void' ? <> <Badge tone="danger">ملغاة</Badge></> : null}</span> },
    { key: 'd', header: 'التاريخ', cell: (i) => <span className="dim">{fmt.date(i.created_at, true)}</span> },
    { key: 'c', header: 'الزبون', cell: (i) => i.customer_name ?? '—' },
    { key: 'ch', header: 'القناة', hideOnMobile: true, cell: (i) => <Badge plain>{INVOICE_CHANNEL[i.channel].label}</Badge> },
    { key: 'u', header: 'الموظف', hideOnMobile: true, cell: (i) => <span className="dim">{i.created_by_name ?? '—'}</span> },
    { key: 't', header: 'الإجمالي', end: true, cell: (i) => <b className={i.status === 'void' ? 'strike' : ''}>{m(i.total, i.currency)}</b> },
    ...(!isReturns ? [{ key: 'due', header: 'المتبقي', end: true, cell: (i: InvoiceRow) => (i.due > 0.004 && i.status === 'posted' ? <span className="sx-neg">{m(i.due, i.currency)}</span> : <span className="faint">مدفوعة</span>) }] : []),
  ];

  const newReturn = async () => {
    const n = await askText({ title: 'إرجاع جديد', label: 'رقم فاتورة البيع', placeholder: 'S-000123', confirm: 'متابعة' });
    if (!n) return;
    const res = await listInvoices({ kind: 'sale', q: n.trim(), channel: '', status: 'posted', range: null, page: 1, pageSize: 5 }).catch(() => null);
    const hit = res?.rows.find((i) => i.number.toLowerCase() === n.trim().toLowerCase()) ?? (res?.rows.length === 1 ? res.rows[0] : undefined);
    if (!hit) { toast.error('لم نجد فاتورة بيع سارية بهذا الرقم.'); return; }
    nav(`/invoices/${hit.id}?return=1`);
  };

  const exportCsv = () => downloadText(isReturns ? 'returns.csv' : 'invoices.csv', toCsv(list.data?.rows ?? [], [
    { key: 'number', label: 'number', value: (i) => i.number }, { key: 'date', label: 'date', value: (i) => i.created_at },
    { key: 'customer', label: 'customer', value: (i) => i.customer_name }, { key: 'channel', label: 'channel', value: (i) => i.channel },
    { key: 'currency', label: 'currency', value: (i) => i.currency }, { key: 'total', label: 'total', value: (i) => i.total },
    { key: 'paid', label: 'paid', value: (i) => i.paid }, { key: 'status', label: 'status', value: (i) => i.status },
  ]));

  return (
    <>
      <PageHeader title={isReturns ? 'المرتجعات' : 'فواتير البيع'} description={isReturns ? 'كل ما أرجعه الزبائن وما رُدّ لهم.' : 'كل فواتير نقطة البيع والتطبيق والبيع اليدوي.'}
        actions={<>
          <Button icon="download" onClick={exportCsv}>تصدير</Button>
          {isReturns && can('invoices.void') ? <Button variant="primary" icon="return" onClick={() => void newReturn()}>إرجاع جديد</Button> : null}
          {!isReturns && can('pos.sell') ? <Button variant="primary" icon="pos" onClick={() => nav('/pos')}>بيع جديد</Button> : null}
        </>} />
      <div className="sx-stats">
        <Stat label={isReturns ? 'المرتجعات في الفترة' : 'المبيعات في الفترة'} icon={isReturns ? 'return' : 'receipt'} value={m(list.data?.sum ?? 0)} foot={r.label} />
        <Stat label="عدد الفواتير" icon="fileText" value={fmt.num(list.data?.total ?? 0)} />
      </div>
      <DataTable rows={list.data?.rows} columns={columns} rowKey={(i) => i.id} loading={list.loading} error={list.error} onRetry={list.reload} onRowClick={(i) => nav(`/invoices/${i.id}`)}
        toolbar={<div className="sx-filters">
          <div className="grow"><SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="رقم الفاتورة أو اسم الزبون…" /></div>
          <RangePicker r={r} allowAll />
          {!isReturns ? <Select aria-label="القناة" value={channel} onChange={(e) => { setChannel(e.target.value as InvoiceChannel | ''); setPage(1); }} placeholder="كل القنوات" options={(['pos', 'online', 'manual'] as InvoiceChannel[]).map((c) => ({ value: c, label: INVOICE_CHANNEL[c].label }))} /> : null}
          <Select aria-label="الحالة" value={status} onChange={(e) => { setStatus(e.target.value as 'posted' | 'void' | ''); setPage(1); }} placeholder="كل الحالات" options={[{ value: 'posted', label: 'سارية' }, { value: 'void', label: 'ملغاة' }]} />
        </div>}
        footer={<Pagination page={page} pageSize={pageSize} total={list.data?.total ?? 0} onPage={setPage} />}
        empty={q ? { icon: 'search', title: 'لا نتائج', text: 'جرّب رقماً أو اسماً آخر أو وسّع الفترة.' } : isReturns
          ? { icon: 'return', title: 'لا مرتجعات في هذه الفترة', action: can('invoices.void') ? <Button variant="primary" onClick={() => void newReturn()}>إرجاع جديد</Button> : undefined }
          : { icon: 'receipt', title: 'لا فواتير في هذه الفترة', text: 'كل بيع من نقطة البيع يظهر هنا فوراً.', action: <Button variant="primary" onClick={() => nav('/pos')}>افتح نقطة البيع</Button> }} />
    </>
  );
}
