// payments-webhook — يستدعيه مزوّد الدفع (verify_jwt=false). يتحقق من توقيع HMAC-SHA256 (WAYL_WEBHOOK_SECRET)،
// ثم يحدّث payment_transactions و orders.payment_status ويُشعر الزبون. متكرر الاستدعاء بأمان (idempotent).
import { handler, HttpError, json } from '../_shared/cors.ts';
import { admin } from '../_shared/supabase.ts';
import { provider } from '../_shared/payments/index.ts';

Deno.serve(handler(async (req) => {
  if (req.method !== 'POST') throw new HttpError(405, 'method not allowed');
  const raw = await req.text();
  let ev;
  try {
    ev = await provider().parseWebhook(req, raw);
  } catch {
    throw new HttpError(401, 'invalid signature');
  }
  const db = admin();
  let q = db.from('payment_transactions').select('id, order_id, amount, status, provider_ref');
  q = ev.transactionId ? q.eq('id', ev.transactionId) : q.eq('provider_ref', ev.providerRef ?? '');
  const { data: tx } = await q.maybeSingle();
  if (!tx) return json({ ok: true, ignored: 'unknown transaction' });
  // الحالة النهائية لا تتغير بإعادة الإرسال
  if (['paid', 'refunded', 'cancelled'].includes(tx.status)) return json({ ok: true, idempotent: true, status: tx.status });

  if (ev.status === 'paid') {
    if (ev.amount != null && Math.round(ev.amount) !== Math.round(Number(tx.amount))) {
      await db.from('payment_transactions').update({ status: 'failed', raw: { ...ev.raw, error: 'amount mismatch' } }).eq('id', tx.id);
      return json({ ok: false, error: 'amount mismatch' }, 400);
    }
    // التحديث مشروط بالحالة غير النهائية: استدعاءان متزامنان لا يكرران الأثر
    const { data: upd } = await db.from('payment_transactions').update({ status: 'paid', raw: ev.raw })
      .eq('id', tx.id).in('status', ['created', 'pending', 'failed']).select('id');
    if (!upd?.length) return json({ ok: true, idempotent: true });
    const { data: o } = await db.from('orders').update({ payment_status: 'paid' }).eq('id', tx.order_id).select('id, number, profile_id').single();
    await db.from('order_events').insert({ order_id: tx.order_id, status: null, note: 'تم الدفع إلكترونياً', is_customer_visible: false });
    if (o?.profile_id) {
      await db.from('notifications').insert({ profile_id: o.profile_id, kind: 'order', title: 'وصلتنا دفعتك',
        body: `الطلب ${o.number} مدفوع إلكترونياً`, data: { order_id: o.id, number: o.number, payment_status: 'paid' } });
    }
    return json({ ok: true, status: 'paid' });
  }
  if (ev.status === 'failed' || ev.status === 'cancelled') {
    await db.from('payment_transactions').update({ status: ev.status, raw: ev.raw }).eq('id', tx.id).in('status', ['created', 'pending']);
    await db.from('orders').update({ payment_status: 'failed' }).eq('id', tx.order_id).neq('payment_status', 'paid');
    return json({ ok: true, status: ev.status });
  }
  await db.from('payment_transactions').update({ status: 'pending', raw: ev.raw }).eq('id', tx.id).eq('status', 'created');
  return json({ ok: true, status: 'pending' });
}));
