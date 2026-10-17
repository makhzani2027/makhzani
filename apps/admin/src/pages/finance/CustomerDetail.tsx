/** ملف الزبون: الأرصدة، الفواتير، الطلبات، الدفعات، الكشف؛ سند قبض، تذكير واتساب، طباعة الكشف */
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ORDER_STATUS, PAYMENT_METHOD, formatPhone, governorateName, whatsappLink } from '@raqeem/shared';
import { Badge, Button, DataTable, ErrorState, Loading, PageHeader, Stat, Tabs, type Column } from '../../ui';
import { useAuth } from '../../lib/auth';
import { useLoad } from '../../lib/hooks';
import { useFmt, useSettings } from '../../lib/settings';
import { buildStatementA4, printDoc } from '../../print';
import { listInvoices, listOrders } from '../sales/api';
import { customerBalance, getCustomer } from '../sales/data/lookups';
import type { InvoiceRow, OrderRow, PaymentRow } from '../sales/data/types';
import { QuickCustomer, RangePicker, VoucherModal, useMoney, useRange } from '../sales/components/common';
import { listPayments, partyStatement } from './api';
import { StatementView } from './StatementView';
import '../sales/sales.css';

export default function CustomerDetail() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const fmt = useFmt();
  const m = useMoney();
  const { store } = useSettings();
  const { can } = useAuth();
  const c = useLoad(() => Promise.all([getCustomer(id), customerBalance(id)]), [id]);
  const [tab, setTab] = useState<'invoices' | 'orders' | 'payments' | 'statement'>('invoices');
  const [edit, setEdit] = useState(false);
  const [pay, setPay] = useState(false);
  const r = useRange('year');
  const invs = useLoad(() => (tab === 'invoices' ? listInvoices({ kind: 'sale', q: '', channel: '', status: '', range: null, page: 1, pageSize: 100, customerId: id }) : Promise.resolve(null)), [tab, id]);
  const ords = useLoad(() => (tab === 'orders' ? listOrders({ status: 'all', q: '', range: null, page: 1, pageSize: 100, customerId: id }) : Promise.resolve(null)), [tab, id]);
  const pays = useLoad(() => (tab === 'payments' ? listPayments({ direction: '', q: '', range: null, customerId: id, page: 1, pageSize: 200 }) : Promise.resolve(null)), [tab, id]);
  const st = useLoad(() => (tab === 'statement' && can('finance.view') ? partyStatement('customer', id, r.range) : Promise.resolve(null)), [tab, id, r.range]);

  if (c.error) return <ErrorState message={c.error} onRetry={c.reload} />;
  if (!c.data) return <Loading />;
  const [cust, bal] = c.data;
  if (!cust) return <ErrorState message="الزبون غير موجود." />;
  const reminder = whatsappLink(cust.phone, `مرحباً ${cust.name}،\nنذكّركم بأن رصيد حسابكم لدى ${store.name}: ${m(bal.balance)}${bal.balance_usd > 0 ? ` و${m(bal.balance_usd, 'USD')}` : ''}.\nنسعد بتسديده في أقرب وقت. شكراً لتعاملكم معنا.`);
  const printSt = async () => {
    const s = await partyStatement('customer', id, r.range);
    await printDoc(buildStatementA4({ party: { name: cust.name, phone: cust.phone, kind: 'customer' }, rows: s.rows, opening: s.opening, from: r.range?.from ?? null, to: r.range?.to ?? null, store }));
  };

  const invCols: Column<InvoiceRow>[] = [
    { key: 'n', header: 'الرقم', primary: true, cell: (i) => <span><b className="ltr">{i.number}</b> {i.status === 'void' ? <Badge tone="danger">ملغاة</Badge> : null}</span> },
    { key: 'd', header: 'التاريخ', cell: (i) => <span className="dim">{fmt.date(i.created_at)}</span> },
    { key: 't', header: 'الإجمالي', end: true, cell: (i) => m(i.total, i.currency) },
    { key: 'due', header: 'المتبقي', end: true, cell: (i) => (i.due > 0.004 && i.status === 'posted' ? <span className="sx-neg">{m(i.due, i.currency)}</span> : <span className="faint">مدفوعة</span>) },
  ];
  const ordCols: Column<OrderRow>[] = [
    { key: 'n', header: 'الطلب', primary: true, cell: (o) => <b className="ltr">{o.number}</b> },
    { key: 'd', header: 'التاريخ', cell: (o) => <span className="dim">{fmt.date(o.created_at)}</span> },
    { key: 's', header: 'الحالة', cell: (o) => <Badge tone={ORDER_STATUS[o.status].tone}>{ORDER_STATUS[o.status].label}</Badge> },
    { key: 't', header: 'الإجمالي', end: true, cell: (o) => m(o.total) },
  ];
  const payCols: Column<PaymentRow>[] = [
    { key: 'n', header: 'السند', primary: true, cell: (p) => <b className="ltr">{p.number}</b> },
    { key: 'd', header: 'التاريخ', cell: (p) => <span className="dim">{fmt.date(p.created_at, true)}</span> },
    { key: 'k', header: 'النوع', cell: (p) => <Badge tone={p.direction === 'in' ? 'success' : 'warning'}>{p.direction === 'in' ? 'قبض' : 'صرف'}</Badge> },
    { key: 'm', header: 'الطريقة', hideOnMobile: true, cell: (p) => PAYMENT_METHOD[p.method].label },
    { key: 'i', header: 'الفاتورة', hideOnMobile: true, cell: (p) => <span className="ltr dim">{p.invoice_number ?? '—'}</span> },
    { key: 'a', header: 'المبلغ', end: true, cell: (p) => <b>{m(p.amount, p.currency)}</b> },
  ];

  return (
    <>
      <PageHeader title={cust.name} crumbs={[{ label: 'الزبائن', to: '/customers' }, { label: cust.name }]}
        description={<span>{cust.phone ? <span className="ltr">{formatPhone(cust.phone)}</span> : 'بلا هاتف'}{cust.governorate ? ` · ${governorateName(cust.governorate)}` : ''}{cust.address ? ` · ${cust.address}` : ''}</span>}
        actions={<>
          {can('customers.manage') ? <Button icon="edit" onClick={() => setEdit(true)}>تعديل</Button> : null}
          {reminder && (bal.balance > 0 || bal.balance_usd > 0) ? <Button icon="whatsapp" onClick={() => window.open(reminder, '_blank', 'noopener')}>تذكير بالدين</Button> : null}
          {can('finance.view') ? <Button icon="printer" onClick={() => void printSt()}>طباعة الكشف</Button> : null}
          {can('finance.manage') ? <Button variant="primary" icon="wallet" onClick={() => setPay(true)}>سند قبض</Button> : null}
        </>} />
      {can('finance.view') ? (
        <div className="sx-stats">
          <Stat tone={bal.balance > 0 ? 'hero' : undefined} label={bal.balance >= 0 ? 'عليه (دينار)' : 'له (دينار)'} icon="debt" value={m(Math.abs(bal.balance))} foot={cust.credit_limit !== null ? `حد الدين ${m(cust.credit_limit)}` : 'بلا حد للدين'} />
          <Stat label={bal.balance_usd >= 0 ? 'عليه (دولار)' : 'له (دولار)'} icon="coins" value={m(Math.abs(bal.balance_usd), 'USD')} />
          <Stat label="مجموع مشترياته" icon="receipt" value={m(bal.sales_total)} foot={bal.last_activity_at ? `آخر تعامل ${fmt.ago(bal.last_activity_at)}` : undefined} />
        </div>
      ) : null}
      {cust.notes ? <p className="sx-muted sx-pre">{cust.notes}</p> : null}
      <Tabs value={tab} onChange={setTab} items={[{ value: 'invoices', label: 'الفواتير' }, { value: 'orders', label: 'طلبات التطبيق' }, ...(can('finance.view') ? [{ value: 'payments' as const, label: 'الدفعات' }, { value: 'statement' as const, label: 'كشف الحساب' }] : [])]} />
      {tab === 'invoices' ? <DataTable rows={invs.data?.rows} columns={invCols} rowKey={(i) => i.id} loading={invs.loading} error={invs.error} onRetry={invs.reload} onRowClick={(i) => nav(`/invoices/${i.id}`)} empty={{ icon: 'receipt', title: 'لا فواتير لهذا الزبون' }} /> : null}
      {tab === 'orders' ? <DataTable rows={ords.data?.rows} columns={ordCols} rowKey={(o) => o.id} loading={ords.loading} error={ords.error} onRetry={ords.reload} onRowClick={(o) => nav(`/orders/${o.id}`)} empty={{ icon: 'bag', title: 'لا طلبات من التطبيق' }} /> : null}
      {tab === 'payments' ? <DataTable rows={pays.data?.rows} columns={payCols} rowKey={(p) => p.id} loading={pays.loading} error={pays.error} onRetry={pays.reload} empty={{ icon: 'wallet', title: 'لا دفعات' }} /> : null}
      {tab === 'statement' ? (
        <>
          <div className="sx-filters"><RangePicker r={r} allowAll /></div>
          {st.loading && !st.data ? <Loading /> : st.error ? <ErrorState message={st.error} onRetry={st.reload} /> : st.data ? <StatementView st={st.data} kind="customer" /> : null}
        </>
      ) : null}
      <QuickCustomer open={edit} edit={cust} onClose={() => setEdit(false)} onSaved={() => { setEdit(false); void c.reload(); }} />
      <VoucherModal open={pay} onClose={() => setPay(false)} preset={{ direction: 'in', customer: cust }} onDone={() => { void c.reload(); void pays.reload(); void st.reload(); }} />
    </>
  );
}

