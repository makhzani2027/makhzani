// قواعد مسارات الرفع (مطابقة لسياسات storage.objects في migration ٢٠)
const MEDIA_FOLDERS = ['products', 'categories', 'brands', 'banners', 'campaigns'];
const SAFE = /^[A-Za-z0-9._-]+$/;

export function validKey(bucket: string, key: string, uid: string): boolean {
  const parts = key.split('/');
  if (parts.length < 2 || parts.some((p) => !p || p === '.' || p === '..' || !SAFE.test(p))) return false;
  if (bucket === 'media') return MEDIA_FOLDERS.includes(parts[0]);
  if (bucket === 'private') return ['requests', 'avatars'].includes(parts[0]) && parts[1] === uid && parts.length >= 3;
  return false;
}
