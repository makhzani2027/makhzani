// staff — للمالك أو staff.manage: create (بريد + كلمة سر مؤقتة)، disable، enable، reset_password، set_role.
// مفتاح service role داخل الخادم فقط. لا يمكن تعطيل المالك أو تعديله من هنا.
import { handler, HttpError, json, readJson } from '../_shared/cors.ts';
import { admin, getCaller, requirePerm } from '../_shared/supabase.ts';

function tempPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

interface Body { action: string; email?: string; password?: string; full_name?: string; phone?: string; role_id?: string; user_id?: string }

Deno.serve(handler(async (req) => {
  if (req.method !== 'POST') throw new HttpError(405, 'method not allowed');
  const caller = await getCaller(req);
  await requirePerm(caller, 'staff.manage');
  const b = await readJson<Body>(req);
  const db = admin();

  const target = async () => {
    if (!b.user_id) throw new HttpError(400, 'اختر الموظف.');
    if (b.user_id === caller.id) throw new HttpError(400, 'لا يمكنك تنفيذ هذا على حسابك.');
    const { data: p } = await db.from('profiles').select('id, kind, is_owner').eq('id', b.user_id).maybeSingle();
    if (!p || p.kind !== 'staff') throw new HttpError(404, 'الموظف غير موجود.');
    if (p.is_owner) throw new HttpError(403, 'لا يمكن تعديل حساب المالك.');
    return p;
  };
  const checkRole = async () => {
    if (!b.role_id) throw new HttpError(400, 'اختر الدور.');
    const { data: r } = await db.from('staff_roles').select('id').eq('id', b.role_id).maybeSingle();
    if (!r) throw new HttpError(400, 'الدور غير موجود.');
  };

  switch (b.action) {
    case 'create': {
      const email = b.email?.trim().toLowerCase();
      if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(400, 'أدخل بريداً صحيحاً.');
      if (!b.full_name?.trim()) throw new HttpError(400, 'أدخل اسم الموظف.');
      await checkRole();
      const password = b.password && b.password.length >= 8 ? b.password : tempPassword();
      const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: b.full_name.trim() } });
      if (error || !data.user) {
        throw new HttpError(400, /already|exists|registered/i.test(error?.message ?? '') ? 'هذا البريد مسجّل مسبقاً.' : 'تعذّر إنشاء الحساب.');
      }
      // ملف المستخدم أُنشئ بالمشغّل كزبون — نرقّيه موظفاً
      const { error: e2 } = await db.from('profiles').update({ kind: 'staff', role_id: b.role_id, status: 'active', onboarded: true,
        full_name: b.full_name.trim(), phone: b.phone?.trim() || null }).eq('id', data.user.id);
      if (e2) {
        await db.auth.admin.deleteUser(data.user.id);
        throw new HttpError(400, e2.message.includes('phone') ? 'رقم الهاتف مستعمل.' : 'تعذّر إنشاء الموظف.');
      }
      return json({ user_id: data.user.id, email, temp_password: b.password ? null : password });
    }
    case 'set_role': {
      await target();
      await checkRole();
      await db.from('profiles').update({ role_id: b.role_id }).eq('id', b.user_id!);
      return json({ ok: true });
    }
    case 'disable': {
      await target();
      await db.from('profiles').update({ status: 'blocked' }).eq('id', b.user_id!);
      await db.auth.admin.updateUserById(b.user_id!, { ban_duration: '876000h' });
      return json({ ok: true, status: 'blocked' });
    }
    case 'enable': {
      await target();
      await db.from('profiles').update({ status: 'active' }).eq('id', b.user_id!);
      await db.auth.admin.updateUserById(b.user_id!, { ban_duration: 'none' });
      return json({ ok: true, status: 'active' });
    }
    case 'reset_password': {
      await target();
      const password = b.password && b.password.length >= 8 ? b.password : tempPassword();
      const { error } = await db.auth.admin.updateUserById(b.user_id!, { password });
      if (error) throw new HttpError(400, 'تعذّر تغيير كلمة السر.');
      return json({ ok: true, temp_password: b.password ? null : password });
    }
    default:
      throw new HttpError(400, 'إجراء غير معروف.');
  }
}));
