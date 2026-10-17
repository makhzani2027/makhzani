/** السندات: قبض وصرف بالعملة والحساب، فلترة، طباعة السند، تصدير */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PAYMENT_METHOD, type PaymentDirection } from '@raqeem/shared';
import { Badge, Button, DataTable, IconButton, PageHeader, Pagination, SearchInput, Segmented, Select, Stat, type Column } from '../../ui';
import { useAuth } from '../../lib/auth';
import { useDebounced, useLoad } from '../../lib/hooks';
import { useFmt, useSettings } from '../../lib/settings';
import { downloadText, toCsv } from '../../lib/csv';
import type { PaymentRow } from '../sales/data/types';
import { RangePicker, VoucherModal, useAccounts, useMoney, useRange } from '../sales/components/common';
import { printVoucher } from '../sales/printing';
import { listPayments } from './api';
import '../sales/sales.css';

export default function Receipts() {
  const nav = useNavigate();
  const fmt = useFmt();
  const m = useMoney();
  const { store } = useSettings();
  const { can } = useAuth();
  const { accounts } = useAccounts();
  const r = useRange('month');
  const [dir, setDir] = useState<PaymentDirection | ''>('');
  const [acc, setAcc] = useState('');
  const [q, setQ] = useState('');
  const dq = useDebounced(q, 250);
  const [page, setPage] = useState(1);
  const [voucher, setVoucher] = useState<PaymentDirection | null>(null);
  const list = useLoad(() => listPayments({ direction: dir, q: dq, range: r.range, accountId: acc || undefined, page, pageSize: 30 }), [dir, dq, r.range, acc, page]);
  const cols: Column<PaymentRow>[] = [
    { key: 'n', header: 'السند', primary: true, cell: (p) => <div><b className="ltr">{p.number}</b><div className="small faint">{fmt.date(p.created_at, true)}</div></div> },
    { key: 'k', header: 'النوع', cell: (p) => <Badge tone={p.direction === 'in' ? 'success' : 'warning'}>{p.direction === 'in' ? 'قبض' : 'صرف'}</Badge> },
    { key: 'p', header: 'الطرف', cell: (p) => (p.customer_id ? <button type="button" className="sx-link" onClick={(e) => { e.stopPropagation(); nav(`/customers/${p.customer_id}`); }}>{p.party_name}</button> : p.party_name ?? <span className="faint">—</span>) },
    { key: 'm', header: 'الطريقة', hideOnMobile: true, cell: (p) => <span>{PAYMENT_METHOD[p.method].label}<div className="small faint">{accounts.find((a) => a.id === p.account_id)?.name ?? ''}</div></span> },
    { key: 'i', header: 'الفاتورة', hideOnMobile: true, cell: (p) => (p.invoice_id ? <button type="button" className="sx-link ltr" onClick={(e) => { e.stopPropagation(); nav(`/invoices/${p.invoice_id}`); }}>{p.invoice_number}</button> : <span className="faint">{p.note ?? '—'}</span>) },
    { key: 'u', header: 'الموظف', hideOnMobile: true, cell: (p) => <span className="dim">{p.created_by_name ?? '—'}</span> },
    { key: 'a', header: 'المبلغ', end: true, cell: (p) => <div><b className={p.direction === 'in' ? 'sx-pos' : ''}>{m(p.amount, p.currency)}</b>{p.currency === 'USD' ? <div className="small faint">{m(p.amount_iqd)}</div> : null}</div> },
    { key: 'x', header: '', shrink: true, cell: (p) => <IconButton icon="printer" label="طباعة السند" onClick={(e) => { e.stopPropagation(); void printVoucher(p, p.party_name, store, { invoiceNumber: p.invoice_number, cashier: p.created_by_name }); }} /> },
  ];
  return (
    <>
      <PageHeader title="السندات" description="كل ما قبضته وما صرفته، بعملته وحسابه."
        actions={<>
          <Button icon="download" onClick={() => downloadText('payments.csv', toCsv(list.data?.rows ?? [], [
            { key: 'n', label: 'number', value: (p) => p.number }, { key: 'd', label: 'date', value: (p) => p.created_at }, { key: 'k', label: 'direction', value: (p) => p.direction },
            { key: 'p', label: 'party', value: (p) => p.party_name }, { key: 'm', label: 'method', value: (p) => p.method }, { key: 'c', label: 'currency', value: (p) => p.currency }, { key: 'a', label: 'amount', value: (p) => p.amount }, { key: 'i', label: 'amount_iqd', value: (p) => p.amount_iqd },
          ]))}>تصدير</Button>
          {can('finance.manage') ? <><Button icon="stockOut" onClick={() => setVoucher('out')}>سند صرف</Button><Button variant="primary" icon="wallet" onClick={() => setVoucher('in')}>سند قبض</Button></> : null}
        </>} />
      <div className="sx-stats">
        <Stat label="المقبوض" icon="arrowDown" value={m(list.data?.inIqd ?? 0)} foot={r.label} />
        <Stat label="المصروف" icon="arrowUp" value={m(list.data?.outIqd ?? 0)} />
        <Stat tone="hero" label="الصافي" icon="wallet" value={m((list.data?.inIqd ?? 0) - (list.data?.outIqd ?? 0))} />
      </div>
      <DataTable rows={list.data?.rows} columns={cols} rowKey={(p) => p.id} loading={list.loading} error={list.error} onRetry={list.reload}
        toolbar={<div className="sx-filters">
          <div className="grow"><SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="رقم السند أو الطرف أو البيان…" /></div>
          <Segmented value={dir} onChange={(v) => { setDir(v); setPage(1); }} options={[{ value: '', label: 'الكل' }, { value: 'in', label: 'قبض' }, { value: 'out', label: 'صرف' }]} />
          <Select aria-label="الحساب" value={acc} onChange={(e) => { setAcc(e.target.value); setPage(1); }} placeholder="كل الحسابات" options={accounts.map((a) => ({ value: a.id, label: a.name }))} />
          <RangePicker r={r} allowAll />
        </div>}
        footer={<Pagination page={page} pageSize={30} total={list.data?.total ?? 0} onPage={setPage} />}
        empty={{ icon: 'wallet', title: 'لا سندات في هذه الفترة', action: can('finance.manage') ? <Button variant="primary" onClick={() => setVoucher('in')}>سند قبض</Button> : undefined }} />
      <VoucherModal open={!!voucher} onClose={() => setVoucher(null)} preset={voucher ? { direction: voucher } : undefined} onDone={() => void list.reload()} />
    </>
  );
}
