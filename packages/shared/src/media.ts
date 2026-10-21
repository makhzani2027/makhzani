/**
 * روابط الصور والملفات. كل صورة منتج/بانر تُرفع بثلاثة مقاسات WebP:
 *   <key>-sm.webp (٤٠٠)  <key>-md.webp (٩٠٠)  <key>-lg.webp (١٦٠٠)
 * والمفتاح المحفوظ في قاعدة البيانات بلا لاحقة: «products/<uuid>/<random>».
 * الأساس (MEDIA_BASE) يأتي من متغير البيئة: Supabase Storage الآن، و Cloudflare R2 لاحقاً بلا تغيير في الكود.
 */

export const IMAGE_SIZES = { sm: 400, md: 900, lg: 1600 } as const;
export type ImageSize = keyof typeof IMAGE_SIZES;
export const IMAGE_QUALITY = 0.82;

/** الأساس الافتراضي من رابط Supabase: <url>/storage/v1/object/public/media */
export function defaultMediaBase(supabaseUrl: string): string {
  return `${supabaseUrl.replace(/\/$/, '')}/storage/v1/object/public/media`;
}

export function mediaUrl(key: string | null | undefined, size: ImageSize, base: string): string | null {
  if (!key) return null;
  if (/^https?:\/\//.test(key)) return key; // رابط كامل (بيانات تجريبية أو خارجية)
  const clean = key.replace(/^\/+/, '');
  const hasExt = /\.(webp|png|jpe?g|gif|svg|avif)$/i.test(clean);
  return `${base.replace(/\/$/, '')}/${hasExt ? clean : `${clean}-${size}.webp`}`;
}

/** مفتاح جديد لصورة: products/<ownerId>/<random> */
export function newMediaKey(folder: 'products' | 'categories' | 'brands' | 'banners' | 'campaigns' | 'avatars' | 'requests' | 'site', ownerId: string): string {
  const rnd = Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  return `${folder}/${ownerId}/${rnd}`;
}

/** مقاس الصورة المناسب لعرض معيّن (بكسل منطقي × كثافة الشاشة) */
export function pickSize(displayWidth: number, pixelRatio = 2): ImageSize {
  const px = displayWidth * pixelRatio;
  if (px <= IMAGE_SIZES.sm) return 'sm';
  if (px <= IMAGE_SIZES.md) return 'md';
  return 'lg';
}
