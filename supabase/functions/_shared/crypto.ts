// HMAC-SHA256 و SHA-256 بـ WebCrypto (للتواقيع: webhook الدفع و R2 SigV4)
const enc = new TextEncoder();

export const toHex = (buf: ArrayBuffer | Uint8Array) =>
  Array.from(buf instanceof Uint8Array ? buf : new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');

export async function hmac(key: string | Uint8Array<ArrayBuffer>, data: string): Promise<Uint8Array<ArrayBuffer>> {
  const k = await crypto.subtle.importKey('raw', typeof key === 'string' ? enc.encode(key) : key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(data)));
}

export async function hmacHex(key: string, data: string): Promise<string> {
  return toHex(await hmac(key, data));
}

export async function sha256Hex(data: string): Promise<string> {
  return toHex(await crypto.subtle.digest('SHA-256', enc.encode(data)));
}
