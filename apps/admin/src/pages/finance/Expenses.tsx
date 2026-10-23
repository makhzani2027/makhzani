/** المصروفات: تسجيل بنوع وعملة وحساب، فلترة بالفترة والنوع، توزيع حسب النوع، تصدير */
import { useMemo, useState } from 'react';
import { PAYMENT_METHOD, isoDay, type CurrencyCode, type PaymentMethod } from '@raqeem/shared';
import { Badge, Button, Card, DataTable, Donut, Field, Input, Modal, MoneyInput, PageHeader, Segmented, Select, Stat, type Column } from '../../ui';
import { useAuth } from '../../lib/auth';
import { useAction, useLoad } from '../../lib/hooks';
import { useFmt } from '../../lib/settings';
import { downloadText, toCsv } from '../../lib/csv';
import { AccountSelect, METHODS_ALL, RangePicker, useAccounts, useMoney, useRange, useRate } from '../sales/components/common';
import { EXPENSE_CATEGORIES, defaultAccountFor, listExpenses, recordExpense, type ExpenseRow } from './api';
import '../sales/sales.css';

export default function Expenses() {
  const fmt = useFmt();
  const m = useMoney();
  const { can } = useAuth();
  const r = useRange('month');
  const [cat, setCat] = useState('');
  const [add, setAdd] = useState(false);
  const list = useLoad(() => listExpenses(r.range, cat), [r.range, cat]);
  const iqd = (e: ExpenseRow) => e.amount * (e.currency === 'USD' ? e.exchange_rate : 1);
  const total = (list.data ?? []).reduce((s, e) => s + iqd(e), 0);
  const byCat = useMemo(() => {
    const mp = new Map<string, number>();
    for (const e of list.data ?? []) mp.set(e.category, (mp.get(e.category) ?? 0) + iqd(e));
    return [...mp.entries()].sort((a, b) => b[1] - a[1]).map(([label, value]) => ({ label, value }));
  }, [list.data]);
  const cols: Column<ExpenseRow>[] = [
    { key: 'c', header: 'النوع', primary: true, cell: (e) => <div><b>{e.category}</b>{e.note ? <div className="small faint">{e.note}</div> : null}</div> },
    { key: 'd', header: 'التاريخ', cell: (e) => <span className="dim">{fmt.date(e.spent_at)}</span> },
    { key: 'a', header: 'من حساب', hideOnMobile: true, cell: (e) => <span>{e.account_name ?? '—'} <Badge plain>{PAYMENT_METHOD[e.method].label}</Badge></span> },
    { key: 'u', header: 'سجّله', hideOnMobile: true, cell: (e) => <span className="dim">{e.created_by_name ?? '—'}</span> },
    { key: 'v', header: 'المبلغ', end: true, cell: (e) => <b>{m(e.amount, e.currency)}</b> },
  ];
  return (
    <>
      <PageHeader title="المصروفات" description="الإيجار والرواتب والمولدة وكل ما يخرج من غير البضاعة."
        actions={<>
          <Button icon="download" onClick={() => downloadText('expenses.csv', toCsv(list.data ?? [], [
            { key: 'd', label: 'date', value: (e) => e.spent_at }, { key: 'c', label: 'category', value: (e) => e.category }, { key: 'a', label: 'amount', value: (e) => e.amount },
            { key: 'cur', label: 'currency', value: (e) => e.currency }, { key: 'acc', label: 'account', value: (e) => e.account_name }, { key: 'n', label: 'note', value: (e) => e.note },
          ]))}>تصدير</Button>
          {can('finance.manage') ? <Button variant="primary" icon="plus" onClick={() => setAdd(true)}>مصروف جديد</Button> : null}
        </>} />
      <div className="sx-split">
        <DataTable rows={list.data} columns={cols} rowKey={(e) => e.id} loading={list.loading} error={list.error} onRetry={list.reload}
          toolbar={<div className="sx-filters"><RangePicker r={r} allowAll /><Select aria-label="النوع" value={cat} onChange={(e) => setCat(e.target.value)} placeholder="كل الأنواع" options={EXPENSE_CATEGORIES.map((c) => ({ value: c, label: c }))} /></div>}
          empty={{ icon: 'expense', title: 'لا مصروفات في هذه الفترة', action: can('finance.manage') ? <Button variant="primary" onClick={() => setAdd(true)}>مصروف جديد</Button> : undefined }} />
        <div className="sx-stack">
          <Stat tone="hero" label="مجموع المصروفات" icon="expense" value={m(total)} foot={r.label} />
          {byCat.length ? <Card title="حسب النوع" icon="chartPie"><Donut data={byCat} center={<b>{fmt.num(byCat.length)}</b>} /><div className="list" style={{ marginTop: 8 }}>{byCat.map((c) => <div key={c.label} className="list-item"><span className="grow">{c.label}</span><b>{m(c.value)}</b></div>)}</div></Card> : null}
        </div>
      </div>
      {add ? <ExpenseModal onClose={() => setAdd(false)} onDone={() => { setAdd(false); void list.reload(); }} /> : null}
    </>
  );
}

function ExpenseModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { usd, rate } = useRate();
  const { accounts } = useAccounts();
  const [category, setCategory] = useState(EXPENSE_CATEGORIES[0]);
  const [custom, setCustom] = useState('');
  const [amount, setAmount] = useState<number | null>(null);
  const [currency, setCurrency] = useState<CurrencyCode>('IQD');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [account, setAccount] = useState<string | null>(null);
  const [note, setNote] = useState('');
  // اليوم بتوقيت بغداد (toISOString يعطي تاريخ UTC فيظهر «أمس» بين ١٢ و٣ فجراً)
  const [date, setDate] = useState(isoDay());
  const acc = account ?? defaultAccountFor(accounts, method, currency)?.id ?? null;
  const save = useAction(() => recordExpense({ category: category === 'أخرى' && custom.trim() ? custom.trim() : category, amount: amount ?? 0, currency, exchange_rate: currency === 'USD' ? rate : undefined, account_id: acc, method, note: note || null, spent_at: date === isoDay() ? undefined : new Date(`${date}T12:00:00+03:00`).toISOString() }), { success: 'سُجّل المصروف' });
  return (
    <Modal open onClose={onClose} title="مصروف جديد" width={540}
      footer={<><Button onClick={onClose}>إلغاء</Button><Button variant="primary" loading={save.busy} disabled={!amount} onClick={async () => { if (await save.run()) onDone(); }}>حفظ المصروف</Button></>}>
      <div className="form-grid">
        <Field label="النوع"><Select value={category} onChange={(e) => setCategory(e.target.value)} options={EXPENSE_CATEGORIES.map((c) => ({ value: c, label: c }))} /></Field>
        {category === 'أخرى' ? <Field label="اكتب النوع"><Input value={custom} onChange={(e) => setCustom(e.target.value)} /></Field> : null}
        <Field label="المبلغ" required><MoneyInput autoFocus value={amount} onChange={setAmount} currency={currency} /></Field>
        {usd ? <Field label="العملة"><Segmented value={currency} onChange={(c) => { setCurrency(c); setAccount(null); }} options={[{ value: 'IQD', label: 'دينار' }, { value: 'USD', label: 'دولار' }]} /></Field> : null}
        <Field label="طريقة الدفع"><Select value={method} onChange={(e) => { setMethod(e.target.value as PaymentMethod); setAccount(null); }} options={METHODS_ALL.map((x) => ({ value: x, label: PAYMENT_METHOD[x].label }))} /></Field>
        <AccountSelect accounts={accounts} currency={currency} value={acc} onChange={setAccount} />
        <Field label="التاريخ"><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="البيان"><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="إيجار تشرين الأول" /></Field>
      </div>
    </Modal>
  );
}
