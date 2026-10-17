/**
 * نافذة الدفع: نقد بمبالغ سريعة وفكة، بطاقة/زين كاش/الأول/أخرى، دفع مجزأ، «الواصل بالدولار»، والباقي آجل ضمن حد الدين.
 * كل دفعة بعملتها وحسابها — تُرسل كما هي في payments[] لـ pos_checkout / convert_quotation.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { PAYMENT_METHOD, roundMoney, tender, type CurrencyCode, type PaymentMethod } from '@raqeem/shared';
import { Alert, Button, IconButton, Input, Kbd, Modal, MoneyInput, Select } from '../../../ui';
import { useHotkey } from '../../../lib/hooks';
import type { PayLine } from '../data/types';
import { convert } from '../data/ledger';
import { defaultAccountFor } from '../../finance/api';
import { METHODS_POS, useAccounts, useMoney } from './common';

interface Line { method: PaymentMethod; amount: number | null; currency: CurrencyCode; account_id: string | null; reference: string }

export function PaymentModal({ open, onClose, total, currency, rate, usdEnabled, customer, onConfirm, busy, title = 'الدفع' }: {
  open: boolean; onClose: () => void; total: number; currency: CurrencyCode; rate: number; usdEnabled: boolean;
  customer: { name: string; credit_limit: number | null; balance: number } | null;
  onConfirm: (payments: PayLine[]) => void; busy?: boolean; title?: string;
}) {
  const m = useMoney();
  const { accounts } = useAccounts();
  const [lines, setLines] = useState<Line[]>([]);
  const [active, setActive] = useState(0);
  const first = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    setLines([{ method: 'cash', amount: total, currency, account_id: null, reference: '' }]);
    setActive(0);
    setTimeout(() => first.current?.querySelector('input')?.select(), 60);
  }, [open, total, currency]);

  const inInv = (l: Line) => convert(l.amount ?? 0, l.currency, currency, rate);
  const t = useMemo(() => tender(total, lines.map((l) => ({ method: l.method, amount: inInv(l) })), currency), [lines, total, currency, rate]);
  const credit = t.remaining > 0.004;
  const creditIqd = convert(t.remaining, currency, 'IQD', rate);
  const overLimit = !!customer && customer.credit_limit !== null && customer.balance + creditIqd > customer.credit_limit;
  const blocked = credit && (!customer || overLimit);

  const set = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const add = (method: PaymentMethod, cur: CurrencyCode = currency) => {
    const rem = convert(t.remaining, currency, cur, rate);
    setLines((ls) => [...ls, { method, amount: rem > 0 ? roundMoney(rem, cur) : null, currency: cur, account_id: null, reference: '' }]);
    setActive(lines.length);
  };
  const quick = useMemo(() => {
    const cur = lines[active]?.currency ?? currency;
    const other = lines.filter((_, i) => i !== active).reduce((s, l) => s + convert(l.amount ?? 0, l.currency, cur, rate), 0);
    const need = Math.max(0, convert(total, currency, cur, rate) - other);
    if (cur === 'USD') return [Math.ceil(need), ...[10, 20, 50, 100].map((s) => Math.ceil(need / s) * s)].filter((v, i, a) => v > 0 && a.indexOf(v) === i).slice(0, 5);
    return [roundMoney(need), ...[1000, 5000, 10000, 25000, 50000].map((s) => Math.ceil(need / s) * s)].filter((v, i, a) => v > 0 && a.indexOf(v) === i).slice(0, 6);
  }, [lines, active, total, currency, rate]);

  const submit = () => {
    if (blocked || busy) return;
    onConfirm(lines.filter((l) => (l.amount ?? 0) > 0).map((l) => ({
      method: l.method, amount: l.amount ?? 0, currency: l.currency,
      account_id: l.account_id ?? defaultAccountFor(accounts, l.method, l.currency)?.id ?? null, reference: l.reference || undefined,
    })));
  };
  useHotkey('F9', submit, open);

  const usdLine = lines.findIndex((l) => l.method === 'cash' && l.currency === 'USD');
  return (
    <Modal open={open} onClose={onClose} title={title} width={720}
      footer={<>
        <Button onClick={onClose}>رجوع</Button>
        <Button variant="primary" size="lg" icon="check" loading={busy} disabled={blocked} onClick={submit} kbd="F9">
          {credit ? `تأكيد البيع — الباقي آجل ${m(t.remaining, currency)}` : 'تأكيد البيع'}
        </Button>
      </>}>
      <div className="stack">
        <div className="pay-total">
          <small>المطلوب</small>
          <div className="big">{m(total, currency)}</div>
          {usdEnabled ? <small>{currency === 'IQD' ? `≈ ${m(total / rate, 'USD')}` : `≈ ${m(total * rate)}`} · سعر الصرف {m(rate, 'IQD', true)}</small> : null}
        </div>

        {lines.map((l, i) => (
          <div key={i} className="pay-line" ref={i === 0 ? first : undefined} onFocus={() => setActive(i)}>
            <Select aria-label="الطريقة" value={l.method} onChange={(e) => set(i, { method: e.target.value as PaymentMethod, account_id: null })} options={METHODS_POS.map((x) => ({ value: x, label: PAYMENT_METHOD[x].label }))} />
            <MoneyInput value={l.amount} onChange={(v) => set(i, { amount: v })} currency={l.currency} onEnter={submit} ariaLabel="المبلغ" />
            {usdEnabled ? <Select aria-label="العملة" value={l.currency} onChange={(e) => set(i, { currency: e.target.value as CurrencyCode, account_id: null })} options={[{ value: 'IQD', label: 'دينار' }, { value: 'USD', label: 'دولار' }]} /> : <span />}
            {l.method === 'cash'
              ? <Select aria-label="الصندوق" value={l.account_id ?? ''} onChange={(e) => set(i, { account_id: e.target.value || null })} placeholder={defaultAccountFor(accounts, 'cash', l.currency)?.name ?? 'الصندوق'} options={accounts.filter((a) => a.currency === l.currency).map((a) => ({ value: a.id, label: a.name }))} />
              : <Input dir="ltr" placeholder="رقم العملية (اختياري)" value={l.reference} onChange={(e) => set(i, { reference: e.target.value })} />}
            {lines.length > 1 ? <IconButton icon="close" label="حذف الدفعة" onClick={() => setLines((ls) => ls.filter((_, j) => j !== i))} /> : <span />}
          </div>
        ))}

        {lines[active]?.method === 'cash' ? (
          <div className="pay-quick" aria-label="مبالغ سريعة">
            {quick.map((v) => <button key={v} type="button" onClick={() => set(active, { amount: v })}>{m(v, lines[active].currency, true)}</button>)}
          </div>
        ) : null}

        <div className="sx-row">
          <span className="sx-muted">إضافة دفعة:</span>
          {METHODS_POS.map((x) => <Button key={x} size="sm" onClick={() => add(x)}>{PAYMENT_METHOD[x].label}</Button>)}
          {usdEnabled && currency === 'IQD' && usdLine < 0 ? <Button size="sm" icon="coins" onClick={() => add('cash', 'USD')}>الواصل بالدولار</Button> : null}
        </div>

        <div className="pay-sum">
          <div><span className="sx-muted">المدفوع</span><b>{m(t.paid, currency)}</b></div>
          <div className={t.change > 0 ? 'change' : ''}><span className="sx-muted">الباقي للزبون</span><b>{m(t.change, currency)}</b>{t.change > 0 && currency === 'IQD' && usdLine >= 0 ? <small className="sx-muted">يُرد بالدينار</small> : null}</div>
          <div className={credit ? 'due' : ''}><span className="sx-muted">آجل (دين)</span><b>{m(t.remaining, currency)}</b></div>
        </div>
        {credit && !customer ? <Alert tone="warning">البيع بالآجل يحتاج اختيار زبون مسجّل. اختر الزبون (<Kbd>F4</Kbd>) أو أكمل المبلغ.</Alert> : null}
        {credit && overLimit ? <Alert tone="danger">يتجاوز حد الدين لـ«{customer!.name}»: الحد {m(customer!.credit_limit)} والرصيد الحالي {m(customer!.balance)}.</Alert> : null}
        {credit && customer && !overLimit ? <Alert tone="info">سيُسجَّل {m(t.remaining, currency)} ديناً على «{customer.name}».</Alert> : null}
      </div>
    </Modal>
  );
}
