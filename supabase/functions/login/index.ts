// login — دخول لوحة التحكم بالبريد أو برقم الهاتف مع كلمة السر (بلا رسائل SMS).
// رقم الهاتف يُحوَّل لبريد الحساب داخل الخادم فقط (login_email لدور service_role)، ثم دخول عادي بكلمة السر.
// الرد: {access_token, refresh_token} فتضبطه اللوحة بـ supabase.auth.setSession. نفس رسالة الخطأ دائماً
// (لا يكشف هل الرقم مسجّل)، مع تأخير ثابت يبطئ التخمين.
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { handler, HttpError, json, readJson } from '../_shared/cors.ts';
import { admin } from '../_shared/supabase.ts';

const WRONG = 'البريد أو رقم الهاتف أو كلمة السر غير صحيحة.';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

Deno.serve(handler(async (req) => {
  if (req.method !== 'POST') throw new HttpError(405, 'method not allowed');
  const b = await readJson<{ identifier?: string; password?: string }>(req);
  const id = (b.identifier ?? '').trim();
  const password = b.password ?? '';
  if (!id || !password) throw new HttpError(400, 'اكتب البريد أو رقم الهاتف وكلمة السر.');
  const started = Date.now();
  const fail = async (): Promise<never> => {
    await sleep(Math.max(0, 900 - (Date.now() - started)));
    throw new HttpError(400, WRONG);
  };
  let email = id.toLowerCase();
  if (!id.includes('@')) {
    const { data, error } = await admin().rpc('login_email', { phone: id });
    if (error || !data) return await fail();
    email = String(data);
  }
  const anon = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await anon.auth.signInWithPassword({ email, password });
  if (error || !data.session) return await fail();
  return json({ access_token: data.session.access_token, refresh_token: data.session.refresh_token });
}));
