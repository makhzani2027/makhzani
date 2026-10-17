// payments — للزبون: create (رابط دفع لطلبه من مبلغ قاعدة البيانات) و status. والمزوّد التجريبي يستضيف صفحته هنا (GET ?mock=).
// verify_jwt=false لأن صفحة الدفع التجريبي تُفتح في المتصفح؛ create/status تتحقق من الجلسة بنفسها.
import { corsHeaders, handler, HttpError, json, readJson } from '../_shared/cors.ts';
import { admin, getCaller } from '../_shared/supabase.ts';
import { provider } from '../_shared/payments/index.ts';
import { mockPage, sendMockWebhook } from '../_shared/payments/mock.ts';

const fnUrl = (name: string) => `${(Deno.env.get('SUPABASE_URL') ?? '').replace(/\/$/, '')}/functions/v1/${name}`;
const appRedirect = () => Deno.env.get('PAYMENT_REDIRECT_URL') ?? 'raqeem://payment-result';

async function handleMock(req: Request, url: URL): Promise<Response> {
  if (provider().name !== 'mock') throw new HttpError(404, 'غير متاح');
  const txId = url.searchParams.get('mock')!;
  const { data: tx } = await admin().from('payment_transactions').select('id, order_id, provider_ref, amount, status').eq('id', txId).maybeSingle();
  if (!tx) throw new HttpError(404, 'محاولة الدفع غير موجودة.');
  const redirect = url.searchParams.get('redirect') ?? appRedirect();
  if (req.method === 'POST') {
    const result = url.searchParams.get('result') === 'paid' ? 'Complete' : 'Failed';
    if (tx.status === 'created' || tx.status === 'pending') await sendMockWebhook(tx, result);
    const sep = redirect.includes('?') ? '&' : '?';
    return new Response(null, { status: 303, headers: { Location: `${redirect}${sep}order_id=${tx.order_id}&status=${result === 'Complete' ? 'paid' : 'failed'}` } });
  }
  const { data: o } = await admin().from('orders').select('number').eq('id', tx.order_id).single();
  return new Response(mockPage(tx, o?.number ?? '', redirect), { headers: { ...corsHeaders, 'Content-Type': 'text/html; charset=utf-8' } });
}

Deno.serve(handler(async (req) => {
  const url = new URL(req.url);
  if (url.searchParams.has('mock')) return await handleMock(req, url);
  if (req.method !== 'POST') throw new HttpError(405, 'method not allowed');

  const caller = await getCaller(req);
  const body = await readJson<{ action?: string; order_id?: string; redirect_url?: string }>(req);
  if (!body.order_id) throw new HttpError(400, 'اختر الطلب.');
  const { data: o } = await admin().from('orders')
    .select('id, number, profile_id, status, payment_method, payment_status, total, address').eq('id', body.order_id).maybeSingle();
  if (!o || o.profile_id !== caller.id) throw new HttpError(404, 'الطلب غير موجود.');

  if (body.action === 'status') {
    const { data: tx } = await admin().from('payment_transactions').select('id, status, checkout_url, amount, created_at, updated_at')
      .eq('order_id', o.id).order('created_at', { ascending: false }).limit(1).maybeSingle();
    return json({ order_id: o.id, payment_status: o.payment_status, transaction: tx ?? null });
  }
  if (body.action !== 'create') throw new HttpError(400, 'إجراء غير معروف.');
  if (o.payment_method !== 'online') throw new HttpError(400, 'طريقة الدفع لهذا الطلب ليست إلكترونية.');
  if (o.payment_status === 'paid') throw new HttpError(400, 'الطلب مدفوع مسبقاً.');
  if (!['pending', 'confirmed', 'preparing', 'ready'].includes(o.status)) throw new HttpError(400, 'لا يمكن دفع هذا الطلب الآن.');

  // محاولة سابقة صالحة خلال ٣٠ دقيقة تُعاد بدل إنشاء رابط جديد
  const { data: open } = await admin().from('payment_transactions').select('id, checkout_url, amount, created_at')
    .eq('order_id', o.id).in('status', ['created', 'pending']).order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (open?.checkout_url && Number(open.amount) === Number(o.total) && Date.now() - Date.parse(open.created_at) < 30 * 60_000) {
    return json({ transaction_id: open.id, checkout_url: open.checkout_url, amount: Number(open.amount) });
  }

  const p = provider();
  const { data: tx, error } = await admin().from('payment_transactions')
    .insert({ order_id: o.id, provider: p.name, amount: o.total, currency: 'IQD', status: 'created' }).select('id').single();
  if (error || !tx) throw new Error(error?.message ?? 'tx insert failed');
  const addr = (o.address ?? {}) as { recipient_name?: string; phone?: string };
  try {
    const link = await p.createLink({
      transactionId: tx.id, orderNumber: o.number, amount: Number(o.total), currency: 'IQD',
      customerName: addr.recipient_name ?? null, customerPhone: addr.phone ?? null,
      redirectUrl: body.redirect_url ?? appRedirect(), webhookUrl: fnUrl('payments-webhook'),
    });
    await admin().from('payment_transactions').update({ provider_ref: link.providerRef, checkout_url: link.checkoutUrl, status: 'pending', raw: link.raw }).eq('id', tx.id);
    await admin().from('orders').update({ payment_status: 'pending' }).eq('id', o.id).neq('payment_status', 'paid');
    return json({ transaction_id: tx.id, checkout_url: link.checkoutUrl, amount: Number(o.total) });
  } catch (e) {
    console.error('payment link', e);
    await admin().from('payment_transactions').update({ status: 'failed', raw: { error: String(e) } }).eq('id', tx.id);
    throw new HttpError(502, 'تعذّر إنشاء رابط الدفع الآن. جرّب بعد قليل أو اختر طريقة دفع أخرى.');
  }
}));
