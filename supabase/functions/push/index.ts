// push — يستدعيها pg_net من مشغّل notifications (إشعار لزبون/موظف) ومن send_campaign (موضوع all).
// المصادقة بالسر المشترك PUSH_WEBHOOK_SECRET في الرأس x-webhook-secret (verify_jwt=false).
// يضبطه المالك في قاعدة البيانات: insert into private.settings values ('push_url', '<url>'), ('push_secret', '<secret>')
import { handler, HttpError, json, readJson, safeEqual } from '../_shared/cors.ts';
import { admin } from '../_shared/supabase.ts';
import { fcmConfigured, sendFcm, type FcmMessage } from '../_shared/fcm.ts';

interface Notification { id: string; profile_id: string; kind: string; title: string; body: string | null; data: Record<string, unknown> }
interface Campaign { id: string; title: string; body: string | null; image_key: string | null; link_kind: string; link_value: string | null }

const mediaUrl = (key: string | null) => {
  if (!key) return undefined;
  if (/^https?:\/\//.test(key)) return key;
  const base = Deno.env.get('MEDIA_PUBLIC_URL') ?? `${Deno.env.get('SUPABASE_URL')}/storage/v1/object/public/media`;
  return `${base.replace(/\/$/, '')}/${key}`;
};

const channel = (kind: string): FcmMessage['channelId'] =>
  kind === 'order' ? 'orders' : kind === 'promo' ? 'promo' : kind === 'request' ? 'requests' : 'system';

Deno.serve(handler(async (req) => {
  const secret = Deno.env.get('PUSH_WEBHOOK_SECRET');
  if (!secret || !safeEqual(req.headers.get('x-webhook-secret') ?? '', secret)) throw new HttpError(401, 'unauthorized');
  if (!fcmConfigured()) return json({ ok: true, skipped: 'fcm_not_configured' });
  const body = await readJson<{ type: string; record: Notification | Campaign; topic?: string }>(req);

  if (body.type === 'CAMPAIGN') {
    const c = body.record as Campaign;
    await sendFcm([{ topic: body.topic ?? 'all', title: c.title, body: c.body ?? '', channelId: 'promo', image: mediaUrl(c.image_key),
      data: { campaign_id: c.id, link_kind: c.link_kind, link_value: c.link_value } }]);
    return json({ ok: true, topic: body.topic ?? 'all' });
  }

  const n = body.record as Notification;
  if (!n?.profile_id) throw new HttpError(400, 'bad payload');
  const { data: tokens } = await admin().from('push_tokens').select('token').eq('profile_id', n.profile_id);
  if (!tokens?.length) return json({ ok: true, sent: 0 });
  const dead = await sendFcm(tokens.map((t) => ({
    token: t.token, title: n.title, body: n.body ?? '', channelId: channel(n.kind),
    data: { ...n.data, notification_id: n.id, kind: n.kind },
    tag: typeof n.data?.order_id === 'string' ? `order-${n.data.order_id}` : undefined,
  })));
  if (dead.length) await admin().from('push_tokens').delete().in('token', dead);
  return json({ ok: true, sent: tokens.length - dead.length, removed: dead.length });
}));
