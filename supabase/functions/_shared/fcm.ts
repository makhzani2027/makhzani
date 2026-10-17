// إشعارات Firebase مباشرة (FCM HTTP v1) — رمز الوصول بتوقيع JWT عبر WebCrypto بلا مكتبات.
// السر FCM_SERVICE_ACCOUNT = محتوى ملف JSON لحساب الخدمة من Firebase. بلا سر = لا إرسال (بلا خطأ).

interface ServiceAccount { project_id: string; client_email: string; private_key: string }

let cached: { token: string; exp: number } | null = null;

function account(): ServiceAccount | null {
  const raw = Deno.env.get('FCM_SERVICE_ACCOUNT');
  if (!raw) return null;
  try {
    const a = JSON.parse(raw) as ServiceAccount;
    return a.project_id && a.client_email && a.private_key ? a : null;
  } catch {
    return null;
  }
}

export const fcmConfigured = () => account() !== null;

export const b64url = (data: Uint8Array | string) =>
  btoa(typeof data === 'string' ? unescape(encodeURIComponent(data)) : String.fromCharCode(...data))
    .replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');

async function accessToken(a: ServiceAccount): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cached && cached.exp - 60 > now) return cached.token;
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({
    iss: a.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  }));
  const pem = a.private_key.replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(pem), (ch) => ch.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(`${header}.${claims}`)));
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${header}.${claims}.${b64url(sig)}`,
  });
  const out = await res.json();
  if (!out.access_token) throw new Error(`FCM auth: ${JSON.stringify(out).slice(0, 200)}`);
  cached = { token: out.access_token, exp: now + (out.expires_in ?? 3600) };
  return cached.token;
}

export interface FcmMessage {
  /** رمز جهاز أو موضوع (topic) */
  token?: string;
  topic?: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  channelId: 'orders' | 'promo' | 'requests' | 'system';
  image?: string;
  tag?: string;
}

function payload(m: FcmMessage) {
  const data = Object.fromEntries(Object.entries(m.data).filter(([, v]) => v != null).map(([k, v]) => [k, typeof v === 'string' ? v : JSON.stringify(v)]));
  return {
    message: {
      ...(m.token ? { token: m.token } : { topic: m.topic }),
      notification: { title: m.title, body: m.body, ...(m.image ? { image: m.image } : {}) },
      data,
      android: {
        priority: 'high',
        notification: {
          channel_id: m.channelId, sound: 'default', color: '#C2410E', notification_priority: 'PRIORITY_HIGH',
          default_vibrate_timings: true, ...(m.image ? { image: m.image } : {}), ...(m.tag ? { tag: m.tag } : {}),
        },
      },
    },
  };
}

/** يرسل الرسائل ويعيد رموز الأجهزة التي لم تعد صالحة (لحذفها) */
export async function sendFcm(messages: FcmMessage[]): Promise<string[]> {
  const a = account();
  if (!a || !messages.length) return [];
  const bearer = await accessToken(a);
  const dead: string[] = [];
  // FCM v1 رسالة واحدة لكل طلب: دفعات متوازية من ٢٠
  for (let i = 0; i < messages.length; i += 20) {
    await Promise.all(messages.slice(i, i + 20).map(async (m) => {
      const res = await fetch(`https://fcm.googleapis.com/v1/projects/${a.project_id}/messages:send`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${bearer}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload(m)),
      });
      if (!res.ok) {
        const err = await res.text();
        if (m.token && (res.status === 404 || err.includes('UNREGISTERED'))) dead.push(m.token);
        else console.error('FCM', res.status, err.slice(0, 300));
      }
    }));
  }
  return dead;
}
