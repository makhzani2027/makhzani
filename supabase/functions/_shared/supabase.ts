// عميلا Supabase: admin (مفتاح الخادم — يتجاوز RLS) وعميل المستدعي (يخضع لـ RLS ودوال الصلاحية)
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { HttpError } from './cors.ts';

const url = () => Deno.env.get('SUPABASE_URL') ?? '';
const anonKey = () => Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const serviceKey = () => Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

let adminClient: SupabaseClient | null = null;
/** بصلاحية الخادم — استعمله فقط بعد التحقق من المستدعي */
export function admin(): SupabaseClient {
  adminClient ??= createClient(url(), serviceKey(), { auth: { persistSession: false, autoRefreshToken: false } });
  return adminClient;
}

export interface Caller {
  id: string;
  email: string | null;
  kind: 'customer' | 'staff';
  is_owner: boolean;
  status: 'active' | 'blocked';
  /** عميل بصلاحيات المستخدم نفسه */
  client: SupabaseClient;
}

export async function getCaller(req: Request): Promise<Caller> {
  const auth = req.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) throw new HttpError(401, 'سجّل الدخول أولاً.');
  const client = createClient(url(), anonKey(), {
    global: { headers: { Authorization: auth } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.getUser(auth.slice(7));
  if (error || !data.user) throw new HttpError(401, 'انتهت الجلسة، سجّل الدخول من جديد.');
  const { data: p } = await admin().from('profiles').select('kind, is_owner, status').eq('id', data.user.id).maybeSingle();
  if (!p) throw new HttpError(403, 'الحساب غير موجود.');
  if (p.status !== 'active') throw new HttpError(403, 'حسابك موقوف، تواصل مع المتجر.');
  return { id: data.user.id, email: data.user.email ?? null, kind: p.kind, is_owner: p.is_owner, status: p.status, client };
}

/** يفحص صلاحية بدالة has_perm نفسها (تشمل شرط التحقق بخطوتين aal2) */
export async function requirePerm(caller: Caller, perm: string): Promise<void> {
  const { data, error } = await caller.client.rpc('has_perm', { p: perm });
  if (error || data !== true) throw new HttpError(403, 'لا تملك صلاحية هذه العملية.');
}
