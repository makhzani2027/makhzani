// media — روابط رفع موقّعة: Cloudflare R2 إن وُجدت أسرار R2_*، وإلا {mode:'supabase'} فيرفع العميل إلى Storage مباشرة (RLS تحمي).
// المفاتيح من newMediaKey في shared مع لاحقة المقاس: products/<owner>/<rnd>-sm.webp …
//   media/{products|categories|brands|banners|campaigns}/… ← products.write أو store.manage
//   private/{requests|avatars}/<uid>/… ← صاحب المجلد فقط (ويبقى دائماً في Supabase Storage)
// الطلب: {bucket:'media'|'private', keys:string[], content_type:'image/webp'|'image/png'|'image/jpeg'}
// الرد: {mode:'r2'|'supabase', bucket, uploads:[{key, upload_url?, method?, headers?, public_url?}]}
import { handler, HttpError, json, readJson } from '../_shared/cors.ts';
import { getCaller } from '../_shared/supabase.ts';
import { presignPut, r2Config } from '../_shared/r2.ts';
import { validKey } from './paths.ts';

const TYPES = ['image/webp', 'image/png', 'image/jpeg'];

Deno.serve(handler(async (req) => {
  if (req.method !== 'POST') throw new HttpError(405, 'method not allowed');
  const caller = await getCaller(req);
  const b = await readJson<{ bucket?: string; keys?: string[]; key?: string; content_type?: string }>(req);
  const bucket = b.bucket ?? 'media';
  const keys = (b.keys ?? (b.key ? [b.key] : [])).map((k) => k.replace(/^\/+/, ''));
  const type = b.content_type ?? 'image/webp';
  if (!TYPES.includes(type)) throw new HttpError(400, 'الصيغ المسموحة: WebP و PNG و JPEG.');
  if (!keys.length || keys.length > 6) throw new HttpError(400, 'حدد ملفاً واحداً إلى ستة ملفات.');
  if (!keys.every((k) => validKey(bucket, k, caller.id))) throw new HttpError(400, 'مسار غير مسموح.');
  if (bucket === 'media') {
    const [w, s] = await Promise.all([
      caller.client.rpc('has_perm', { p: 'products.write' }),
      caller.client.rpc('has_perm', { p: 'store.manage' }),
    ]);
    if (w.data !== true && s.data !== true) throw new HttpError(403, 'لا تملك صلاحية رفع الصور.');
  }
  const cfg = r2Config();
  if (!cfg || bucket === 'private') return json({ mode: 'supabase', bucket, uploads: keys.map((key) => ({ key })) });
  const uploads = await Promise.all(keys.map(async (key) => ({
    key, upload_url: await presignPut(cfg, key, type), method: 'PUT', headers: { 'Content-Type': type },
    public_url: cfg.publicUrl ? `${cfg.publicUrl.replace(/\/$/, '')}/${key}` : null,
  })));
  return json({ mode: 'r2', bucket, uploads });
}));
