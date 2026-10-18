// اختبارات وحدة لأجزاء دوال الخادم التي لا تحتاج شبكة: التواقيع، مسارات الرفع، حالات Wayl، توقيع R2
import { assert, assertEquals } from 'jsr:@std/assert@1';
import { hmacHex, sha256Hex } from '../../functions/_shared/crypto.ts';
import { mapWaylStatus, verifySignature } from '../../functions/_shared/payments/wayl.ts';
import { validKey } from '../../functions/media/paths.ts';
import { presignPut } from '../../functions/_shared/r2.ts';
import { safeEqual } from '../../functions/_shared/cors.ts';

Deno.test('HMAC-SHA256 (RFC 4231 case 2)', async () => {
  assertEquals(await hmacHex('Jefe', 'what do ya want for nothing?'), '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843');
  assertEquals(await sha256Hex(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
});

Deno.test('webhook signature', async () => {
  const body = '{"referenceId":"x","status":"Complete","total":25000}';
  const sig = await hmacHex('s3cret', body);
  assert(await verifySignature(body, sig, 's3cret'));
  assert(await verifySignature(body, `sha256=${sig.toUpperCase()}`, 's3cret'));
  assert(!(await verifySignature(body + ' ', sig, 's3cret')));
  assert(!(await verifySignature(body, null, 's3cret')));
  assert(safeEqual('abc', 'abc') && !safeEqual('abc', 'abd') && !safeEqual('a', 'ab'));
});

Deno.test('Wayl status mapping', () => {
  assertEquals(mapWaylStatus('Complete'), 'paid');
  assertEquals(mapWaylStatus('Failed'), 'failed');
  assertEquals(mapWaylStatus('Cancelled'), 'cancelled');
  assertEquals(mapWaylStatus('Pending'), 'pending');
});

Deno.test('upload paths', () => {
  const uid = '00000000-0000-4000-8000-0000000000b1';
  assert(validKey('media', 'products/abc/x1-sm.webp', uid));
  assert(!validKey('media', 'avatars/abc/x.webp', uid));
  assert(!validKey('media', 'products/../x.webp', uid));
  assert(validKey('private', `requests/${uid}/a.webp`, uid));
  assert(!validKey('private', 'requests/other/a.webp', uid));
  assert(!validKey('other', 'products/a/b.webp', uid));
});

Deno.test('R2 presigned URL shape', async () => {
  const url = new URL(await presignPut({ accountId: 'acc', accessKeyId: 'AK', secret: 'SK', bucket: 'raqeem', publicUrl: null },
    'products/a/b-sm.webp', 'image/webp', 600, new Date('2026-10-17T12:00:00Z')));
  assertEquals(url.host, 'acc.r2.cloudflarestorage.com');
  assertEquals(url.pathname, '/raqeem/products/a/b-sm.webp');
  assertEquals(url.searchParams.get('X-Amz-Date'), '20261017T120000Z');
  assertEquals(url.searchParams.get('X-Amz-Credential'), 'AK/20261017/auto/s3/aws4_request');
  assert(/^[0-9a-f]{64}$/.test(url.searchParams.get('X-Amz-Signature') ?? ''));
});

Deno.test('payment provider: mock only when chosen explicitly', async () => {
  const { provider } = await import('../../functions/_shared/payments/index.ts');
  const prev = Deno.env.get('PAYMENT_PROVIDER');
  const prevKey = Deno.env.get('WAYL_API_KEY');
  try {
    Deno.env.delete('PAYMENT_PROVIDER');
    Deno.env.delete('WAYL_API_KEY');
    assertEquals(provider().name, 'wayl');
    Deno.env.set('PAYMENT_PROVIDER', 'mock');
    assertEquals(provider().name, 'mock');
  } finally {
    if (prev === undefined) Deno.env.delete('PAYMENT_PROVIDER'); else Deno.env.set('PAYMENT_PROVIDER', prev);
    if (prevKey !== undefined) Deno.env.set('WAYL_API_KEY', prevKey);
  }
});
