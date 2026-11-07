// platform — لمدير منصة رقيم فقط: قائمة مدراء المنصة، إضافة مدير (بريد + كلمة سر)، إزالة مدير.
// مدير المنصة يوافق على المتاجر ويعدّل موقع رقيم؛ لا علاقة له ببيانات أي متجر.
// مفتاح service role داخل الخادم فقط.
import { handler, HttpError, json, readJson } from '../_shared/cors.ts';
import { admin, getCaller } from '../_shared/supabase.ts';

function tempPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

interface Body { action: string; email?: string; full_name?: string; password?: string; user_id?: string }

Deno.serve(handler(async (req) => {
  if (req.method !== 'POST') throw new HttpError(405, 'method not allowed');
  const caller = await getCaller(req);
  const db = admin();
  const { data: me } = await db.from('profiles').select('is_platform_admin').eq('id', caller.id).maybeSingle();
  if (!me?.is_platform_admin) throw new HttpError(403, 'لا تملك صلاحية هذه العملية.');
  const b = await readJson<Body>(req);

  const list = async () => {
    const { data, error } = await db.from('profiles').select('id, email, full_name, status, created_at')
      .eq('is_platform_admin', true).order('created_at');
    if (error) throw new HttpError(500, 'تعذّر تحميل المدراء.');
    return (data ?? []).map((p) => ({ ...p, is_me: p.id === caller.id }));
  };

  switch (b.action) {
    case 'list':
      return json({ admins: await list() });
    case 'add': {
      const email = b.email?.trim().toLowerCase();
      if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(400, 'أدخل بريداً صحيحاً.');
      const name = b.full_name?.trim() || null;
      let { data: p } = await db.from('profiles').select('id').eq('email', email).maybeSingle();
      let temp: string | null = null;
      if (!p) {
        if (b.password && b.password.length < 8) throw new HttpError(400, 'كلمة السر ٨ أحرف على الأقل.');
        const password = b.password || (temp = tempPassword());
        const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: name } });
        if (error || !data.user) throw new HttpError(400, /already|exists|registered/i.test(error?.message ?? '') ? 'هذا البريد مسجّل مسبقاً.' : 'تعذّر إنشاء الحساب.');
        p = { id: data.user.id };
        // ملف المستخدم يُنشئه المشغّل؛ احتياطاً إن لم يُنشأ
        await db.from('profiles').upsert({ id: data.user.id, email, full_name: name }, { onConflict: 'id', ignoreDuplicates: true });
      }
      const upd: Record<string, unknown> = { is_platform_admin: true, status: 'active' };
      if (name) upd.full_name = name;
      const { error: e2 } = await db.from('profiles').update(upd).eq('id', p.id);
      if (e2) throw new HttpError(400, 'تعذّر تعيين المدير.');
      return json({ admins: await list(), temp_password: temp });
    }
    case 'remove': {
      if (!b.user_id) throw new HttpError(400, 'اختر المدير.');
      if (b.user_id === caller.id) throw new HttpError(400, 'لا يمكنك إزالة نفسك.');
      const { error } = await db.from('profiles').update({ is_platform_admin: false }).eq('id', b.user_id).eq('is_platform_admin', true);
      if (error) throw new HttpError(400, 'تعذّرت الإزالة.');
      return json({ admins: await list() });
    }
    default:
      throw new HttpError(400, 'عملية غير معروفة.');
  }
}));
