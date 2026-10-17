// مزوّد تجريبي للتطوير والعرض: صفحة «ادفع (تجريبي)» تستضيفها دالة payments، وزرها يطلب من الخادم
// إرسال webhook موقّع (بنفس صيغة Wayl) إلى payments-webhook. لا يُستعمل في الإنتاج (PAYMENT_PROVIDER=mock فقط).
import { hmacHex } from '../crypto.ts';
import type { CreateLinkInput, CreatedLink, PaymentProvider, WebhookEvent } from './provider.ts';
import { mapWaylStatus, verifySignature } from './wayl.ts';

export const mockSecret = () => Deno.env.get('WAYL_WEBHOOK_SECRET') ?? 'raqeem-mock-secret';
const fnUrl = (name: string) => `${(Deno.env.get('SUPABASE_URL') ?? '').replace(/\/$/, '')}/functions/v1/${name}`;

export const mock: PaymentProvider = {
  name: 'mock',
  createLink(input: CreateLinkInput): Promise<CreatedLink> {
    const url = `${fnUrl('payments')}?mock=${encodeURIComponent(input.transactionId)}`;
    return Promise.resolve({ providerRef: `mock_${input.transactionId}`, checkoutUrl: url, raw: { mock: true, amount: input.amount } });
  },
  async parseWebhook(req: Request, rawBody: string): Promise<WebhookEvent> {
    if (!(await verifySignature(rawBody, req.headers.get('x-wayl-signature'), mockSecret()))) throw new Error('bad signature');
    const b = JSON.parse(rawBody) as Record<string, unknown>;
    return {
      transactionId: b.referenceId ? String(b.referenceId) : null,
      providerRef: b.id ? String(b.id) : null,
      status: mapWaylStatus(b.status),
      amount: b.total != null ? Number(b.total) : null,
      raw: b,
    };
  },
};

/** يرسل نتيجة الدفع التجريبي إلى payments-webhook موقّعة */
export async function sendMockWebhook(tx: { id: string; provider_ref: string | null; amount: number }, status: 'Complete' | 'Failed') {
  const body = JSON.stringify({ referenceId: tx.id, id: tx.provider_ref, status, total: tx.amount });
  return await fetch(fnUrl('payments-webhook'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-wayl-signature': await hmacHex(mockSecret(), body) },
    body,
  });
}

export function mockPage(tx: { id: string; amount: number }, orderNumber: string, redirect: string): string {
  const amount = new Intl.NumberFormat('ar-IQ').format(tx.amount);
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>دفع تجريبي — رقيم</title><style>
:root{--bg:#EDEEEC;--ink:#121513;--accent:#C2410E;--card:#fff}
@media (prefers-color-scheme:dark){:root{--bg:#121513;--ink:#EDEEEC;--accent:#F2783E;--card:#1C201E}}
body{margin:0;min-height:100vh;display:grid;place-items:center;background:var(--bg);color:var(--ink);font-family:system-ui,sans-serif}
main{background:var(--card);border-radius:16px;padding:28px;width:min(360px,calc(100vw - 32px));text-align:center}
h1{font-size:20px;margin:0 0 6px}p{opacity:.75;margin:0 0 20px}strong{display:block;font-size:28px;margin-bottom:20px}
button{width:100%;padding:14px;border:0;border-radius:12px;font-size:16px;cursor:pointer;margin-top:8px}
.pay{background:var(--accent);color:#fff}.fail{background:transparent;color:var(--ink);border:1px solid currentColor;opacity:.7}
</style></head><body><main><h1>دفع تجريبي</h1><p>الطلب ${orderNumber} — لا تُسحب أي أموال</p><strong>${amount} د.ع</strong>
<form method="post" action="?mock=${encodeURIComponent(tx.id)}&result=paid&redirect=${encodeURIComponent(redirect)}"><button class="pay">ادفع (تجريبي)</button></form>
<form method="post" action="?mock=${encodeURIComponent(tx.id)}&result=failed&redirect=${encodeURIComponent(redirect)}"><button class="fail">محاكاة فشل الدفع</button></form>
</main></body></html>`;
}
