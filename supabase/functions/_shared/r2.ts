// رابط رفع موقّع لـ Cloudflare R2 (متوافق مع S3) بتوقيع AWS SigV4 للاستعلام — بلا مكتبات.
// الأسرار: R2_ACCOUNT_ID، R2_ACCESS_KEY_ID، R2_SECRET_ACCESS_KEY، R2_BUCKET، R2_PUBLIC_URL (رابط القراءة العام)
import { hmac, sha256Hex, toHex } from './crypto.ts';

export interface R2Config { accountId: string; accessKeyId: string; secret: string; bucket: string; publicUrl: string | null }

export function r2Config(): R2Config | null {
  const accountId = Deno.env.get('R2_ACCOUNT_ID');
  const accessKeyId = Deno.env.get('R2_ACCESS_KEY_ID');
  const secret = Deno.env.get('R2_SECRET_ACCESS_KEY');
  const bucket = Deno.env.get('R2_BUCKET');
  if (!accountId || !accessKeyId || !secret || !bucket) return null;
  return { accountId, accessKeyId, secret, bucket, publicUrl: Deno.env.get('R2_PUBLIC_URL') ?? null };
}

const encodeKey = (key: string) => key.split('/').map(encodeURIComponent).join('/');

/** رابط PUT موقّع صالح expires ثانية. now للاختبار */
export async function presignPut(cfg: R2Config, key: string, contentType: string, expires = 600, now = new Date()): Promise<string> {
  const host = `${cfg.accountId}.r2.cloudflarestorage.com`;
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const day = amzDate.slice(0, 8);
  const scope = `${day}/auto/s3/aws4_request`;
  const path = `/${cfg.bucket}/${encodeKey(key)}`;
  const params = new URLSearchParams({
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${cfg.accessKeyId}/${scope}`,
    'X-Amz-Date': amzDate,
    'X-Amz-Expires': String(expires),
    'X-Amz-SignedHeaders': 'content-type;host',
  });
  const query = [...params.entries()].sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
  const canonical = ['PUT', path, query, `content-type:${contentType}\nhost:${host}\n`, 'content-type;host', 'UNSIGNED-PAYLOAD'].join('\n');
  const toSign = ['AWS4-HMAC-SHA256', amzDate, scope, await sha256Hex(canonical)].join('\n');
  let k = await hmac(`AWS4${cfg.secret}`, day);
  for (const part of ['auto', 's3', 'aws4_request']) k = await hmac(k, part);
  const signature = toHex(await hmac(k, toSign));
  return `https://${host}${path}?${query}&X-Amz-Signature=${signature}`;
}
