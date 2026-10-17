/** مكونات مشتركة لصفحات البيع والمال: الفترة، اختيار الزبون، سند القبض/الصرف، الحساب */
import { useEffect, useMemo, useState } from 'react';
import {
  baghdadParts, formatMoney, formatPhone, GOVERNORATES, isoDay, PAYMENT_METHOD, startOfBaghdadDay,
  type CurrencyCode, type Customer, type MoneyAccount, type Payment, type PaymentDirection, type PaymentMethod, type Supplier,
} from '@raqeem/shared';
import { Button, Field, Input, Modal, MoneyInput, Select, Segmented, Textarea, Avatar, Badge, Switch } from '../../../ui';
import { useAction, useDebounced, useLoad } from '../../../lib/hooks';
import { useFmt, useSettings } from '../../../lib/settings';
import { recordPayment } from '../api';
import { saveCustomer, searchCustomers, type CustomerHit } from '../data/lookups';
import { useSetting } from '../data/app-settings';
import type { DateRange } from '../data/types';
import { defaultAccountFor, listAccounts, listSuppliersLite, type AccountRow } from '../../finance/api';
import { printVoucher } from '../printing';

// ------------------------------------------------------------------ المال بعملة محددة

/** تنسيق مبلغ بعملة معيّنة بشكل أرقام المتجر */
export function useMoney() {
  const fmt = useFmt();
  return useMemo(() => (n: number | null | undefined, currency: CurrencyCode = 'IQD', bare = false) => formatMoney(n, { currency, digits: fmt.digits, bare }), [fmt.digits]);
}

/** سعر صرف اليوم وتفعيل الدولار */
export function useRate() {
  const c = useSetting('currency');
  return { usd: c.usd_enabled, rate: c.usd_rate || 1310, updatedAt: c.usd_rate_updated_at };
}

export const METHODS_POS: PaymentMethod[] = ['cash', 'card', 'zaincash', 'fib', 'other'];
export const METHODS_ALL: PaymentMethod[] = ['cash', 'card', 'zaincash', 'fib', 'qicard', 'asiapay', 'bank_transfer', 'other'];

// ------------------------------------------------------------------ الفترة

export type RangeKey = 'today' | 'yesterday' | '7d' | '30d' | 'month' | 'lastMonth' | 'year' | 'all' | 'custom';
const RANGE_LABEL: Record<RangeKey, string> = { today: 'اليوم', yesterday: 'أمس', '7d': 'آخر ٧ أيام', '30d': 'آخر ٣٠ يوماً', month: 'هذا الشهر', lastMonth: 'الشهر الماضي', year: 'هذه السنة', all: 'كل الفترات', custom: 'فترة مخصصة' };

export function rangeOf(key: RangeKey, custom?: { from: string; to: string }): DateRange | null {
  const now = Date.now();
  const p = baghdadParts(now);
  const day = (n: number) => startOfBaghdadDay(now, n).toISOString();
  switch (key) {
    case 'today': return { from: day(0), to: day(1) };
    case 'yesterday': return { from: day(-1), to: day(0) };
    case '7d': return { from: day(-6), to: day(1) };
    case '30d': return { from: day(-29), to: day(1) };
    case 'month': return { from: day(1 - p.day), to: day(1) };
    case 'lastMonth': {
      const start = startOfBaghdadDay(Date.UTC(p.year, p.month - 1, 1, 12));
      return { from: start.toISOString(), to: day(1 - p.day) };
    }
    case 'year': return { from: startOfBaghdadDay(Date.UTC(p.year, 0, 1, 12)).toISOString(), to: day(1) };
    case 'custom': {
      if (!custom?.from) return null;
      const f = startOfBaghdadDay(Date.parse(`${custom.from}T12:00:00Z`));
      const t = startOfBaghdadDay(Date.parse(`${custom.to || custom.from}T12:00:00Z`), 1);
      return { from: f.toISOString(), to: t.toISOString() };
    }
    default: return null;
  }
}

/** الفترة السابقة بنفس الطول (لحساب التغيّر) */
export function previousRange(r: DateRange): DateRange {
  const len = Date.parse(r.to) - Date.parse(r.from);
  return { from: new Date(Date.parse(r.from) - len).toISOString(), to: r.from };
}

export function useRange(initial: RangeKey = 'month') {
  const [key, setKey] = useState<RangeKey>(initial);
  const [custom, setCustom] = useState({ from: isoDay(startOfBaghdadDay(Date.now(), -6)), to: isoDay() });
  const range = useMemo(() => rangeOf(key, custom), [key, custom]);
  return { key, setKey, custom, setCustom, range, label: key === 'custom' ? `${custom.from} — ${custom.to}` : RANGE_LABEL[key] };
}

export function RangePicker({ r, allowAll = false, keys }: { r: ReturnType<typeof useRange>; allowAll?: boolean; keys?: RangeKey[] }) {
  const list = keys ?? (['today', 'yesterday', '7d', '30d', 'month', 'lastMonth', 'year', ...(allowAll ? ['all' as const] : []), 'custom'] as RangeKey[]);
  return (
    <>
      <Select aria-label="الفترة" value={r.key} onChange={(e) => r.setKey(e.target.value as RangeKey)} options={list.map((k) => ({ value: k, label: RANGE_LABEL[k] }))} />
      {r.key === 'custom' ? (
        <>
          <Input type="date" aria-label="من" value={r.custom.from} onChange={(e) => r.setCustom({ ...r.custom, from: e.target.value })} />
          <Input type="date" aria-label="إلى" value={r.custom.to} onChange={(e) => r.setCustom({ ...r.custom, to: e.target.value })} />
        </>
      ) : null}
    </>
  );
}

// ------------------------------------------------------------------ الحسابات

export function useAccounts() {
  const l = useLoad(() => listAccounts(), []);
  return { accounts: l.data ?? [], loading: l.loading, reload: l.reload };
}

export function AccountSelect({ accounts, currency, value, onChange, label = 'الصندوق / الحساب' }: { accounts: MoneyAccount[]; currency?: CurrencyCode; value: string | null; onChange: (id: string | null) => void; label?: string }) {
  const opts = accounts.filter((a) => a.is_active && (!currency || a.currency === currency));
  return (
    <Field label={label}>
      <Select value={value ?? ''} onChange={(e) => onChange(e.target.value || null)} options={opts.map((a) => ({ value: a.id, label: `${a.name}${a.currency === 'USD' ? ' ($)' : ''}` }))} placeholder="تلقائي حسب طريقة الدفع" />
    </Field>
  );
}

// ------------------------------------------------------------------ اختيار الزبون

export function CustomerPicker({ open, onClose, onPick, allowCash = true }: { open: boolean; onClose: () => void; onPick: (c: CustomerHit | null) => void; allowCash?: boolean }) {
  const fmt = useFmt();
  const [q, setQ] = useState('');
  const dq = useDebounced(q, 200);
  const list = useLoad(() => (open ? searchCustomers(dq, 20) : Promise.resolve([])), [dq, open]);
  const [adding, setAdding] = useState(false);
  useEffect(() => { if (open) setQ(''); }, [open]);
  return (
    <>
      <Modal open={open && !adding} onClose={onClose} title="اختيار الزبون" subtitle="ابحث بالاسم أو رقم الهاتف بأي صيغة" width={520}
        footer={<>{allowCash ? <Button onClick={() => { onPick(null); onClose(); }}>زبون نقدي</Button> : null}<Button variant="primary" icon="userPlus" onClick={() => setAdding(true)}>زبون جديد</Button></>}>
        <Input autoFocus icon="search" placeholder="الاسم أو 07xx…" value={q} onChange={(e) => setQ(e.target.value)} />
        <div className="list" style={{ marginTop: 8, maxHeight: 360, overflowY: 'auto' }}>
          {(list.data ?? []).map((c) => (
            <button key={c.id} type="button" className="list-item sx-alert-row" style={{ background: 'transparent' }} onClick={() => { onPick(c); onClose(); }}>
              <Avatar name={c.name} size={32} />
              <div className="grow" style={{ minWidth: 0 }}>
                <b className="truncate">{c.name}</b>
                <div className="meta ltr" style={{ textAlign: 'start' }}>{c.phone ? formatPhone(c.phone) : '—'}</div>
              </div>
              {c.balance > 0 ? <Badge tone="danger">عليه {fmt.money(c.balance)}</Badge> : null}
            </button>
          ))}
          {!list.loading && !(list.data ?? []).length ? <p className="sx-muted" style={{ textAlign: 'center', padding: 16 }}>لا زبائن بهذا البحث. أضفه الآن.</p> : null}
        </div>
      </Modal>
      <QuickCustomer open={adding} initialName={/\d/.test(q) ? '' : q} initialPhone={/\d/.test(q) ? q : ''} onClose={() => setAdding(false)} onSaved={(c) => { setAdding(false); onPick({ ...c, balance: 0 }); onClose(); }} />
    </>
  );
}

export function QuickCustomer({ open, onClose, onSaved, initialName = '', initialPhone = '', edit }: { open: boolean; onClose: () => void; onSaved: (c: Customer) => void; initialName?: string; initialPhone?: string; edit?: Customer | null }) {
  const [f, setF] = useState({ name: '', phone: '', phone2: '', governorate: '', city: '', address: '', notes: '', credit_limit: null as number | null, limited: false });
  useEffect(() => {
    if (!open) return;
    if (edit) setF({ name: edit.name, phone: edit.phone ? formatPhone(edit.phone) : '', phone2: edit.phone2 ? formatPhone(edit.phone2) : '', governorate: edit.governorate ?? '', city: edit.city ?? '', address: edit.address ?? '', notes: edit.notes ?? '', credit_limit: edit.credit_limit, limited: edit.credit_limit !== null });
    else setF({ name: initialName, phone: initialPhone, phone2: '', governorate: '', city: '', address: '', notes: '', credit_limit: null, limited: false });
  }, [open, edit, initialName, initialPhone]);
  const save = useAction(async () => saveCustomer({ name: f.name, phone: f.phone, phone2: f.phone2, governorate: f.governorate || null, city: f.city || null, address: f.address || null, notes: f.notes || null, credit_limit: f.limited ? f.credit_limit ?? 0 : null }, edit?.id), { success: edit ? 'حُفظت بيانات الزبون' : 'أُضيف الزبون' });
  return (
    <Modal open={open} onClose={onClose} title={edit ? 'تعديل الزبون' : 'زبون جديد'} width={560}
      footer={<><Button onClick={onClose}>إلغاء</Button><Button variant="primary" loading={save.busy} onClick={async () => { const c = await save.run(); if (c) onSaved(c); }}>{edit ? 'حفظ التعديل' : 'إضافة الزبون'}</Button></>}>
      <div className="form-grid">
        <Field label="الاسم" required><Input autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="الهاتف"><Input dir="ltr" inputMode="tel" placeholder="0770 123 4567" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
        <Field label="هاتف ثانٍ"><Input dir="ltr" inputMode="tel" value={f.phone2} onChange={(e) => setF({ ...f, phone2: e.target.value })} /></Field>
        <Field label="المحافظة"><Select value={f.governorate} onChange={(e) => setF({ ...f, governorate: e.target.value })} placeholder="—" options={GOVERNORATES.map((g) => ({ value: g.key, label: g.name }))} /></Field>
        <Field label="المدينة / المنطقة"><Input value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} /></Field>
        <Field label="العنوان"><Input value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></Field>
      </div>
      <div style={{ marginTop: 12 }}>
        <Switch label="حدّ للدين" hint="منع البيع بالآجل فوق مبلغ معيّن" checked={f.limited} onChange={(v) => setF({ ...f, limited: v })} />
        {f.limited ? <div style={{ marginTop: 8, maxWidth: 260 }}><MoneyInput value={f.credit_limit} onChange={(v) => setF({ ...f, credit_limit: v })} ariaLabel="حد الدين" /></div> : null}
      </div>
      <Field label="ملاحظات" className="span-2"><Textarea rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
    </Modal>
  );
}

// ------------------------------------------------------------------ سند قبض / صرف

export interface VoucherPreset {
  direction?: PaymentDirection;
  customer?: Pick<Customer, 'id' | 'name' | 'phone'> | null;
  supplier?: Pick<Supplier, 'id' | 'name' | 'phone'> | null;
  invoice?: { id: string; number: string; due: number; currency: CurrencyCode } | null;
  amount?: number | null;
  currency?: CurrencyCode;
}

export function VoucherModal({ open, onClose, preset, onDone }: { open: boolean; onClose: () => void; preset?: VoucherPreset; onDone?: (p: Payment) => void }) {
  const { store } = useSettings();
  const m = useMoney();
  const { usd, rate } = useRate();
  const { accounts } = useAccounts();
  const sups = useLoad(() => (open ? listSuppliersLite() : Promise.resolve([] as Supplier[])), [open]);
  const [dir, setDir] = useState<PaymentDirection>('in');
  const [partyKind, setPartyKind] = useState<'customer' | 'supplier' | 'none'>('customer');
  const [customer, setCustomer] = useState<VoucherPreset['customer']>(null);
  const [supplierId, setSupplierId] = useState('');
  const [amount, setAmount] = useState<number | null>(null);
  const [currency, setCurrency] = useState<CurrencyCode>('IQD');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [account, setAccount] = useState<string | null>(null);
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [print, setPrint] = useState(true);
  const [picking, setPicking] = useState(false);

  useEffect(() => {
    if (!open) return;
    setDir(preset?.direction ?? 'in');
    setPartyKind(preset?.supplier ? 'supplier' : preset?.customer || !preset ? 'customer' : 'customer');
    setCustomer(preset?.customer ?? null);
    setSupplierId(preset?.supplier?.id ?? '');
    setAmount(preset?.amount ?? preset?.invoice?.due ?? null);
    setCurrency(preset?.currency ?? preset?.invoice?.currency ?? 'IQD');
    setMethod('cash'); setAccount(null); setReference(''); setNote('');
  }, [open, preset]);

  const acc: AccountRow | MoneyAccount | undefined = account ? accounts.find((a) => a.id === account) : defaultAccountFor(accounts, method, currency);
  const save = useAction(async () => {
    const p = await recordPayment({
      direction: dir, method, amount: amount ?? 0, currency, exchange_rate: currency === 'USD' ? rate : undefined, account_id: acc?.id ?? null,
      customer_id: partyKind === 'customer' ? customer?.id ?? null : null, supplier_id: partyKind === 'supplier' ? supplierId || null : null,
      invoice_id: preset?.invoice?.id ?? null, reference: reference || null, note: note || null,
    });
    const partyName = partyKind === 'customer' ? customer?.name ?? null : partyKind === 'supplier' ? sups.data?.find((s) => s.id === supplierId)?.name ?? null : null;
    if (print) await printVoucher(p, partyName, store, { invoiceNumber: preset?.invoice?.number ?? null }).catch(() => undefined);
    return p;
  }, { success: dir === 'in' ? 'سُجّل سند القبض' : 'سُجّل سند الصرف' });

  const needsParty = partyKind !== 'none' && (partyKind === 'customer' ? !customer : !supplierId);
  return (
    <>
      <Modal open={open && !picking} onClose={onClose} width={560} title={dir === 'in' ? 'سند قبض' : 'سند صرف'} subtitle={preset?.invoice ? `على الفاتورة ${preset.invoice.number} — المتبقي ${m(preset.invoice.due, preset.invoice.currency)}` : dir === 'in' ? 'مبلغ استلمته من زبون أو جهة' : 'مبلغ دفعته لمورد أو جهة'}
        footer={<><Button onClick={onClose}>إلغاء</Button><Button variant="primary" icon="check" loading={save.busy} disabled={!amount || needsParty} onClick={async () => { const p = await save.run(); if (p) { onDone?.(p); onClose(); } }}>{dir === 'in' ? 'حفظ سند القبض' : 'حفظ سند الصرف'}</Button></>}>
        <div className="stack">
          {!preset?.invoice ? (
            <div className="sx-row">
              <Segmented value={dir} onChange={setDir} options={[{ value: 'in', label: 'قبض' }, { value: 'out', label: 'صرف' }]} />
              <Segmented value={partyKind} onChange={setPartyKind} options={[{ value: 'customer', label: 'زبون' }, { value: 'supplier', label: 'مورد' }, { value: 'none', label: 'بلا طرف' }]} />
            </div>
          ) : null}
          {partyKind === 'customer' ? (
            <Field label="الزبون" required>
              <button type="button" className="pos-cust" style={{ border: 0, width: '100%', cursor: preset?.invoice ? 'default' : 'pointer', textAlign: 'start', color: 'var(--ink)', fontFamily: 'inherit' }} onClick={() => !preset?.invoice && setPicking(true)}>
                <Avatar name={customer?.name ?? '؟'} size={30} />
                <span className="grow"><b>{customer?.name ?? 'اختر الزبون'}</b>{customer?.phone ? <div className="sx-muted ltr" style={{ textAlign: 'start' }}>{formatPhone(customer.phone)}</div> : null}</span>
              </button>
            </Field>
          ) : partyKind === 'supplier' ? (
            <Field label="المورد" required><Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} placeholder="اختر المورد" options={(sups.data ?? []).map((s) => ({ value: s.id, label: s.name }))} /></Field>
          ) : null}
          <div className="form-grid">
            <Field label="المبلغ" required><MoneyInput autoFocus value={amount} onChange={setAmount} currency={currency} /></Field>
            {usd && !preset?.invoice ? <Field label="العملة"><Segmented value={currency} onChange={(c) => { setCurrency(c); setAccount(null); }} options={[{ value: 'IQD', label: 'دينار' }, { value: 'USD', label: 'دولار' }]} /></Field> : null}
            <Field label="طريقة الدفع"><Select value={method} onChange={(e) => { setMethod(e.target.value as PaymentMethod); setAccount(null); }} options={METHODS_ALL.map((x) => ({ value: x, label: PAYMENT_METHOD[x].label }))} /></Field>
            <AccountSelect accounts={accounts} currency={currency} value={acc?.id ?? null} onChange={setAccount} />
            {method !== 'cash' ? <Field label="رقم العملية"><Input dir="ltr" value={reference} onChange={(e) => setReference(e.target.value)} /></Field> : null}
          </div>
          {currency === 'USD' ? <p className="sx-muted">بسعر صرف اليوم {m(rate)} للدولار — يعادل {m((amount ?? 0) * rate)}</p> : null}
          <Field label="البيان / ملاحظة"><Input value={note} onChange={(e) => setNote(e.target.value)} placeholder={dir === 'in' ? 'دفعة من الحساب' : 'تسديد فاتورة'} /></Field>
          <Switch label="طباعة السند بعد الحفظ" checked={print} onChange={setPrint} />
        </div>
      </Modal>
      <CustomerPicker open={picking} allowCash={false} onClose={() => setPicking(false)} onPick={(c) => c && setCustomer(c)} />
    </>
  );
}

/** نص كشف/تذكير واتساب مختصر */
export const isoDate = (d: string | number) => isoDay(d);
