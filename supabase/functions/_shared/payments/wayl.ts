// مزوّد Wayl (بوابة دفع عراقية).
// ⚠ واجهة مفترضة — لم نحصل على توثيق Wayl الرسمي بعد. عدّل هذا الملف وحده عند توفر التوثيق:
//   - إنشاء رابط: POST {WAYL_BASE_URL}/links  برأس X-WAYL-AUTHENTICATION: {WAYL_API_KEY}
//     الجسم: {referenceId, total, currency, customParameter, redirectionUrl, webhookUrl, webhookSecret}
//     الرد المتوقع: {data: {id, url}} أو {id, url}
//   - webhook: جسم JSON {referenceId, id, status: 'Complete'|'Paid'|'Failed'|'Cancelled', total}
//     وتوقيع HMAC-SHA256 للجسم الخام بالسر WAYL_WEBHOOK_SECRET في الرأس x-wayl-signature (hex)
import { hmacHex } from '../crypto.ts';
import { safeEqual } from '../cors.ts';
import type { CreateLinkInput, CreatedLink, PaymentProvider, WebhookEvent, WebhookStatus } from './provider.ts';

const env = (k: string) => {
  const v = Deno.env.get(k);
  if (!v) throw new Error(`السر ${k} غير مضبوط`);
  return v;
};

export function mapWaylStatus(s: unknown): WebhookStatus {
  const v = String(s ?? '').toLowerCase();
  if (['complete', 'completed', 'paid', 'success', 'succeeded'].includes(v)) return 'paid';
  if (['failed', 'declined', 'error'].includes(v)) return 'failed';
  if (['cancelled', 'canceled', 'expired'].includes(v)) return 'cancelled';
  return 'pending';
}

export async function verifySignature(rawBody: string, signature: string | null, secret: string): Promise<boolean> {
  if (!signature) return false;
  const want = await hmacHex(secret, rawBody);
  return safeEqual(want, signature.trim().toLowerCase().replace(/^sha256=/, ''));
}

export const wayl: PaymentProvider = {
  name: 'wayl',
  async createLink(input: CreateLinkInput): Promise<CreatedLink> {
    const res = await fetch(`${env('WAYL_BASE_URL').replace(/\/$/, '')}/links`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-WAYL-AUTHENTICATION': env('WAYL_API_KEY') },
      body: JSON.stringify({
        referenceId: input.transactionId,
        total: input.amount,
        currency: input.currency,
        customParameter: input.orderNumber,
        lineItem: [{ label: `طلب ${input.orderNumber}`, amount: input.amount, type: 'increase' }],
        redirectionUrl: input.redirectUrl,
        webhookUrl: input.webhookUrl,
        webhookSecret: env('WAYL_WEBHOOK_SECRET'),
      }),
    });
    const out = await res.json().catch(() => ({}));
    const d = (out?.data ?? out) as Record<string, unknown>;
    if (!res.ok || !d?.url) throw new Error(`Wayl ${res.status}: ${JSON.stringify(out).slice(0, 300)}`);
    return { providerRef: String(d.id ?? d.referenceId ?? input.transactionId), checkoutUrl: String(d.url), raw: out };
  },
  async parseWebhook(req: Request, rawBody: string): Promise<WebhookEvent> {
    if (!(await verifySignature(rawBody, req.headers.get('x-wayl-signature'), env('WAYL_WEBHOOK_SECRET')))) {
      throw new Error('bad signature');
    }
    const b = JSON.parse(rawBody) as Record<string, unknown>;
    const d = (b.data ?? b) as Record<string, unknown>;
    return {
      transactionId: d.referenceId ? String(d.referenceId) : null,
      providerRef: d.id ? String(d.id) : null,
      status: mapWaylStatus(d.status),
      amount: d.total != null ? Number(d.total) : null,
      raw: b,
    };
  },
};
