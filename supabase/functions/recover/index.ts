// recover — «نسيت كلمة السر» في اللوحة: يُرسل رابط كلمة السر الجديدة لحساب صاحب رقيم (مدير المنصة) فقط.
// أي بريد آخر يُرفض مباشرة (أصحاب المتاجر وموظفوهم: صاحب المتجر يعيد تعيين كلمة السر من «الموظفون»).
import { handler, HttpError, json, readJson } from '../_shared/cors.ts';
import { admin } from '../_shared/supabase.ts';

const REDIRECT = 'https://raqeem-iq.web.app/dashboard/';

Deno.serve(handler(async (req) => {
  if (req.method !== 'POST') throw new HttpError(405, 'method not allowed');
  const { email: raw } = await readJson<{ email?: string }>(req);
  const email = raw?.trim().toLowerCase() ?? '';
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(400, 'اكتب البريد الإلكتروني للحساب.');
  const db = admin();
  const { data: p } = await db.from('profiles').select('id').eq('email', email).eq('is_platform_admin', true).eq('status', 'active').maybeSingle();
  if (!p) throw new HttpError(403, 'استعادة كلمة السر من هنا متاحة لحساب صاحب رقيم فقط.');
  const { error } = await db.auth.resetPasswordForEmail(email, { redirectTo: REDIRECT });
  if (error) throw new HttpError(429, /rate|seconds|limit/i.test(error.message) ? 'طلبت رابطاً قبل قليل. انتظر دقيقة ثم أعد المحاولة.' : 'تعذّر إرسال الرابط، حاول بعد قليل.');
  return json({ ok: true });
}));
