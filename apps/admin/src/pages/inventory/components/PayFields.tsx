import { PAYMENT_METHOD, type CurrencyCode, type MoneyAccount, type PaymentMethod } from '@raqeem/shared';
import { Field, Input, MoneyInput, Select } from '../../../ui';

export interface PayDraft { method: PaymentMethod; amount: number | null; account_id: string; reference: string }

export const emptyPay = (): PayDraft => ({ method: 'cash', amount: null, account_id: '', reference: '' });

const METHODS: PaymentMethod[] = ['cash', 'bank_transfer', 'zaincash', 'fib', 'qicard', 'asiapay', 'card', 'other'];

/** حقول دفعة: الطريقة، المبلغ بعملة المستند، الحساب (صندوق/مصرف بنفس العملة)، والمرجع */
export function PayFields({ value, onChange, currency, accounts, amountLabel = 'المبلغ' }: {
  value: PayDraft; onChange: (v: PayDraft) => void; currency: CurrencyCode; accounts: MoneyAccount[]; amountLabel?: string;
}) {
  const accs = accounts.filter((a) => a.is_active && a.currency === currency);
  return (
    <div className="grid-2">
      <Field label="طريقة الدفع"><Select value={value.method} onChange={(e) => onChange({ ...value, method: e.target.value as PaymentMethod })} options={METHODS.map((m) => ({ value: m, label: PAYMENT_METHOD[m].label }))} /></Field>
      <Field label={amountLabel}><MoneyInput value={value.amount} currency={currency} onChange={(n) => onChange({ ...value, amount: n })} /></Field>
      <Field label="من حساب" hint={!accs.length ? 'لا حساب بهذه العملة: يُستعمل الصندوق الافتراضي' : undefined}>
        <Select value={value.account_id} onChange={(e) => onChange({ ...value, account_id: e.target.value })} placeholder="الافتراضي للطريقة" options={accs.map((a) => ({ value: a.id, label: a.name }))} />
      </Field>
      {value.method !== 'cash' ? <Field label="رقم الحوالة / المرجع"><Input value={value.reference} dir="ltr" onChange={(e) => onChange({ ...value, reference: e.target.value })} /></Field> : null}
    </div>
  );
}
