/** المستخدمون والأدوار: إضافة موظف (دالة الخادم staff)، تغيير الدور، إيقاف/تفعيل، كلمة سر مؤقتة، ومصفوفة الصلاحيات لكل دور */
import { useState } from 'react';
import { PERMISSION_GROUPS, nouns, type Permission, type Profile, type StaffRole } from '@raqeem/shared';
import { Alert, Avatar, Badge, Button, Card, Checkbox, DataTable, Field, Input, Menu, Modal, PageHeader, Select, Tabs, Textarea, askConfirm, type Column } from '../../ui';
import { useAuth } from '../../lib/auth';
import { useAction, useLoad } from '../../lib/hooks';
import { useFmt } from '../../lib/settings';
import { deleteRole, listRoles, listStaff, saveRole, staffFn } from './api';
import '../sales/sales.css';

export default function Staff() {
  const fmt = useFmt();
  const { profile } = useAuth();
  const [tab, setTab] = useState<'staff' | 'roles'>('staff');
  const staff = useLoad(listStaff, []);
  const roles = useLoad(listRoles, []);
  const [add, setAdd] = useState(false);
  const [temp, setTemp] = useState<{ email: string; password: string } | null>(null);
  const [role, setRole] = useState<StaffRole | 'new' | null>(null);
  const roleName = (id: string | null) => roles.data?.find((r) => r.id === id)?.name ?? '—';
  const act = useAction(async (p: Profile, action: 'disable' | 'enable' | 'reset_password' | 'set_role', role_id?: string) => {
    if (action === 'disable' && !(await askConfirm({ title: `إيقاف ${p.full_name}؟`, body: 'لن يستطيع الدخول للوحة حتى تعيد تفعيله.', danger: true, confirm: 'إيقاف' }))) return null;
    const r = await staffFn({ action, user_id: p.id, role_id });
    if (r.temp_password) setTemp({ email: p.email ?? '', password: r.temp_password });
    await staff.reload();
    return r;
  }, { success: 'تمّ' });
  const cols: Column<Profile>[] = [
    { key: 'n', header: 'الموظف', primary: true, cell: (p) => <div className="sx-row" style={{ flexWrap: 'nowrap' }}><Avatar name={p.full_name} imageKey={p.avatar_key} size={32} /><div><b>{p.full_name}</b>{p.id === profile?.id ? <span className="faint"> (أنت)</span> : null}<div className="small faint ltr" style={{ textAlign: 'start' }}>{p.email}</div></div></div> },
    { key: 'r', header: 'الدور', cell: (p) => (p.is_owner ? <Badge tone="accent">صاحب المتجر</Badge> : <Badge plain>{roleName(p.role_id)}</Badge>) },
    { key: 's', header: 'الحالة', cell: (p) => (p.status === 'active' ? <Badge tone="success">فعّال</Badge> : <Badge tone="danger">موقوف</Badge>) },
    { key: 'l', header: 'آخر ظهور', hideOnMobile: true, cell: (p) => <span className="dim">{p.last_seen_at ? fmt.ago(p.last_seen_at) : '—'}</span> },
    { key: 'a', header: '', shrink: true, cell: (p) => (p.is_owner ? null : (
      <Menu trigger={(open) => <Button size="sm" icon="more" onClick={open} aria-label="إجراءات" />} items={[
        ...(roles.data ?? []).filter((r) => r.id !== p.role_id).map((r) => ({ label: `نقل إلى «${r.name}»`, icon: 'idCard' as const, onClick: () => void act.run(p, 'set_role', r.id) })),
        { divider: true, label: '' },
        { label: 'كلمة سر مؤقتة جديدة', icon: 'key', onClick: () => void act.run(p, 'reset_password') },
        p.status === 'active' ? { label: 'إيقاف الحساب', icon: 'lock', danger: true, onClick: () => void act.run(p, 'disable') } : { label: 'تفعيل الحساب', icon: 'unlock', onClick: () => void act.run(p, 'enable') },
      ]} />
    )) },
  ];
  return (
    <>
      <PageHeader title="المستخدمون" description="من يدخل اللوحة، وماذا يستطيع أن يفعل."
        actions={tab === 'staff' ? <Button variant="primary" icon="userPlus" onClick={() => setAdd(true)}>موظف جديد</Button> : <Button variant="primary" icon="plus" onClick={() => setRole('new')}>دور جديد</Button>} />
      <Tabs value={tab} onChange={setTab} items={[{ value: 'staff', label: 'الموظفون', count: staff.data?.length }, { value: 'roles', label: 'الأدوار والصلاحيات', count: roles.data?.length }]} />
      {temp ? <Alert tone="success">كلمة السر المؤقتة لـ <span className="ltr">{temp.email}</span>: <b className="ltr" style={{ fontSize: 16 }}>{temp.password}</b> — أرسلها للموظف، وسيُطلب منه تغييرها. <button type="button" className="sx-link" onClick={() => { void navigator.clipboard?.writeText(temp.password); }}>نسخ</button></Alert> : null}
      {tab === 'staff' ? (
        <DataTable rows={staff.data} columns={cols} rowKey={(p) => p.id} loading={staff.loading} error={staff.error} onRetry={staff.reload} empty={{ icon: 'users', title: 'لا موظفين بعد' }} />
      ) : (
        <div className="grid-auto">
          {(roles.data ?? []).map((r) => (
            <Card key={r.id} title={r.name} icon="shield" actions={<Button size="sm" icon="edit" onClick={() => setRole(r)}>تعديل</Button>}>
              <p className="sx-muted" style={{ margin: '0 0 8px' }}>{r.description ?? ''}</p>
              <div className="sx-between"><span>{fmt.count(r.permissions.length, nouns.permission)}</span><span className="dim">{fmt.count((staff.data ?? []).filter((s) => s.role_id === r.id).length, nouns.staff)}</span></div>
            </Card>
          ))}
        </div>
      )}
      {add ? <AddStaff roles={roles.data ?? []} onClose={() => setAdd(false)} onDone={(email, pw) => { setAdd(false); if (pw) setTemp({ email, password: pw }); void staff.reload(); }} /> : null}
      {role ? <RoleModal role={role === 'new' ? null : role} used={role !== 'new' && (staff.data ?? []).some((s) => s.role_id === role.id)} onClose={() => setRole(null)} onDone={() => { setRole(null); void roles.reload(); }} /> : null}
    </>
  );
}

function AddStaff({ roles, onClose, onDone }: { roles: StaffRole[]; onClose: () => void; onDone: (email: string, temp?: string) => void }) {
  const [f, setF] = useState({ full_name: '', email: '', phone: '', role_id: roles[1]?.id ?? roles[0]?.id ?? '', password: '' });
  const save = useAction(() => staffFn({ action: 'create', full_name: f.full_name, email: f.email.trim(), phone: f.phone || undefined, role_id: f.role_id, password: f.password || undefined }), { success: 'أُضيف الموظف' });
  return (
    <Modal open onClose={onClose} title="موظف جديد" subtitle="يدخل اللوحة ببريده وكلمة سر مؤقتة" width={520}
      footer={<><Button onClick={onClose}>إلغاء</Button><Button variant="primary" loading={save.busy} onClick={async () => { const r = await save.run(); if (r) onDone(f.email, r.temp_password); }}>إضافة الموظف</Button></>}>
      <div className="form-grid">
        <Field label="الاسم" required><Input autoFocus value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></Field>
        <Field label="البريد" required><Input dir="ltr" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Field label="الهاتف"><Input dir="ltr" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
        <Field label="الدور" required><Select value={f.role_id} onChange={(e) => setF({ ...f, role_id: e.target.value })} options={roles.map((r) => ({ value: r.id, label: r.name }))} /></Field>
        <Field label="كلمة سر (اختياري)" hint="فارغ = نولّد كلمة مؤقتة"><Input dir="ltr" type="text" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}

function RoleModal({ role, used, onClose, onDone }: { role: StaffRole | null; used: boolean; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState(role?.name ?? '');
  const [desc, setDesc] = useState(role?.description ?? '');
  const [perms, setPerms] = useState<Set<string>>(new Set(role?.permissions ?? ['dashboard.view']));
  const toggle = (p: Permission) => setPerms((s) => { const n = new Set(s); if (n.has(p)) n.delete(p); else n.add(p); return n; });
  const save = useAction(() => saveRole({ name, description: desc || null, permissions: [...perms] }, role?.id), { success: 'حُفظ الدور' });
  const del = useAction(() => deleteRole(role!.id), { success: 'حُذف الدور' });
  return (
    <Modal open onClose={onClose} title={role ? `الدور «${role.name}»` : 'دور جديد'} width={860}
      footer={<>{role && !role.is_system ? <Button variant="danger" icon="trash" disabled={used} onClick={async () => { if (await askConfirm({ title: 'حذف الدور؟', danger: true, confirm: 'حذف' })) { await del.run(); onDone(); } }}>حذف</Button> : null}<span className="grow" /><Button onClick={onClose}>إلغاء</Button><Button variant="primary" loading={save.busy} onClick={async () => { if (await save.run()) onDone(); }}>حفظ الدور</Button></>}>
      <div className="stack">
        <div className="form-grid">
          <Field label="الاسم" required><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="الوصف"><Textarea rows={1} value={desc} onChange={(e) => setDesc(e.target.value)} /></Field>
        </div>
        <div className="perm-grid">
          {PERMISSION_GROUPS.map((g) => {
            const all = g.items.every((i) => perms.has(i.key));
            return (
              <div key={g.key} className="grp">
                <h4>{g.label}<button type="button" className="sx-link" onClick={() => setPerms((s) => { const n = new Set(s); g.items.forEach((i) => (all ? n.delete(i.key) : n.add(i.key))); return n; })}>{all ? 'إلغاء الكل' : 'الكل'}</button></h4>
                <div className="stack-sm">{g.items.map((i) => <Checkbox key={i.key} label={i.label} checked={perms.has(i.key)} onChange={() => toggle(i.key as Permission)} />)}</div>
              </div>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}
