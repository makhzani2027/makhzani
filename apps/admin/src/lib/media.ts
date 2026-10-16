/**
 * الصور: ضغط في المتصفح إلى WebP بثلاثة مقاسات ثم رفع. المفتاح بلا لاحقة يُحفظ في قاعدة البيانات.
 * في وضع العرض: الصورة تبقى في المتصفح (رابط blob) ولا تُرفع.
 */
import { IMAGE_QUALITY, IMAGE_SIZES, mediaUrl, newMediaKey, type ImageSize } from '@raqeem/shared';
import { IS_DEMO, MEDIA_BASE } from './env';
import { AppError, sb } from './supabase';

export const MAX_UPLOAD_MB = 15;
const ACCEPT = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

/** رابط صورة للعرض (يدعم روابط blob/data المؤقتة في وضع العرض) */
export function imgUrl(key: string | null | undefined, size: ImageSize = 'sm'): string | null {
  if (!key) return null;
  if (key.startsWith('blob:') || key.startsWith('data:')) return key;
  return mediaUrl(key, size, MEDIA_BASE);
}

async function toBitmap(file: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new AppError('تعذّرت قراءة الصورة. جرّب صورة JPG أو PNG.');
  }
}

async function resize(bmp: ImageBitmap, maxSide: number): Promise<Blob> {
  const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new AppError('المتصفح لا يدعم معالجة الصور.');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, 0, 0, w, h);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/webp', IMAGE_QUALITY));
  if (!blob) throw new AppError('تعذّر ضغط الصورة.');
  return blob;
}

/** ضغط صورة واحدة إلى المقاسات الثلاثة */
export async function compressImage(file: File): Promise<Record<ImageSize, Blob>> {
  if (file.size > MAX_UPLOAD_MB * 1024 * 1024) throw new AppError(`الصورة أكبر من ${MAX_UPLOAD_MB} ميغا.`);
  if (file.type && !ACCEPT.includes(file.type)) throw new AppError('نوع الملف غير مدعوم. استعمل صورة JPG أو PNG أو WebP.');
  const bmp = await toBitmap(file);
  try {
    const out = {} as Record<ImageSize, Blob>;
    for (const size of Object.keys(IMAGE_SIZES) as ImageSize[]) out[size] = await resize(bmp, IMAGE_SIZES[size]);
    return out;
  } finally {
    bmp.close();
  }
}

/**
 * يرفع صورة (بمقاساتها) إلى حاوية media ويعيد المفتاح.
 * folder/ownerId: products/<productId> … (الصلاحية تفحصها سياسات التخزين).
 */
export async function uploadImage(file: File, folder: Parameters<typeof newMediaKey>[0], ownerId: string): Promise<string> {
  const sizes = await compressImage(file);
  if (IS_DEMO) return URL.createObjectURL(sizes.md);
  const key = newMediaKey(folder, ownerId);
  const bucket = sb().storage.from('media');
  for (const [size, blob] of Object.entries(sizes)) {
    const { error } = await bucket.upload(`${key}-${size}.webp`, blob, { contentType: 'image/webp', cacheControl: '31536000', upsert: false });
    if (error) throw new AppError('تعذّر رفع الصورة. تحقق من الإنترنت وحاول مجدداً.');
  }
  return key;
}

/** حذف الصورة بمقاساتها (أفضل جهد — لا يوقف العملية إن فشل) */
export async function deleteImage(key: string | null | undefined): Promise<void> {
  if (!key || IS_DEMO || key.startsWith('blob:') || /^https?:/.test(key)) return;
  await sb().storage.from('media').remove((Object.keys(IMAGE_SIZES) as ImageSize[]).map((s) => `${key}-${s}.webp`)).catch(() => undefined);
}
