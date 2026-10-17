/**
 * بيانات النظام: الموظفون (دالة الخادم staff)، الأدوار وصلاحياتها (staff_roles)، الفروع (branches)، سجل العمليات (audit_log).
 * staff: functions.invoke('staff', {body:{action:'create'|'set_role'|'disable'|'enable'|'reset_password', email?, full_name?, role_id?, phone?, user_id?, password?}})
 *   ← temp_password عند توليد كلمة سر.
 */
import type { AuditEntry, Branch, Profile, StaffRole } from '@raqeem/shared';
import { IS_DEMO } from '../../lib/env';
import { demoChanged, demoDb, demoDelay, demoId } from '../../lib/demo-db';
import { AppError, errorMessage, sb } from '../../lib/supabase';
import { demoAudit, ledger, staffName } from '../sales/data/ledger';
import { resetStaffNames } from '../sales/data/lookups';

const nowIso = () => new Date().toISOString();

export async function listStaff(): Promise<Profile[]> {
  if (IS_DEMO) { await demoDelay(); return [...ledger.staff]; }
  const { data, error } = await sb().from('profiles').select('*').eq('kind', 'staff').order('created_at');
  if (error) throw error;
  return data as Profile[];
}

export async function listRoles(): Promise<StaffRole[]> {
  if (IS_DEMO) { await demoDelay(60); return [...demoDb.staff_roles]; }
  const { data, error } = await sb().from('staff_roles').select('*').order('created_at');
  if (error) throw error;
  return data as StaffRole[];
}

export async function saveRole(input: Pick<StaffRole, 'name' | 'description' | 'permissions'>, id?: string): Promise<StaffRole> {
  if (!input.name.trim()) throw new AppError('اكتب اسم الدور.');
  if (IS_DEMO) {
    await demoDelay();
    let r = id ? demoDb.staff_roles.find((x) => x.id === id) : undefined;
    if (r) Object.assign(r, input);
    else { r = { id: demoId(), is_system: false, created_at: nowIso(), ...input }; demoDb.staff_roles.push(r); }
    demoAudit(id ? 'update' : 'insert', 'staff_roles', r.id, { name: r.name, permissions: r.permissions.length });
    demoChanged();
    return r;
  }
  const q = id ? sb().from('staff_roles').update(input).eq('id', id) : sb().from('staff_roles').insert(input);
  const { data, error } = await q.select().single();
  if (error) throw error;
  return data as StaffRole;
}

export async function deleteRole(id: string): Promise<void> {
  if (IS_DEMO) {
    if (ledger.staff.some((s) => s.role_id === id)) throw new AppError('لا يمكن حذف دور مسند لموظفين. انقلهم لدور آخر أولاً.');
    demoDb.staff_roles = demoDb.staff_roles.filter((r) => r.id !== id);
    demoChanged();
    return;
  }
  const { error } = await sb().from('staff_roles').delete().eq('id', id);
  if (error) throw error;
}

export interface StaffAction { action: 'create' | 'set_role' | 'disable' | 'enable' | 'reset_password'; email?: string; full_name?: string; role_id?: string; phone?: string; user_id?: string; password?: string }

export async function staffFn(b: StaffAction): Promise<{ temp_password?: string; user_id?: string }> {
  if (!IS_DEMO) {
    const { data, error } = await sb().functions.invoke('staff', { body: b });
    if (error) {
      let msg = errorMessage(error);
      try { const j = await (error as { context?: Response }).context?.json(); if (j?.error) msg = j.error; } catch { /* نص الخطأ الافتراضي */ }
      throw new AppError(msg);
    }
    resetStaffNames();
    return data as { temp_password?: string; user_id?: string };
  }
  await demoDelay(300);
  const temp = () => `Rq-${Math.random().toString(36).slice(2, 8)}`;
  if (b.action === 'create') {
    if (!b.email?.includes('@')) throw new AppError('اكتب بريداً صحيحاً.');
    if (!b.full_name?.trim()) throw new AppError('اكتب اسم الموظف.');
    if (!b.role_id) throw new AppError('اختر الدور.');
    if (ledger.staff.some((s) => s.email === b.email)) throw new AppError('هذا البريد مسجّل لموظف آخر.');
    const id = demoId();
    ledger.staff.push({ id, kind: 'staff', full_name: b.full_name.trim(), phone: b.phone ?? null, email: b.email.trim(), avatar_key: null, role_id: b.role_id, is_owner: false, status: 'active', onboarded: true, governorate: null, prefs: {}, last_seen_at: null, created_at: nowIso(), updated_at: nowIso() });
    demoAudit('staff.create', 'profiles', id, { email: b.email });
    demoChanged();
    return { user_id: id, temp_password: b.password ? undefined : temp() };
  }
  const s = ledger.staff.find((x) => x.id === b.user_id);
  if (!s) throw new AppError('الموظف غير موجود.');
  if (s.is_owner) throw new AppError('لا يمكن تعديل حساب صاحب المتجر من هنا.');
  if (b.action === 'set_role') s.role_id = b.role_id ?? null;
  if (b.action === 'disable') s.status = 'blocked';
  if (b.action === 'enable') s.status = 'active';
  demoAudit(`staff.${b.action}`, 'profiles', s.id, { role_id: b.role_id ?? null });
  demoChanged();
  return b.action === 'reset_password' ? { temp_password: b.password ? undefined : temp() } : {};
}

export interface AuditRow extends AuditEntry { actor_name: string | null }
export interface AuditFilter { entity: string; q: string; page: number; pageSize: number }

export async function listAudit(f: AuditFilter): Promise<{ rows: AuditRow[]; total: number; entities: string[] }> {
  if (IS_DEMO) {
    await demoDelay();
    const all = ledger.audit_log.filter((a) => (!f.entity || a.entity === f.entity) && (!f.q || `${a.action} ${a.entity} ${a.entity_id ?? ''} ${JSON.stringify(a.data)}`.includes(f.q)));
    return { rows: all.slice((f.page - 1) * f.pageSize, f.page * f.pageSize).map((a) => ({ ...a, actor_name: staffName(a.actor_id) })), total: all.length, entities: [...new Set(ledger.audit_log.map((a) => a.entity))].sort() };
  }
  let q = sb().from('audit_log').select('*', { count: 'exact' }).order('created_at', { ascending: false });
  if (f.entity) q = q.eq('entity', f.entity);
  if (f.q.trim()) q = q.or(`action.ilike.%${f.q.trim().replace(/[%_,()]/g, '')}%,entity_id.ilike.%${f.q.trim().replace(/[%_,()]/g, '')}%`);
  const { data, error, count } = await q.range((f.page - 1) * f.pageSize, f.page * f.pageSize - 1);
  if (error) throw error;
  const ids = [...new Set((data ?? []).map((a) => a.actor_id).filter(Boolean))] as string[];
  const ps = ids.length ? await sb().from('profiles').select('id,full_name').in('id', ids) : { data: [] };
  const names = new Map((ps.data ?? []).map((p) => [p.id as string, p.full_name as string]));
  const ENT = ['invoices', 'payments', 'orders', 'products', 'product_variants', 'customers', 'expenses', 'money_accounts', 'app_settings', 'staff_roles', 'profiles', 'coupons', 'banners', 'stock_movements', 'quotations'];
  return { rows: ((data ?? []) as AuditEntry[]).map((a) => ({ ...a, actor_name: a.actor_id ? names.get(a.actor_id) ?? null : null })), total: count ?? 0, entities: ENT };
}

// ------------------------------------------------------------------ الفروع

export async function listBranches(): Promise<Branch[]> {
  if (IS_DEMO) { await demoDelay(60); return [...demoDb.branches]; }
  const { data, error } = await sb().from('branches').select('*').order('created_at');
  if (error) throw error;
  return data as Branch[];
}

export async function saveBranch(input: Pick<Branch, 'name' | 'address' | 'phone' | 'is_default' | 'is_active'>, id?: string): Promise<Branch> {
  if (!input.name.trim()) throw new AppError('اكتب اسم الفرع.');
  if (IS_DEMO) {
    await demoDelay();
    if (input.is_default) demoDb.branches.forEach((b) => { b.is_default = false; });
    let b = id ? demoDb.branches.find((x) => x.id === id) : undefined;
    if (b) Object.assign(b, input);
    else { b = { id: demoId(), created_at: nowIso(), ...input }; demoDb.branches.push(b); }
    demoChanged();
    return b;
  }
  const q = id ? sb().from('branches').update(input).eq('id', id) : sb().from('branches').insert(input);
  const { data, error } = await q.select().single();
  if (error) throw error;
  return data as Branch;
}
