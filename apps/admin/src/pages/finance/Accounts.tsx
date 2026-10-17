/** الصناديق والحسابات: الأرصدة بعملة كل حساب، التحويل بينها (بسعر صرف عند اختلاف العملة)، كشف كل حساب */
import { useState } from 'react';
import { MONEY_ACCOUNT_KIND, type CurrencyCode, type MoneyAccountKind } from '@raqeem/shared';
import { Alert, Badge, Button, Card, DataTable, Drawer, ErrorState, Field, Icon, Input, Loading, Modal, MoneyInput, NumberInput, PageHeader, Select, Skeleton, Stat, Switch, type Column } from '../../ui';
import { useAuth } from '../../lib/auth';
import { useAction, useLoad } from '../../lib/hooks';
import { useFmt, useSettings } from '../../lib/settings';
import { buildStatementA4, printDoc } from '../../print';
import { RangePicker, useMoney, useRange, useRate } from '../sales/components/common';
import { accountStatement, listAccounts, listTransfers, saveAccount, transferMoney, type AccountRow, type TransferRow } from './api';
import { StatementView } from './StatementView';
import '../sales/sales.css';

export default function Accounts() {
  const fmt = useFmt();
  const m = useMoney();
  const { can } = useAuth();
  const list = useLoad(() => listAccounts(true), []);
  const transfers = useLoad(() => listTransfers(null), []);
  const [transfer, setTransfer] = useState(false);
  const [edit, setEdit] = useState<AccountRow | 'new' | null>(null);
  const [open, setOpen] = useState<AccountRow | null>(null);
  const active = (list.data ?? []).filter((a) => a.is_active);
  const totalIqd = active.reduce((s, a) => s + a.balance_iqd, 0);
  const tcols: Column<TransferRow>[] = [
    { key: 'n', header: 'الرقم', primary: true, cell: (t) => <b className="ltr">{t.number}</b> },
    { key: 'd', header: 'التاريخ', cell: (t) => <span className="dim">{fmt.date(t.created_at, true)}</span> },
    { key: 'f', header: 'من ← إلى', cell: (t) => <span>{t.from_name} <Icon name="arrowLeft" size={13} /> {t.to_name}</span> },
    { key: 'note', header: 'البيان', hideOnMobile: true, cell: (t) => <span className="dim">{t.note ?? '—'}</span> },
    { key: 'a', header: 'المبلغ', end: true, cell: (t) => <div><b>{m(t.amount, t.from_currency)}</b>{t.from_currency !== t.to_currency ? <div className="small faint">بسعر {m(t.exchange_rate, 'IQD', true)}</div> : null}</div> },
  ];
  return (
    <>
      <PageHeader title="الصناديق والحسابات" description="أين أموالك الآن: الصناديق النقدية والمصارف والمحافظ، كلٌّ بعملته."
        actions={<>
          {can('settings.manage') ? <Button icon="plus" onClick={() => setEdit('new')}>حساب جديد</Button> : null}
          {can('finance.manage') ? <Button variant="primary" icon="transfer" onClick={() => setTransfer(true)}>تحويل بين الحسابات</Button> : null}
        </>} />
      {list.error ? <ErrorState message={list.error} onRetry={list.reload} /> : (
        <div className="sx-stats">
          {!list.data ? Array.from({ length: 4 }, (_, i) => <Skeleton key={i} h={120} r={20} />) : (
            <>
              <Stat tone="hero" label="المجموع بالدينار المكافئ" icon="wallet" value={m(totalIqd)} foot={`${fmt.num(active.length)} حساب`} />
              {list.data.map((a) => (
                <button key={a.id} type="button" className="card" style={{ textAlign: 'start', cursor: 'pointer', border: '1px solid var(--line)', fontFamily: 'inherit', color: 'var(--ink)', opacity: a.is_active ? 1 : 0.55 }} onClick={() => setOpen(a)}>
                  <div className="stat">
                    <span className="label"><Icon name={a.kind === 'cash' ? 'cash' : a.kind === 'bank' ? 'bank' : 'wallet'} size={16} />{a.name}{a.is_default ? <Badge plain tone="accent">الافتراضي</Badge> : null}</span>
                    <span className="value" style={{ color: a.balance < 0 ? 'var(--danger)' : undefined }}>{m(a.balance, a.currency)}</span>
                    <span className="foot">{MONEY_ACCOUNT_KIND[a.kind].label}{a.currency === 'USD' ? ` · ≈ ${m(a.balance_iqd)}` : ''}{!a.is_active ? ' · موقوف' : ''}</span>
                  </div>
                </button>
              ))}
            </>
          )}
        </div>
      )}
      <h2 className="section-title">آخر التحويلات</h2>
      <DataTable rows={transfers.data} columns={tcols} rowKey={(t) => t.id} loading={transfers.loading} error={transfers.error} onRetry={transfers.reload}
        empty={{ icon: 'transfer', title: 'لا تحويلات بعد', text: 'مثل إيداع مبيعات الصندوق في المصرف أو شراء دولار.' }} />
      {transfer ? <TransferModal accounts={active} onClose={() => setTransfer(false)} onDone={() => { setTransfer(false); void list.reload(); void transfers.reload(); }} /> : null}
      {edit ? <AccountModal acc={edit === 'new' ? null : edit} onClose={() => setEdit(null)} onDone={() => { setEdit(null); void list.reload(); }} /> : null}
      {open ? <AccountDrawer acc={open} onClose={() => setOpen(null)} onEdit={can('settings.manage') ? () => { setEdit(open); setOpen(null); } : undefined} /> : null}
    </>
  );
}

function TransferModal({ accounts, onClose, onDone }: { accounts: AccountRow[]; onClose: () => void; onDone: () => void }) {
  const m = useMoney();
  const { rate: today } = useRate();
  const [from, setFrom] = useState(accounts.find((a) => a.kind === 'cash' && a.is_default)?.id ?? accounts[0]?.id ?? '');
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState<number | null>(null);
  const [rate, setRate] = useState<number | null>(today);
  const [note, setNote] = useState('');
  const fa = accounts.find((a) => a.id === from);
  const ta = accounts.find((a) => a.id === to);
  const cross = fa && ta && fa.currency !== ta.currency;
  const received = fa && ta && amount ? (fa.currency === ta.currency ? amount : fa.currency === 'USD' ? amount * (rate ?? 0) : amount / (rate || 1)) : 0;
  const save = useAction(() => transferMoney({ from_account_id: from, to_account_id: to, amount: amount ?? 0, exchange_rate: cross ? rate ?? undefined : undefined, note: note || null }), { success: 'تمّ التحويل' });
  return (
    <Modal open onClose={onClose} title="تحويل بين الحسابات" width={520}
      footer={<><Button onClick={onClose}>إلغاء</Button><Button variant="primary" icon="transfer" loading={save.busy} disabled={!from || !to || !amount} onClick={async () => { if (await save.run()) onDone(); }}>تنفيذ التحويل</Button></>}>
      <div className="stack">
        <div className="form-grid">
          <Field label="من"><Select value={from} onChange={(e) => setFrom(e.target.value)} options={accounts.map((a) => ({ value: a.id, label: `${a.name} — ${m(a.balance, a.currency)}` }))} /></Field>
          <Field label="إلى"><Select value={to} onChange={(e) => setTo(e.target.value)} placeholder="اختر الحساب" options={accounts.filter((a) => a.id !== from).map((a) => ({ value: a.id, label: a.name }))} /></Field>
          <Field label={`المبلغ${fa ? ` (${fa.currency === 'USD' ? 'دولار' : 'دينار'})` : ''}`}><MoneyInput autoFocus value={amount} onChange={setAmount} currency={fa?.currency ?? 'IQD'} /></Field>
          {cross ? <Field label="سعر الصرف" hint="دينار لكل دولار"><NumberInput value={rate} onChange={setRate} /></Field> : null}
        </div>
        {fa && amount && amount > fa.balance ? <Alert tone="warning">المبلغ أكبر من رصيد «{fa.name}» ({m(fa.balance, fa.currency)}).</Alert> : null}
        {cross && ta ? <Alert tone="info">يصل إلى «{ta.name}»: {m(received, ta.currency)}</Alert> : null}
        <Field label="البيان"><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="إيداع مبيعات اليوم" /></Field>
      </div>
    </Modal>
  );
}

function AccountModal({ acc, onClose, onDone }: { acc: AccountRow | null; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ name: acc?.name ?? '', kind: acc?.kind ?? ('cash' as MoneyAccountKind), currency: acc?.currency ?? ('IQD' as CurrencyCode), opening_balance: acc?.opening_balance ?? 0, is_default: acc?.is_default ?? false, is_active: acc?.is_active ?? true, branch_id: acc?.branch_id ?? null });
  const save = useAction(() => saveAccount(f, acc?.id), { success: 'حُفظ الحساب' });
  return (
    <Modal open onClose={onClose} title={acc ? `تعديل «${acc.name}»` : 'حساب جديد'} width={520}
      footer={<><Button onClick={onClose}>إلغاء</Button><Button variant="primary" loading={save.busy} onClick={async () => { if (await save.run()) onDone(); }}>حفظ</Button></>}>
      <div className="form-grid">
        <Field label="الاسم" required><Input autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="صندوق الفرع الثاني" /></Field>
        <Field label="النوع"><Select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as MoneyAccountKind })} options={(['cash', 'bank', 'wallet'] as MoneyAccountKind[]).map((k) => ({ value: k, label: MONEY_ACCOUNT_KIND[k].label }))} /></Field>
        <Field label="العملة"><Select value={f.currency} disabled={!!acc} onChange={(e) => setF({ ...f, currency: e.target.value as CurrencyCode })} options={[{ value: 'IQD', label: 'دينار عراقي' }, { value: 'USD', label: 'دولار أمريكي' }]} /></Field>
        <Field label="الرصيد الافتتاحي"><MoneyInput value={f.opening_balance} onChange={(v) => setF({ ...f, opening_balance: v ?? 0 })} currency={f.currency} /></Field>
      </div>
      <div className="stack-sm" style={{ marginTop: 12 }}>
        <Switch label="الافتراضي لهذه العملة" hint="يُختار تلقائياً في نقطة البيع للنقد" checked={f.is_default} onChange={(v) => setF({ ...f, is_default: v })} />
        <Switch label="فعّال" checked={f.is_active} onChange={(v) => setF({ ...f, is_active: v })} />
      </div>
    </Modal>
  );
}

function AccountDrawer({ acc, onClose, onEdit }: { acc: AccountRow; onClose: () => void; onEdit?: () => void }) {
  const m = useMoney();
  const { store } = useSettings();
  const r = useRange('30d');
  const st = useLoad(() => accountStatement(acc.id, r.range), [acc.id, r.range]);
  return (
    <Drawer open onClose={onClose} width={760} title={acc.name}
      footer={<div className="sx-row">
        {onEdit ? <Button icon="edit" onClick={onEdit}>تعديل الحساب</Button> : null}
        <Button icon="printer" disabled={!st.data} onClick={() => st.data && void printDoc(buildStatementA4({ party: { name: acc.name, phone: null, kind: 'account' }, rows: st.data.rows, opening: st.data.opening, from: r.range?.from ?? null, to: r.range?.to ?? null, store }))}>طباعة الكشف</Button>
      </div>}>
      <div className="stack">
        <Card tone="sunken"><div className="sx-between"><span>الرصيد الحالي</span><b style={{ fontSize: 22 }}>{m(acc.balance, acc.currency)}</b></div></Card>
        <div className="sx-filters"><RangePicker r={r} allowAll /></div>
        {st.error ? <ErrorState message={st.error} onRetry={st.reload} /> : !st.data ? <Loading /> : <StatementView st={st.data} kind="account" />}
      </div>
    </Drawer>
  );
}
