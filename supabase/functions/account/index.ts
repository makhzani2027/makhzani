// account — حذف حساب الزبون (شرط Google Play): delete_my_account يمسح البيانات الشخصية ويبقي الطلبات مجهولة،
// ثم يُحذف مستخدم auth نهائياً. الموظف لا يحذف حسابه من هنا.
import { handler, HttpError, json } from '../_shared/cors.ts';
import { admin, getCaller } from '../_shared/supabase.ts';

Deno.serve(handler(async (req) => {
  if (req.method !== 'POST') throw new HttpError(405, 'method not allowed');
  const caller = await getCaller(req);
  if (caller.kind !== 'customer') throw new HttpError(403, 'حسابات الموظفين يحذفها المالك من لوحة التحكم.');
  const { error } = await caller.client.rpc('delete_my_account');
  if (error) throw new HttpError(400, error.message);
  const { error: e2 } = await admin().auth.admin.deleteUser(caller.id);
  if (e2) {
    console.error('delete user', e2);
    throw new HttpError(500, 'مُسحت بياناتك، وتعذّر إغلاق الحساب نهائياً. حاول مرة أخرى.');
  }
  return json({ ok: true });
}));
