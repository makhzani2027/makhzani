/** مدراء منصة رقيم — يضيفهم ويزيلهم مدير المنصة فقط. كل مدير يرى «متاجر المنصة» ويوافق على الطلبات ويعدّل موقع رقيم. */
import { useState } from 'react';
import { Alert, Badge, Button, Card, ErrorState, Field, Input, Loading, askConfirm } from '../../ui';
import { useAction, useLoad } from '../../lib/hooks';
import { AppError, errorMessage, sb } from '../../lib/supabase';
import { IS_DEMO } from '../../lib/env';

interface Admin { id: string; email: string | null; full_name: string | null; status: string; is_me: boolean }

async function call(body: Record<string, unknown>): Promise<{ admins: Admin[]; temp_password?: string | null }> {
  if (IS_DEMO) return { admins: [{ id: '1', email: 'owner@raqeem.iq', full_name: 'صاحب رقيم', status: 'active', is_me: true }] };
  const { data, error } = await sb().functions.invoke('platform', { body });
  if (error) {
    let msg = errorMessage(error);
    try { const j = await (error as { context?: Response }).context?.json(); if (j?.error) msg = j.error; } catch { /* نص الخطأ الافتراضي */ }
    throw new AppError(msg);
  }
  return data as { admins: Admin[]; temp_password?: string | null };
}

export default function PlatformAdmins() {
  const list = useLoad(async () => (await call({ action: 'list' })).admins, []);
  const [admins, setAdmins] = useState<Admin[] | null>(null);
  const rows = admins ?? list.data;
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [temp, setTemp] = useState<{ email: string; password: string } | null>(null);

  const add = useAction(async () => {
    const e = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) throw new AppError('اكتب بريداً صحيحاً.');
    if (password && password.length < 8) throw new AppError('كلمة السر ٨ أحرف على الأقل.');
    const r = await call({ action: 'add', email: e, full_name: name.trim() || undefined, password: password || undefined });
    setAdmins(r.admins);
    setTemp(r.temp_password ? { email: e, password: r.temp_password } : null);
    setEmail(''); setName(''); setPassword('');
  }, { success: 'أُضيف مدير المنصة' });
  const remove = useAction(async (a: Admin) => { setAdmins((await call({ action: 'remove', user_id: a.id })).admins); }, { success: 'أُزيل من مدراء المنصة' });

  if (list.error) return <ErrorState message={list.error} onRetry={list.reload} />;
  if (!rows) return <Loading />;
  return (
    <div className="stack">
      <Card title="مدراء منصة رقيم" icon="shield">
        <Alert tone="info">هؤلاء وحدهم يرون «متاجر المنصة»: طلبات المشتركين الجدد، الموافقة والرفض والإيقاف، وبيانات موقع رقيم. أصحاب المتاجر لا يرون شيئاً من هذا.</Alert>
        <div className="stack" style={{ marginTop: 12 }}>
          {rows.map((a) => (
            <div key={a.id} className="row" style={{ gap: 10, alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--line)' }}>
              <div className="grow">
                <b>{a.full_name || a.email}</b> {a.is_me ? <Badge tone="neutral">أنت</Badge> : null} {a.status !== 'active' ? <Badge tone="danger">موقوف</Badge> : null}
                <div className="small dim ltr" style={{ textAlign: 'start' }}>{a.email}</div>
              </div>
              {!a.is_me ? <Button variant="ghost" icon="trash" disabled={remove.busy} onClick={async () => {
                if (await askConfirm({ title: `إزالة ${a.full_name || a.email}؟`, body: 'لن يرى «متاجر المنصة» بعد الآن. حسابه يبقى كما هو.', confirm: 'إزالة', danger: true })) void remove.run(a);
              }}>إزالة</Button> : null}
            </div>
          ))}
        </div>
      </Card>
      <Card title="إضافة مدير" icon="plus">
        <div className="form-grid">
          <Field label="البريد الإلكتروني" required><Input dir="ltr" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" /></Field>
          <Field label="الاسم"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="كلمة السر" hint="لحساب جديد فقط. اتركها فارغة لتوليد كلمة سر مؤقتة."><Input dir="ltr" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" /></Field>
        </div>
        <div className="form-actions" style={{ marginTop: 14 }}><Button variant="primary" icon="plus" loading={add.busy} onClick={() => void add.run()}>إضافة مدير منصة</Button></div>
        {temp ? <Alert tone="warning">كلمة السر المؤقتة لـ <b className="ltr">{temp.email}</b>: <b className="ltr">{temp.password}</b> — أرسلها له ليدخل من صفحة الدخول، ولن تظهر مرة أخرى.</Alert> : null}
      </Card>
    </div>
  );
}
