/**
 * بيانات «الزبائن والمال»: الزبائن وأرصدتهم، الديون وأعمارها، السندات، الصناديق والحسابات والتحويل،
 * الكشوفات، جلسات الصندوق، المصروفات، والتقارير. كل دالة تفرّع: وضع العرض (ledger) أو Supabase بأسماء العقد.
 *
 * RPC المستعملة هنا (system/11-rpc-contract.md):
 *   record_expense({p:{category, amount, currency, exchange_rate?, account_id, method, note, spent_at?}})
 *   transfer_money({p:{from_account_id, to_account_id, amount, exchange_rate?, note}})  — المبلغ بعملة المصدر
 *   customer_statement({customer_id, from, to}) / supplier_statement({supplier_id, from, to})
 *     → {opening:{IQD,USD}, rows:[{at, doc_type, doc_id, number, description, currency, debit, credit, balance}], closing:{IQD,USD}}
 *   inventory_valuation() · stagnant_products({days, lim})
 */
import {
  roundMoney, PAYMENT_METHOD,
  type AccountTransfer, type CashSession, type CurrencyCode, type Customer, type CustomerBalance, type Expense, type Invoice, type InventoryValuationRow,
  type MoneyAccount, type MoneyAccountBalance, type Payment, type PaymentDirection, type PaymentMethod, type Supplier,
} from '@raqeem/shared';
import { IS_DEMO } from '../../lib/env';
import { demoChanged, demoDb, demoDelay, demoId } from '../../lib/demo-db';
import { AppError, rpc, sb } from '../../lib/supabase';
import {
  convert, demoAccountBalance, demoAudit, demoCustomerBalance, demoRate, demoSessionTotals, ledger, nextDoc, staffName, variantCost,
} from '../sales/data/ledger';
import { staffNames } from '../sales/data/lookups';
import type { DateRange, PaymentRow, Statement, StatementRow } from '../sales/data/types';

const nowIso = () => new Date().toISOString();
const inRange = (t: string, r: DateRange | null) => !r || (t >= r.from && t < r.to);
const DAY = 86_400_000;

// ================================================================== الزبائن

export interface CustomerRow extends Customer { balance: number; balance_usd: number; sales_total: number; last_activity_at: string | null }

export async function listCustomers(): Promise<CustomerRow[]> {
  if (IS_DEMO) {
    await demoDelay();
    return demoDb.customers.filter((c) => !c.is_cash_customer).map((c) => withBal(c, demoCustomerBalance(c.id)));
  }
  const [cs, bs] = await Promise.all([
    sb().from('customers').select('*').eq('is_cash_customer', false).order('updated_at', { ascending: false }).limit(5000),
    sb().from('customer_balances').select('*').limit(5000),
  ]);
  if (cs.error) throw cs.error;
  const bal = new Map(((bs.data ?? []) as CustomerBalance[]).map((b) => [b.customer_id, b]));
  return (cs.data as Customer[]).map((c) => withBal(c, bal.get(c.id)));
}
const withBal = (c: Customer, b?: CustomerBalance): CustomerRow => ({
  ...c, balance: Number(b?.balance ?? 0), balance_usd: Number(b?.balance_usd ?? 0), sales_total: Number(b?.sales_total ?? 0), last_activity_at: b?.last_activity_at ?? null,
});

// ================================================================== الديون (أعمار الذمم)

export interface DebtRow {
  customer: Customer;
  balance: number; balance_usd: number;
  /** المستحق حسب عمر الفاتورة بالدينار (المكافئ) */
  aging: { d30: number; d60: number; d90: number; older: number };
  oldest_at: string | null;
  open_invoices: number;
}

export async function listDebts(): Promise<DebtRow[]> {
  let customers: Customer[]; let bal: Map<string, { balance: number; balance_usd: number }>; let open: Pick<Invoice, 'customer_id' | 'due' | 'currency' | 'exchange_rate' | 'created_at'>[];
  if (IS_DEMO) {
    await demoDelay();
    customers = demoDb.customers.filter((c) => !c.is_cash_customer);
    bal = new Map(customers.map((c) => [c.id, demoCustomerBalance(c.id)]));
    open = ledger.invoices.filter((i) => i.kind === 'sale' && i.status === 'posted' && i.due > 0.001);
  } else {
    const [bs, inv] = await Promise.all([
      sb().from('customer_balances').select('customer_id,balance,balance_usd').or('balance.gt.0,balance_usd.gt.0').limit(5000),
      sb().from('invoices').select('customer_id,due,currency,exchange_rate,created_at').eq('kind', 'sale').eq('status', 'posted').gt('due', 0).limit(20000),
    ]);
    if (bs.error) throw bs.error;
    if (inv.error) throw inv.error;
    bal = new Map(((bs.data ?? []) as CustomerBalance[]).map((b) => [b.customer_id, { balance: Number(b.balance), balance_usd: Number(b.balance_usd) }]));
    open = (inv.data ?? []) as typeof open;
    const ids = [...bal.keys()];
    const cs = ids.length ? await sb().from('customers').select('*').in('id', ids) : { data: [], error: null };
    if (cs.error) throw cs.error;
    customers = cs.data as Customer[];
  }
  const now = Date.now();
  const rows: DebtRow[] = [];
  for (const c of customers) {
    const b = bal.get(c.id);
    if (!b || (b.balance <= 0.001 && b.balance_usd <= 0.001)) continue;
    const mine = open.filter((i) => i.customer_id === c.id);
    const aging = { d30: 0, d60: 0, d90: 0, older: 0 };
    for (const i of mine) {
      const iqd = i.currency === 'USD' ? i.due * i.exchange_rate : i.due;
      const age = (now - Date.parse(i.created_at)) / DAY;
      if (age <= 30) aging.d30 += iqd; else if (age <= 60) aging.d60 += iqd; else if (age <= 90) aging.d90 += iqd; else aging.older += iqd;
    }
    const oldest = mine.map((i) => i.created_at).sort()[0] ?? null;
    rows.push({ customer: c, balance: b.balance, balance_usd: b.balance_usd, aging, oldest_at: oldest, open_invoices: mine.length });
  }
  return rows.sort((a, b) => (b.balance + b.balance_usd * 1300) - (a.balance + a.balance_usd * 1300));
}

// ================================================================== السندات (قبض / صرف)

export interface PaymentFilter { direction: PaymentDirection | ''; q: string; range: DateRange | null; accountId?: string; customerId?: string; supplierId?: string; page: number; pageSize: number }

export async function listPayments(f: PaymentFilter): Promise<{ rows: PaymentRow[]; total: number; inIqd: number; outIqd: number }> {
  if (IS_DEMO) {
    await demoDelay();
    const q = f.q.trim();
    let rows = ledger.payments.filter((p) => !p.voided_at && (!f.direction || p.direction === f.direction) && inRange(p.created_at, f.range)
      && (!f.accountId || p.account_id === f.accountId) && (!f.customerId || p.customer_id === f.customerId) && (!f.supplierId || p.supplier_id === f.supplierId));
    const full = rows.map((p) => decorate(p));
    const filtered = q ? full.filter((p) => `${p.number} ${p.party_name ?? ''} ${p.invoice_number ?? ''} ${p.note ?? ''}`.includes(q)) : full;
    filtered.sort((a, b) => b.created_at.localeCompare(a.created_at));
    rows = filtered;
    const inIqd = filtered.filter((p) => p.direction === 'in').reduce((s, p) => s + p.amount_iqd, 0);
    const outIqd = filtered.filter((p) => p.direction === 'out').reduce((s, p) => s + p.amount_iqd, 0);
    return { rows: filtered.slice(f.page * f.pageSize, (f.page + 1) * f.pageSize), total: filtered.length, inIqd, outIqd };
  }
  let query = sb().from('payments').select('*, customers(name), suppliers(name), invoices(number)', { count: 'exact' }).is('voided_at', null).order('created_at', { ascending: false });
  if (f.direction) query = query.eq('direction', f.direction);
  if (f.range) query = query.gte('created_at', f.range.from).lt('created_at', f.range.to);
  if (f.accountId) query = query.eq('account_id', f.accountId);
  if (f.customerId) query = query.eq('customer_id', f.customerId);
  if (f.supplierId) query = query.eq('supplier_id', f.supplierId);
  if (f.q.trim()) query = query.or(`number.ilike.%${f.q.trim().replace(/[%_,()]/g, '')}%,note.ilike.%${f.q.trim().replace(/[%_,()]/g, '')}%`);
  const { data, error, count } = await query.range(f.page * f.pageSize, (f.page + 1) * f.pageSize - 1);
  if (error) throw error;
  const names = await staffNames();
  type R = Payment & { customers: { name: string } | null; suppliers: { name: string } | null; invoices: { number: string } | null };
  const rows = ((data ?? []) as R[]).map(({ customers, suppliers, invoices, ...p }) => ({ ...p, party_name: customers?.name ?? suppliers?.name ?? null, invoice_number: invoices?.number ?? null, created_by_name: p.created_by ? names[p.created_by] ?? null : null }));
  const inIqd = rows.filter((p) => p.direction === 'in').reduce((s, p) => s + Number(p.amount_iqd), 0);
  const outIqd = rows.filter((p) => p.direction === 'out').reduce((s, p) => s + Number(p.amount_iqd), 0);
  return { rows, total: count ?? rows.length, inIqd, outIqd };
}

function decorate(p: Payment): PaymentRow {
  const party = p.customer_id ? demoDb.customers.find((c) => c.id === p.customer_id)?.name : p.supplier_id ? demoDb.suppliers.find((s) => s.id === p.supplier_id)?.name : null;
  return { ...p, party_name: party ?? null, invoice_number: p.invoice_id ? ledger.invoices.find((i) => i.id === p.invoice_id)?.number ?? null : null, created_by_name: staffName(p.created_by) };
}

export async function listSuppliersLite(): Promise<Supplier[]> {
  if (IS_DEMO) { await demoDelay(60); return demoDb.suppliers; }
  const { data, error } = await sb().from('suppliers').select('*').order('name').limit(2000);
  if (error) throw error;
  return data as Supplier[];
}

// ================================================================== الصناديق والحسابات

export interface AccountRow extends MoneyAccount { balance: number; balance_iqd: number }

export async function listAccounts(includeInactive = false): Promise<AccountRow[]> {
  if (IS_DEMO) {
    await demoDelay(80);
    return demoDb.money_accounts.filter((a) => includeInactive || a.is_active).map((a) => ({ ...a, ...demoAccountBalance(a) }));
  }
  let q = sb().from('money_accounts').select('*').order('created_at');
  if (!includeInactive) q = q.eq('is_active', true);
  const [as, bs] = await Promise.all([q, sb().from('money_account_balances').select('*')]);
  if (as.error) throw as.error;
  const bal = new Map(((bs.data ?? []) as MoneyAccountBalance[]).map((b) => [b.account_id, b]));
  return (as.data as MoneyAccount[]).map((a) => ({ ...a, balance: Number(bal.get(a.id)?.balance ?? a.opening_balance), balance_iqd: Number(bal.get(a.id)?.balance_iqd ?? 0) }));
}

/** الحساب الافتراضي لطريقة دفع وعملة (للنقد: الصندوق الافتراضي؛ وإلا أول حساب مناسب) */
export function defaultAccountFor(accounts: MoneyAccount[], method: PaymentMethod, currency: CurrencyCode): MoneyAccount | undefined {
  const act = accounts.filter((a) => a.is_active && a.currency === currency);
  if (method === 'cash') return act.find((a) => a.kind === 'cash' && a.is_default) ?? act.find((a) => a.kind === 'cash');
  if (['zaincash', 'asiapay', 'qicard'].includes(method)) return act.find((a) => a.kind === 'wallet') ?? act.find((a) => a.kind === 'bank');
  return act.find((a) => a.kind === 'bank') ?? act.find((a) => a.kind !== 'cash');
}

export type AccountInput = Pick<MoneyAccount, 'name' | 'kind' | 'currency' | 'opening_balance' | 'is_default' | 'is_active' | 'branch_id'>;

export async function saveAccount(input: AccountInput, id?: string): Promise<MoneyAccount> {
  if (!input.name.trim()) throw new AppError('اكتب اسم الحساب.');
  if (IS_DEMO) {
    await demoDelay();
    if (input.is_default) demoDb.money_accounts.forEach((a) => { if (a.currency === input.currency) a.is_default = false; });
    let a = id ? demoDb.money_accounts.find((x) => x.id === id) : undefined;
    if (a) Object.assign(a, input);
    else { a = { id: demoId(), created_at: nowIso(), ...input }; demoDb.money_accounts.push(a); }
    demoAudit(id ? 'update' : 'insert', 'money_accounts', a.id, { name: a.name });
    demoChanged();
    return a;
  }
  const q = id ? sb().from('money_accounts').update(input).eq('id', id) : sb().from('money_accounts').insert(input);
  const { data, error } = await q.select().single();
  if (error) throw error;
  return data as MoneyAccount;
}

export interface TransferPayload { from_account_id: string; to_account_id: string; amount: number; exchange_rate?: number; note?: string | null }

export async function transferMoney(p: TransferPayload): Promise<AccountTransfer> {
  if (!IS_DEMO) return rpc<AccountTransfer>('transfer_money', { p });
  await demoDelay();
  if (p.from_account_id === p.to_account_id) throw new AppError('اختر حسابين مختلفين.');
  if (!(p.amount > 0)) throw new AppError('اكتب مبلغاً أكبر من صفر.');
  const from = demoDb.money_accounts.find((a) => a.id === p.from_account_id);
  const to = demoDb.money_accounts.find((a) => a.id === p.to_account_id);
  if (!from || !to) throw new AppError('الحساب غير موجود.');
  if (demoAccountBalance(from).balance < p.amount) throw new AppError(`الرصيد في «${from.name}» لا يكفي.`);
  const t: AccountTransfer = { id: demoId(), number: nextDoc('account_transfer'), from_account_id: from.id, to_account_id: to.id, amount: p.amount, exchange_rate: from.currency === to.currency ? 1 : p.exchange_rate ?? demoRate(), note: p.note ?? null, created_by: 'demo-owner', created_at: nowIso() };
  ledger.account_transfers.push(t);
  demoAudit('transfer', 'account_transfers', t.id, { number: t.number, amount: t.amount });
  demoChanged();
  return t;
}

export interface TransferRow extends AccountTransfer { from_name: string; to_name: string; from_currency: CurrencyCode; to_currency: CurrencyCode }

export async function listTransfers(range: DateRange | null): Promise<TransferRow[]> {
  let rows: AccountTransfer[]; let accounts: MoneyAccount[];
  if (IS_DEMO) { await demoDelay(80); rows = ledger.account_transfers.filter((t) => inRange(t.created_at, range)); accounts = demoDb.money_accounts; }
  else {
    let q = sb().from('account_transfers').select('*').order('created_at', { ascending: false }).limit(500);
    if (range) q = q.gte('created_at', range.from).lt('created_at', range.to);
    const [t, a] = await Promise.all([q, sb().from('money_accounts').select('*')]);
    if (t.error) throw t.error;
    rows = t.data as AccountTransfer[]; accounts = (a.data ?? []) as MoneyAccount[];
  }
  const acc = (id: string) => accounts.find((a) => a.id === id);
  return rows.map((t) => ({ ...t, from_name: acc(t.from_account_id)?.name ?? '—', to_name: acc(t.to_account_id)?.name ?? '—', from_currency: acc(t.from_account_id)?.currency ?? 'IQD', to_currency: acc(t.to_account_id)?.currency ?? 'IQD' }))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

/** كشف صندوق/حساب: كل ما دخل وخرج منه برصيد تراكمي بعملته (الافتتاحي = رصيد ما قبل الفترة) */
export async function accountStatement(accountId: string, range: DateRange | null): Promise<Statement & { account: MoneyAccount }> {
  let account: MoneyAccount | undefined; let pays: (Payment & { party?: string | null; inv?: string | null })[]; let exps: Expense[]; let trs: AccountTransfer[]; let accounts: MoneyAccount[];
  if (IS_DEMO) {
    await demoDelay();
    accounts = demoDb.money_accounts;
    account = accounts.find((a) => a.id === accountId);
    pays = ledger.payments.filter((p) => p.account_id === accountId && !p.voided_at).map((p) => { const d = decorate(p); return { ...p, party: d.party_name, inv: d.invoice_number }; });
    exps = ledger.expenses.filter((e) => e.account_id === accountId);
    trs = ledger.account_transfers.filter((t) => t.from_account_id === accountId || t.to_account_id === accountId);
  } else {
    const [a, p, e, t, all] = await Promise.all([
      sb().from('money_accounts').select('*').eq('id', accountId).single(),
      sb().from('payments').select('*, customers(name), suppliers(name), invoices(number)').eq('account_id', accountId).is('voided_at', null).limit(20000),
      sb().from('expenses').select('*').eq('account_id', accountId).limit(20000),
      sb().from('account_transfers').select('*').or(`from_account_id.eq.${accountId},to_account_id.eq.${accountId}`).limit(20000),
      sb().from('money_accounts').select('*'),
    ]);
    if (a.error) throw a.error;
    account = a.data as MoneyAccount;
    type R = Payment & { customers: { name: string } | null; suppliers: { name: string } | null; invoices: { number: string } | null };
    pays = ((p.data ?? []) as R[]).map((x) => ({ ...x, party: x.customers?.name ?? x.suppliers?.name ?? null, inv: x.invoices?.number ?? null }));
    exps = (e.data ?? []) as Expense[]; trs = (t.data ?? []) as AccountTransfer[]; accounts = (all.data ?? []) as MoneyAccount[];
  }
  if (!account) throw new AppError('الحساب غير موجود.');
  const cur = account.currency;
  const rate = demoRate();
  type Ev = Omit<StatementRow, 'balance'>;
  const evs: Ev[] = [];
  for (const p of pays) {
    const amt = convert(Number(p.amount), p.currency, cur, Number(p.exchange_rate) || rate);
    evs.push({ at: p.created_at, doc_type: p.direction === 'in' ? 'payment_in' : 'payment_out', doc_id: p.id, number: p.number, currency: cur,
      description: `${p.direction === 'in' ? 'سند قبض' : 'سند صرف'} — ${PAYMENT_METHOD[p.method].label}${p.party ? ` — ${p.party}` : ''}${p.inv ? ` (${p.inv})` : ''}`,
      debit: p.direction === 'in' ? amt : 0, credit: p.direction === 'out' ? amt : 0 });
  }
  for (const e of exps) evs.push({ at: e.spent_at, doc_type: 'expense', doc_id: e.id, number: null, currency: cur, description: `مصروف — ${e.category}${e.note ? ` — ${e.note}` : ''}`, debit: 0, credit: convert(Number(e.amount), e.currency, cur, Number(e.exchange_rate) || rate) });
  for (const t of trs) {
    const out = t.from_account_id === accountId;
    const other = accounts.find((a) => a.id === (out ? t.to_account_id : t.from_account_id));
    const fromCur = out ? cur : other?.currency ?? cur;
    const amt = out ? Number(t.amount) : convert(Number(t.amount), fromCur, cur, Number(t.exchange_rate));
    evs.push({ at: t.created_at, doc_type: out ? 'transfer_out' : 'transfer_in', doc_id: t.id, number: t.number, currency: cur, description: `${out ? 'تحويل إلى' : 'تحويل من'} ${other?.name ?? '—'}${t.note ? ` — ${t.note}` : ''}`, debit: out ? 0 : amt, credit: out ? amt : 0 });
  }
  evs.sort((a, b) => a.at.localeCompare(b.at));
  let bal = Number(account.opening_balance);
  const rows: StatementRow[] = [];
  for (const e of evs) {
    if (range && e.at < range.from) { bal += e.debit - e.credit; continue; }
    if (range && e.at >= range.to) continue;
    rows.push({ ...e, balance: 0 });
  }
  const opening = roundMoney(bal, cur);
  for (const r of rows) { bal += r.debit - r.credit; r.balance = roundMoney(bal, cur); }
  const zero = { IQD: 0, USD: 0 } as Record<CurrencyCode, number>;
  return { account, opening: { ...zero, [cur]: opening }, rows, closing: { ...zero, [cur]: roundMoney(bal, cur) } };
}

// ================================================================== كشوفات الزبون والمورد

export async function partyStatement(kind: 'customer' | 'supplier', id: string, range: DateRange | null): Promise<Statement> {
  if (!IS_DEMO) {
    const fn = kind === 'customer' ? 'customer_statement' : 'supplier_statement';
    const r = await rpc<Statement>(fn, { [`${kind}_id`]: id, from: range?.from ?? null, to: range?.to ?? null });
    const z = (o?: Partial<Record<CurrencyCode, number>>) => ({ IQD: Number(o?.IQD ?? 0), USD: Number(o?.USD ?? 0) });
    return { opening: z(r.opening), rows: (r.rows ?? []).map((x) => ({ ...x, debit: Number(x.debit), credit: Number(x.credit), balance: Number(x.balance) })), closing: z(r.closing) };
  }
  await demoDelay();
  const isC = kind === 'customer';
  const evs: Omit<StatementRow, 'balance'>[] = [];
  for (const i of ledger.invoices) {
    if (i.status !== 'posted' || (isC ? i.customer_id !== id : i.supplier_id !== id)) continue;
    const main = isC ? 'sale' : 'purchase';
    if (i.kind !== main && i.kind !== `${main}_return`) continue;
    const isRet = i.kind !== main;
    evs.push({ at: i.created_at, doc_type: i.kind, doc_id: i.id, number: i.number, currency: i.currency, description: isRet ? (isC ? 'مرتجع مبيعات' : 'مرتجع مشتريات') : (isC ? 'فاتورة بيع' : 'فاتورة شراء'), debit: isRet ? 0 : i.total, credit: isRet ? i.total : 0 });
  }
  for (const p of ledger.payments) {
    if (p.voided_at || (isC ? p.customer_id !== id : p.supplier_id !== id)) continue;
    const inv = p.invoice_id ? ledger.invoices.find((x) => x.id === p.invoice_id) : undefined;
    const cur = inv?.currency ?? p.currency;
    const amt = roundMoney(convert(p.amount, p.currency, cur, cur === 'USD' && inv ? inv.exchange_rate : p.exchange_rate), cur);
    // للزبون: القبض ينقص دينه والصرف (استرداد) يزيده؛ للمورد العكس
    const reduces = isC ? p.direction === 'in' : p.direction === 'out';
    evs.push({ at: p.created_at, doc_type: p.direction === 'in' ? 'payment_in' : 'payment_out', doc_id: p.id, number: p.number, currency: cur,
      description: `${p.direction === 'in' ? 'سند قبض' : 'سند صرف'} — ${PAYMENT_METHOD[p.method].label}${inv ? ` (${inv.number})` : ''}`, debit: reduces ? 0 : amt, credit: reduces ? amt : 0 });
  }
  evs.sort((a, b) => a.at.localeCompare(b.at));
  const bal: Record<CurrencyCode, number> = { IQD: 0, USD: 0 };
  const rows: StatementRow[] = [];
  for (const e of evs) {
    if (range && e.at < range.from) { bal[e.currency] += e.debit - e.credit; continue; }
    if (range && e.at >= range.to) continue;
    rows.push({ ...e, balance: 0 });
  }
  const opening = { IQD: roundMoney(bal.IQD), USD: roundMoney(bal.USD, 'USD') };
  for (const r of rows) { bal[r.currency] += r.debit - r.credit; r.balance = roundMoney(bal[r.currency], r.currency); }
  return { opening, rows, closing: { IQD: roundMoney(bal.IQD), USD: roundMoney(bal.USD, 'USD') } };
}

// ================================================================== جلسات الصندوق

export interface SessionRow extends CashSession { opened_by_name: string | null; closed_by_name: string | null; expected: number | null; difference: number | null; cash_in: number | null; cash_out: number | null; expenses: number | null }

export async function listCashSessions(range: DateRange | null): Promise<SessionRow[]> {
  if (IS_DEMO) {
    await demoDelay();
    return ledger.cash_sessions.filter((s) => inRange(s.opened_at, range)).map((s) => {
      const t = demoSessionTotals(s);
      const expected = s.status === 'closed' ? s.expected_cash ?? t.expected : t.expected;
      return { ...s, opened_by_name: staffName(s.opened_by), closed_by_name: staffName(s.closed_by), expected, difference: s.counted_cash !== null ? roundMoney(s.counted_cash - expected) : null, cash_in: t.cash_in, cash_out: t.cash_out, expenses: t.expenses };
    }).sort((a, b) => b.opened_at.localeCompare(a.opened_at));
  }
  let q = sb().from('cash_sessions').select('*').order('opened_at', { ascending: false }).limit(300);
  if (range) q = q.gte('opened_at', range.from).lt('opened_at', range.to);
  const { data, error } = await q;
  if (error) throw error;
  const names = await staffNames();
  return (data as CashSession[]).map((s) => ({
    ...s, opened_by_name: names[s.opened_by] ?? null, closed_by_name: s.closed_by ? names[s.closed_by] ?? null : null, expected: s.expected_cash,
    difference: s.counted_cash !== null && s.expected_cash !== null ? roundMoney(Number(s.counted_cash) - Number(s.expected_cash)) : null, cash_in: null, cash_out: null, expenses: null,
  }));
}

// ================================================================== المصروفات

export const EXPENSE_CATEGORIES = ['إيجار', 'رواتب', 'كهرباء ومولدة', 'إنترنت واتصالات', 'نقل وتوصيل', 'صيانة', 'ضيافة', 'تسويق', 'قرطاسية', 'أخرى'];

export interface ExpenseRow extends Expense { account_name: string | null; created_by_name: string | null }

export async function listExpenses(range: DateRange | null, category = ''): Promise<ExpenseRow[]> {
  if (IS_DEMO) {
    await demoDelay();
    return ledger.expenses.filter((e) => inRange(e.spent_at, range) && (!category || e.category === category))
      .map((e) => ({ ...e, account_name: demoDb.money_accounts.find((a) => a.id === e.account_id)?.name ?? null, created_by_name: staffName(e.created_by) }))
      .sort((a, b) => b.spent_at.localeCompare(a.spent_at));
  }
  let q = sb().from('expenses').select('*, money_accounts(name)').order('spent_at', { ascending: false }).limit(2000);
  if (range) q = q.gte('spent_at', range.from).lt('spent_at', range.to);
  if (category) q = q.eq('category', category);
  const { data, error } = await q;
  if (error) throw error;
  const names = await staffNames();
  type R = Expense & { money_accounts: { name: string } | null };
  return ((data ?? []) as R[]).map(({ money_accounts, ...e }) => ({ ...e, amount: Number(e.amount), account_name: money_accounts?.name ?? null, created_by_name: e.created_by ? names[e.created_by] ?? null : null }));
}

export interface ExpensePayload { category: string; amount: number; currency: CurrencyCode; exchange_rate?: number; account_id: string | null; method: PaymentMethod; note: string | null; spent_at?: string }

export async function recordExpense(p: ExpensePayload): Promise<Expense> {
  if (!IS_DEMO) return rpc<Expense>('record_expense', { p });
  await demoDelay();
  if (!p.category.trim()) throw new AppError('اختر نوع المصروف.');
  if (!(p.amount > 0)) throw new AppError('اكتب مبلغاً أكبر من صفر.');
  const acc = demoDb.money_accounts.find((a) => a.id === p.account_id);
  if (acc && demoAccountBalance(acc).balance < convert(p.amount, p.currency, acc.currency, p.exchange_rate ?? demoRate())) throw new AppError(`الرصيد في «${acc.name}» لا يكفي.`);
  const session = ledger.cash_sessions.find((s) => s.status === 'open' && s.opened_by === 'demo-owner');
  const e: Expense = { id: demoId(), category: p.category.trim(), amount: roundMoney(p.amount, p.currency), currency: p.currency, exchange_rate: p.currency === 'USD' ? p.exchange_rate ?? demoRate() : 1, account_id: p.account_id, method: p.method, note: p.note, spent_at: p.spent_at ?? nowIso(), cash_session_id: p.method === 'cash' ? session?.id ?? null : null, created_by: 'demo-owner', created_at: nowIso() };
  ledger.expenses.push(e);
  demoAudit('insert', 'expenses', e.id, { category: e.category, amount: e.amount });
  demoChanged();
  return e;
}

// ================================================================== التقارير

export interface InvoiceLite { id: string; kind: Invoice['kind']; total: number; cost_total: number; currency: CurrencyCode; exchange_rate: number; customer_id: string | null; created_by: string | null; created_at: string; channel: Invoice['channel'] }

/** فواتير البيع والإرجاع في فترة (خفيفة) لتجميع تقارير الزبائن والموظفين */
export async function invoicesIn(range: DateRange): Promise<InvoiceLite[]> {
  if (IS_DEMO) {
    await demoDelay();
    return ledger.invoices.filter((i) => i.status === 'posted' && (i.kind === 'sale' || i.kind === 'sale_return') && inRange(i.created_at, range));
  }
  const { data, error } = await sb().from('invoices').select('id,kind,total,cost_total,currency,exchange_rate,customer_id,created_by,created_at,channel')
    .eq('status', 'posted').in('kind', ['sale', 'sale_return']).gte('created_at', range.from).lt('created_at', range.to).limit(50000);
  if (error) throw error;
  return (data ?? []) as InvoiceLite[];
}

export const iqdOf = (i: Pick<InvoiceLite, 'total' | 'currency' | 'exchange_rate'>) => Number(i.total) * (i.currency === 'USD' ? Number(i.exchange_rate) : 1);

export async function customerNames(ids: string[]): Promise<Record<string, string>> {
  if (!ids.length) return {};
  if (IS_DEMO) return Object.fromEntries(demoDb.customers.filter((c) => ids.includes(c.id)).map((c) => [c.id, c.name]));
  const { data } = await sb().from('customers').select('id,name').in('id', ids.slice(0, 1000));
  return Object.fromEntries((data ?? []).map((c) => [c.id as string, c.name as string]));
}

export async function inventoryValuation(): Promise<(InventoryValuationRow & { warehouse_name: string })[]> {
  if (IS_DEMO) {
    await demoDelay();
    return demoDb.warehouses.map((w) => {
      const lv = demoDb.stock_levels.filter((s) => s.warehouse_id === w.id && s.qty > 0);
      const price = (vid: string) => demoDb.product_variants.find((v) => v.id === vid)?.price ?? 0;
      return { warehouse_id: w.id, warehouse_name: w.name, items: lv.length, units: lv.reduce((s, l) => s + l.qty, 0), cost_value: lv.reduce((s, l) => s + l.qty * variantCost(l.variant_id), 0), retail_value: lv.reduce((s, l) => s + l.qty * price(l.variant_id), 0) };
    });
  }
  const [rows, whs] = await Promise.all([rpc<InventoryValuationRow[]>('inventory_valuation'), sb().from('warehouses').select('id,name')]);
  const names = new Map((whs.data ?? []).map((w) => [w.id as string, w.name as string]));
  return (rows ?? []).map((r) => ({ ...r, warehouse_name: names.get(r.warehouse_id) ?? '—' }));
}
