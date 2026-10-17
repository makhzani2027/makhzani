/** قوائم صغيرة مشتركة (المخازن، الأقسام، أسماء الموظفين، الزبائن) مع ذاكرة مؤقتة قصيرة */
import type { Category, Customer, CustomerBalance, Warehouse } from '@raqeem/shared';
import { matchScore, normalizeIraqiPhone } from '@raqeem/shared';
import { IS_DEMO } from '../../../lib/env';
import { demoDb, demoDelay, demoId } from '../../../lib/demo-db';
import { AppError, sb } from '../../../lib/supabase';
import { demoAudit, demoCustomerBalance, ledger } from './ledger';

let staffCache: Promise<Record<string, string>> | null = null;

/** اسم كل موظف (للكاشير في الإيصال، والسجل) */
export function staffNames(): Promise<Record<string, string>> {
  if (IS_DEMO) return Promise.resolve(Object.fromEntries(ledger.staff.map((s) => [s.id, s.full_name ?? 'موظف'])));
  if (!staffCache) {
    staffCache = (async () => {
      const { data } = await sb().from('profiles').select('id,full_name').eq('kind', 'staff');
      return Object.fromEntries((data ?? []).map((p) => [p.id as string, (p.full_name as string | null) ?? 'موظف']));
    })().catch(() => ({}));
  }
  return staffCache;
}
export const resetStaffNames = () => { staffCache = null; };

export async function listWarehouses(): Promise<Warehouse[]> {
  if (IS_DEMO) { await demoDelay(40); return demoDb.warehouses.filter((w) => w.is_active); }
  const { data, error } = await sb().from('warehouses').select('*').eq('is_active', true).order('is_default', { ascending: false }).order('name');
  if (error) throw error;
  return data as Warehouse[];
}

export async function listCategories(): Promise<Category[]> {
  if (IS_DEMO) { await demoDelay(40); return [...demoDb.categories].sort((a, b) => a.sort - b.sort); }
  const { data, error } = await sb().from('categories').select('*').order('sort');
  if (error) throw error;
  return data as Category[];
}

export interface CustomerHit extends Customer { balance: number }

/** بحث الزبائن بالاسم أو الهاتف (أي صيغة عراقية) */
export async function searchCustomers(q: string, limit = 12): Promise<CustomerHit[]> {
  const term = q.trim();
  const phone = normalizeIraqiPhone(term);
  if (IS_DEMO) {
    await demoDelay(80);
    return demoDb.customers
      .filter((c) => !c.is_cash_customer)
      .filter((c) => !term || (phone ? c.phone === phone || c.phone2 === phone : matchScore(term, `${c.name} ${c.phone ?? ''}`) > 0))
      .slice(0, limit)
      .map((c) => ({ ...c, balance: demoCustomerBalance(c.id).balance }));
  }
  let query = sb().from('customers').select('*').eq('is_cash_customer', false).limit(limit);
  if (phone) query = query.or(`phone.eq.${phone},phone2.eq.${phone}`);
  else if (term) query = query.ilike('name', `%${term.replace(/[%_,()]/g, '')}%`);
  else query = query.order('updated_at', { ascending: false });
  const { data, error } = await query;
  if (error) throw error;
  const rows = data as Customer[];
  const bal = await balancesFor(rows.map((r) => r.id));
  return rows.map((c) => ({ ...c, balance: bal[c.id]?.balance ?? 0 }));
}

export async function balancesFor(ids: string[]): Promise<Record<string, CustomerBalance>> {
  if (!ids.length) return {};
  if (IS_DEMO) return Object.fromEntries(ids.map((id) => [id, demoCustomerBalance(id)]));
  const { data } = await sb().from('customer_balances').select('*').in('customer_id', ids);
  return Object.fromEntries(((data ?? []) as CustomerBalance[]).map((b) => [b.customer_id, b]));
}

export async function customerBalance(id: string): Promise<CustomerBalance> {
  const b = await balancesFor([id]);
  return b[id] ?? { customer_id: id, sales_total: 0, returns_total: 0, paid_total: 0, balance: 0, last_activity_at: null };
}

export async function cashCustomer(): Promise<Customer | null> {
  if (IS_DEMO) return demoDb.customers.find((c) => c.is_cash_customer) ?? null;
  const { data } = await sb().from('customers').select('*').eq('is_cash_customer', true).maybeSingle();
  return (data as Customer | null) ?? null;
}

export async function getCustomer(id: string): Promise<Customer | null> {
  if (IS_DEMO) { await demoDelay(60); return demoDb.customers.find((c) => c.id === id) ?? null; }
  const { data, error } = await sb().from('customers').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data as Customer | null;
}

export type CustomerInput = Pick<Customer, 'name' | 'phone' | 'phone2' | 'governorate' | 'city' | 'address' | 'notes' | 'tags' | 'credit_limit'>;

/** إضافة أو تعديل زبون (الهاتف يُوحَّد ويُتحقق منه قبل الحفظ) */
export async function saveCustomer(input: Partial<CustomerInput> & { name: string }, id?: string): Promise<Customer> {
  const name = input.name.trim();
  if (!name) throw new AppError('اكتب اسم الزبون.');
  const clean = (p: string | null | undefined, label: string) => {
    if (!p || !p.trim()) return null;
    const n = normalizeIraqiPhone(p);
    if (!n) throw new AppError(`${label} غير صحيح. اكتب رقماً عراقياً مثل 0770 123 4567.`);
    return n;
  };
  const row = { ...input, name, phone: clean(input.phone, 'رقم الهاتف'), phone2: input.phone2 !== undefined ? clean(input.phone2, 'الهاتف الثاني') : undefined };
  if (IS_DEMO) {
    await demoDelay();
    if (row.phone && demoDb.customers.some((c) => c.phone === row.phone && c.id !== id)) throw new AppError('يوجد زبون آخر بهذا الرقم.');
    const now = new Date().toISOString();
    if (id) {
      const c = demoDb.customers.find((x) => x.id === id);
      if (!c) throw new AppError('الزبون غير موجود.');
      const old = { ...c };
      Object.assign(c, Object.fromEntries(Object.entries(row).filter(([, v]) => v !== undefined)), { updated_at: now });
      demoAudit('update', 'customers', id, { old: { name: old.name, phone: old.phone, credit_limit: old.credit_limit }, new: { name: c.name, phone: c.phone, credit_limit: c.credit_limit }, label: c.name });
      return c;
    }
    const c: Customer = {
      id: demoId(), profile_id: null, name, phone: row.phone ?? null, phone2: row.phone2 ?? null, governorate: input.governorate ?? null, city: input.city ?? null,
      address: input.address ?? null, notes: input.notes ?? null, tags: input.tags ?? [], credit_limit: input.credit_limit ?? null, is_cash_customer: false,
      created_by: 'demo-owner', created_at: now, updated_at: now,
    };
    demoDb.customers.push(c);
    demoAudit('insert', 'customers', c.id, { new: { name: c.name, phone: c.phone }, label: c.name });
    return c;
  }
  const payload = Object.fromEntries(Object.entries(row).filter(([, v]) => v !== undefined));
  const q = id ? sb().from('customers').update(payload).eq('id', id).select('*').single() : sb().from('customers').insert(payload).select('*').single();
  const { data, error } = await q;
  if (error) throw error;
  return data as Customer;
}
