import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { PAYMENT_METHOD, formatPhone, isoDay, type CurrencyCode } from '@raqeem/shared';
import { Alert, Badge, Button, DataTable, ErrorState, Field, Input, Modal, NumberInput, PageHeader, Segmented, Select, Skeleton, Stat, Tabs, Textarea, type Column } from '../../ui';
import { useAuth } from '../../lib/auth';
import { useAction, useLoad } from '../../lib/hooks';
import { useFmt } from '../../lib/settings';
import { escapeHtml, printHtml } from '../../lib/print';
import { getSupplier, listPurchases, recordSupplierPayment, supplierPayments, supplierStatement, type PurchaseRow, type StatementRow, type SupplierRow } from './api';
import { getCurrencySettings, listMoneyAccounts } from './api-extra';
import { SupplierModal } from './components/SupplierModal';
import { PayFields, emptyPay } from './components/PayFields';
import { useMoneyIn } from '../catalog/components/hooks';
import '../catalog/catalog.css';

const KIND_LABEL: Record<StatementRow['kind'], string> = { purchase: 'فاتورة شراء', purchase_return: 'إرجاع شراء', payment: 'سند صرف', refund: 'استرداد', other: 'أخرى' };
// التواريخ بتوقيت بغداد (toISOString يعطي يوم UTC فيُسقط حركات اليوم بين منتصف الليل و٣ فجراً)
const monthAgo = () => isoDay(Date.now() - 90 * 86_400_000);

export default function SupplierDetail() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const fmt = useFmt();
  const m = useMoneyIn();
  const { can } = useAuth();
  const fin = can('finance.view');
  const sup = useLoad(() => getSupplier(id), [id]);
  const cur = useLoad(getCurrencySettings, []);
  const [tab, setTab] = useState<'statement' | 'invoices' | 'payments'>(fin ? 'statement' : 'invoices');
  const [edit, setEdit] = useState(false);
  const [pay, setPay] = useState<CurrencyCode | null>(null);
  if (sup.error) return <ErrorState message={sup.error} onRetry={sup.reload} />;
  const s = sup.data;
  if (!s) return <div className="stack"><Skeleton h={40} w={260} /><Skeleton h={200} /></div>;
  return (
    <>
      <PageHeader crumbs={[{ label: 'الموردون', to: '/suppliers' }, { label: s.name }]} title={s.name}
        description={[s.company, s.phone ? `\u2066${formatPhone(s.phone)}\u2069` : null, s.address].filter(Boolean).join(' · ') || undefined}
        actions={<>
          <Button icon="edit" onClick={() => setEdit(true)}>تعديل</Button>
          <Button icon="stockIn" onClick={() => nav(`/purchases/new?supplier=${s.id}`)}>فاتورة شراء</Button>
          {fin && can('finance.manage') ? <Button variant="primary" icon="cash" onClick={() => setPay('IQD')}>سند صرف</Button> : null}
        </>} />
      {fin ? (
        <div className="stat-row" style={{ marginBottom: 16 }}>
          <Stat label="علينا بالدينار" icon="debt" tone={s.balance > 0 ? 'hero' : undefined} value={m(s.balance)} foot={s.balance > 0 && can('finance.manage') ? <button className="link-btn" onClick={() => setPay('IQD')}>تسديد</button> : null} />
          {cur.data?.usd_enabled || s.balance_usd ? <Stat label="علينا بالدولار" icon="coins" value={m(s.balance_usd, 'USD')} foot={s.balance_usd > 0 && can('finance.manage') ? <button className="link-btn" onClick={() => setPay('USD')}>تسديد</button> : null} /> : null}
          <Stat label="مشتريات (دينار)" icon="stockIn" value={m(s.purchases_total)} />
          <Stat label="آخر تعامل" icon="clock" value={s.last_activity_at ? fmt.ago(s.last_activity_at) : '—'} />
        </div>
      ) : null}
      {s.notes ? <Alert tone="info">{s.notes}</Alert> : null}
      <Tabs value={tab} onChange={setTab} items={[...(fin ? [{ value: 'statement' as const, label: 'كشف الحساب' }] : []), { value: 'invoices', label: 'الفواتير' }, ...(fin ? [{ value: 'payments' as const, label: 'الدفعات' }] : [])]} />
      <div style={{ marginTop: 14 }}>
        {tab === 'statement' ? <Statement s={s} /> : tab === 'invoices' ? <Invoices supplierId={s.id} /> : <Payments supplierId={s.id} />}
      </div>
      {edit ? <SupplierModal draft={s} onClose={() => setEdit(false)} onSaved={() => void sup.reload()} /> : null}
      {pay ? <PaymentModal s={s} currency={pay} rate={cur.data?.usd_rate ?? 1310} usd={!!cur.data?.usd_enabled} onClose={() => setPay(null)} onDone={() => void sup.reload()} /> : null}
    </>
  );
}

function Statement({ s }: { s: SupplierRow }) {
  const fmt = useFmt();
  const m = useMoneyIn();
  const [cur, setCur] = useState<CurrencyCode>('IQD');
  const [from, setFrom] = useState(monthAgo());
  const [to, setTo] = useState(isoDay());
  const st = useLoad(() => supplierStatement(s.id, from, to, cur), [s.id, from, to, cur]);
  const print = () => {
    if (!st.data) return;
    const rows = st.data.rows.map((r) => `<tr><td>${escapeHtml(fmt.date(r.at))}</td><td>${escapeHtml(KIND_LABEL[r.kind])} ${escapeHtml(r.number)}</td><td>${escapeHtml(r.note ?? '')}</td><td class="n">${r.debit ? escapeHtml(m(r.debit, cur, true)) : ''}</td><td class="n">${r.credit ? escapeHtml(m(r.credit, cur, true)) : ''}</td><td class="n">${escapeHtml(m(r.balance, cur, true))}</td></tr>`).join('');
    void printHtml(`<h2>كشف حساب المورد: ${escapeHtml(s.name)}</h2><p>من ${escapeHtml(fmt.date(from))} إلى ${escapeHtml(fmt.date(to))} — ${cur === 'USD' ? 'بالدولار' : 'بالدينار'}</p>
      <table><thead><tr><th>التاريخ</th><th>المستند</th><th>البيان</th><th>له (مشتريات)</th><th>عليه (دفعات)</th><th>الرصيد</th></tr></thead>
      <tbody><tr><td colspan="5">الرصيد الافتتاحي</td><td class="n">${escapeHtml(m(st.data.opening, cur, true))}</td></tr>${rows}</tbody></table>`,
    { paper: 'A4', title: `كشف حساب ${s.name}`, css: 'table{width:100%;border-collapse:collapse;font-size:12px}th,td{border:1px solid #bbb;padding:5px 6px;text-align:right}.n{text-align:left;font-variant-numeric:tabular-nums}h2{margin:0 0 4px}' });
  };
  const columns: Column<StatementRow>[] = [
    { key: 'd', header: 'التاريخ', cell: (r) => fmt.date(r.at) },
    { key: 'k', header: 'المستند', primary: true, cell: (r) => <span><Badge tone={r.kind === 'payment' ? 'success' : r.kind === 'purchase' ? 'info' : 'warning'}>{KIND_LABEL[r.kind]}</Badge> <span className="code">{r.number}</span></span> },
    { key: 'n', header: 'البيان', hideOnMobile: true, cell: (r) => <span className="dim">{r.note ?? ''}</span> },
    { key: 'dr', header: 'له (مشتريات)', end: true, cell: (r) => (r.debit ? m(r.debit, cur) : '') },
    { key: 'cr', header: 'عليه (دفعات)', end: true, cell: (r) => (r.credit ? m(r.credit, cur) : '') },
    { key: 'b', header: 'الرصيد', end: true, cell: (r) => <b>{m(r.balance, cur)}</b> },
  ];
  return (
    <DataTable rows={st.data?.rows} columns={columns} rowKey={(r) => `${r.kind}${r.number}${r.at}`} loading={st.loading} error={st.error} onRetry={st.reload}
      toolbar={<div className="filters" style={{ width: '100%' }}>
        <Segmented value={cur} onChange={setCur} options={[{ value: 'IQD', label: 'دينار' }, { value: 'USD', label: 'دولار' }]} />
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="من" />
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="إلى" />
        <span className="grow" />
        {st.data ? <span className="dim small">الافتتاحي <b>{m(st.data.opening, cur)}</b></span> : null}
        <Button icon="printer" size="sm" onClick={print} disabled={!st.data}>طباعة A4</Button>
      </div>}
      empty={{ icon: 'fileText', title: 'لا حركات في هذه الفترة' }} />
  );
}

function Invoices({ supplierId }: { supplierId: string }) {
  const nav = useNavigate();
  const fmt = useFmt();
  const m = useMoneyIn();
  const [page, setPage] = useState(1);
  const list = useLoad(() => listPurchases({ q: '', supplier_id: supplierId, status: '', page, pageSize: 25 }), [supplierId, page]);
  const columns: Column<PurchaseRow>[] = [
    { key: 'n', header: 'الرقم', primary: true, cell: (i) => <span><span className="code">{i.number}</span> {i.kind === 'purchase_return' ? <Badge tone="warning">إرجاع</Badge> : null}</span> },
    { key: 'd', header: 'التاريخ', cell: (i) => fmt.date(i.created_at) },
    { key: 'w', header: 'المخزن', hideOnMobile: true, cell: (i) => i.warehouse_name },
    { key: 't', header: 'الإجمالي', end: true, cell: (i) => m(i.total, i.currency) },
    { key: 'due', header: 'المتبقي', end: true, cell: (i) => (i.due > 0 ? <span className="qty-neg">{m(i.due, i.currency)}</span> : <Badge tone="success">مسددة</Badge>) },
  ];
  return <DataTable rows={list.data?.rows} columns={columns} rowKey={(i) => i.id} loading={list.loading} error={list.error} onRetry={list.reload}
    onRowClick={(i) => nav(`/purchases?open=${i.id}`)} empty={{ icon: 'invoice', title: 'لا فواتير شراء', action: <Link to={`/purchases/new?supplier=${supplierId}`}>فاتورة شراء جديدة</Link> }}
    footer={list.data && list.data.total > 25 ? <div className="pager"><Button size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>السابق</Button><Button size="sm" disabled={page * 25 >= list.data.total} onClick={() => setPage(page + 1)}>التالي</Button></div> : null} />;
}

function Payments({ supplierId }: { supplierId: string }) {
  const fmt = useFmt();
  const m = useMoneyIn();
  const list = useLoad(() => supplierPayments(supplierId), [supplierId]);
  return <DataTable rows={list.data} rowKey={(p) => p.id} loading={list.loading} error={list.error} onRetry={list.reload} empty={{ icon: 'cash', title: 'لا دفعات بعد' }}
    columns={[
      { key: 'n', header: 'السند', primary: true, cell: (p) => <span><span className="code">{p.number}</span> {p.direction === 'in' ? <Badge tone="info">استرداد</Badge> : null}{p.voided_at ? <Badge tone="danger">ملغى</Badge> : null}</span> },
      { key: 'd', header: 'التاريخ', cell: (p) => fmt.date(p.created_at, true) },
      { key: 'm', header: 'الطريقة', cell: (p) => PAYMENT_METHOD[p.method].label },
      { key: 'a', header: 'المبلغ', end: true, cell: (p) => <b>{m(p.amount, p.currency)}</b> },
      { key: 'r', header: 'ملاحظة', hideOnMobile: true, cell: (p) => <span className="dim">{[p.reference, p.note].filter(Boolean).join(' · ')}</span> },
    ]} />;
}

/** سند صرف لمورد ← record_payment {direction:'out', supplier_id, invoice_id?…} */
function PaymentModal({ s, currency: initial, rate, usd, onClose, onDone }: { s: SupplierRow; currency: CurrencyCode; rate: number; usd: boolean; onClose: () => void; onDone: () => void }) {
  const m = useMoneyIn();
  const [currency, setCurrency] = useState<CurrencyCode>(initial);
  const [xr, setXr] = useState<number | null>(rate);
  const [p, setP] = useState(() => ({ ...emptyPay(), amount: (initial === 'USD' ? s.balance_usd : s.balance) > 0 ? (initial === 'USD' ? s.balance_usd : s.balance) : null }));
  const [invoice, setInvoice] = useState('');
  const [note, setNote] = useState('');
  const accounts = useLoad(listMoneyAccounts, []);
  const dues = useLoad(() => listPurchases({ q: '', supplier_id: s.id, status: 'due', page: 1, pageSize: 100 }), [s.id]);
  const save = useAction(recordSupplierPayment, { success: 'سُجّل سند الصرف' });
  const due = currency === 'USD' ? s.balance_usd : s.balance;
  const inv = dues.data?.rows.find((i) => i.id === invoice);
  return (
    <Modal open onClose={onClose} title="سند صرف" subtitle={`للمورد ${s.name}`} width={560}
      footer={<><Button variant="primary" loading={save.busy} disabled={!(p.amount && p.amount > 0)} onClick={async () => {
        const r = await save.run({ supplier_id: s.id, amount: p.amount ?? 0, method: p.method, currency, exchange_rate: xr ?? rate, account_id: p.account_id || null, invoice_id: invoice || null, reference: p.reference || null, note: note || null });
        if (r) { onDone(); onClose(); }
      }}>تسجيل الدفعة</Button><Button onClick={onClose}>إلغاء</Button></>}>
      {usd ? <Field label="العملة"><Segmented value={currency} onChange={(c) => { setCurrency(c); setInvoice(''); }} options={[{ value: 'IQD', label: 'دينار' }, { value: 'USD', label: 'دولار' }]} /></Field> : null}
      <div className="preview-box row between"><span className="dim">المستحق بهذه العملة</span><b>{m(due, currency)}</b></div>
      <Field label="عن فاتورة (اختياري)" hint="بلا فاتورة = دفعة على الحساب">
        <Select value={invoice} onChange={(e) => { setInvoice(e.target.value); const i = dues.data?.rows.find((x) => x.id === e.target.value); if (i) setP({ ...p, amount: i.due }); }} placeholder="على الحساب"
          options={(dues.data?.rows ?? []).filter((i) => i.currency === currency && i.kind === 'purchase').map((i) => ({ value: i.id, label: `${i.number} — متبقي ${m(i.due, i.currency)}` }))} />
      </Field>
      <PayFields value={p} onChange={setP} currency={currency} accounts={accounts.data ?? []} />
      {currency === 'USD' ? <Field label="سعر الصرف" hint="دينار لكل دولار، للتقارير"><NumberInput value={xr} onChange={setXr} min={1} /></Field> : null}
      {inv && p.amount && p.amount > inv.due ? <Alert tone="warning">المبلغ أكبر من المتبقي على الفاتورة.</Alert> : null}
      <Field label="ملاحظة"><Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
    </Modal>
  );
}
