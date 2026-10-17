// media — رابط رفع موقّع: Cloudflare R2 إن وُجدت أسرار R2_*، وإلا {mode:'supabase'} فيرفع العميل إلى Storage مباشرة (RLS تحمي).
// المسارات: media/{products|categories|brands|banners|campaigns}/… (products.write أو store.manage)،
//           private/{requests|avatars}/<uid>/… (صاحب المجلد فقط).
import { handler, HttpError, json, readJson } from '../_shared/cors.ts';
import { getCaller } from '../_shared/supabase.ts';
import { presignPut, r2Config } from '../_shared/r2.ts';

const TYPES: Record<string, string> = { 'image/webp': 'webp', 'image/png': 'png', 'image/jpeg': 'jpg' };
const MEDIA_FOLDERS = ['products', 'categories', 'brands', 'banners', 'campaigns'];

export function validPath(bucket: string, folder: string, uid: string): boolean {
  if (bucket === 'media') return MEDIA_FOLDERS.includes(folder);
  if (bucket === 'private') return ['requests', 'avatars'].includes(folder) && uid.length > 0;
  return false;
}

Deno.serve(handler(async (req) => {
  if (req.method !== 'POST') throw new HttpError(405, 'method not allowed');
  const caller = await getCaller(req);
  const b = await readJson<{ bucket?: string; folder?: string; content_type?: string; size?: number }>(req);
  const bucket = b.bucket ?? 'media';
  const folder = b.folder ?? '';
  const ext = TYPES[b.content_type ?? ''];
  if (!ext) throw new HttpError(400, 'الصيغ المسموحة: WebP و PNG و JPEG.');
  if (b.size != null && b.size > 10 * 1024 * 1024) throw new HttpError(400, 'حجم الصورة أكبر من ١٠ ميغا.');
  if (!validPath(bucket, folder, caller.id)) throw new HttpError(400, 'مسار غير مسموح.');
  if (bucket === 'media') {
    const [w, s] = await Promise.all([
      caller.client.rpc('has_perm', { p: 'products.write' }),
      caller.client.rpc('has_perm', { p: 'store.manage' }),
    ]);
    if (w.data !== true && s.data !== true) throw new HttpError(403, 'لا تملك صلاحية رفع الصور.');
  }
  const name = `${crypto.randomUUID()}.${ext}`;
  const key = bucket === 'media' ? `${folder}/${name}` : `${folder}/${caller.id}/${name}`;

  const cfg = r2Config();
  if (!cfg || bucket === 'private') {
    // الخاص دائماً في Supabase Storage (سياسات المجلد لكل مستخدم)
    return json({ mode: 'supabase', bucket, key });
  }
  const url = await presignPut(cfg, key, b.content_type!);
  return json({ mode: 'r2', bucket, key, upload_url: url, method: 'PUT', headers: { 'Content-Type': b.content_type },
    public_url: cfg.publicUrl ? `${cfg.publicUrl.replace(/\/$/, '')}/${key}` : null });
}));
