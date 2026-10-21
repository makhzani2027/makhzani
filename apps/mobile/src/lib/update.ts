import * as Device from 'expo-device';
import * as FileSystem from 'expo-file-system/legacy';
import * as IntentLauncher from 'expo-intent-launcher';
import { buildNumber, releasesRepo, selfUpdate } from './env';

/**
 * التحديث من داخل التطبيق (للنسخة المنزّلة من الموقع، لا Google Play):
 * نقرأ آخر إصدار من مستودع الإصدارات العام على GitHub، ونقارن رقم البناء، ثم ننزّل ملف APK المناسب
 * لمعالج الهاتف ونفتح شاشة التثبيت. التثبيت فوق النسخة الحالية بلا حذف (نفس مفتاح التوقيع).
 */
export type AppUpdate = {
  version: string; // 1.0.7
  build: number; // 7
  url: string;
  sizeMb: number | null;
  notes: string;
};

type GhRelease = { tag_name: string; body?: string; assets: { name: string; size: number; browser_download_url: string }[] };

/** ملف 32 بت للهواتف القديمة فقط؛ غيرها ملف 64 بت */
function assetName(): string {
  const abis = Device.supportedCpuArchitectures ?? [];
  return abis.length && !abis.includes('arm64-v8a') ? 'raqeem-armv7.apk' : 'raqeem.apk';
}

export async function checkForUpdate(): Promise<AppUpdate | null> {
  if (!selfUpdate) return null;
  const res = await fetch(`https://api.github.com/repos/${releasesRepo}/releases/latest`, { headers: { Accept: 'application/vnd.github+json' } });
  if (!res.ok) return null;
  const rel = (await res.json()) as GhRelease;
  const build = Number(/(\d+)$/.exec(rel.tag_name ?? '')?.[1] ?? 0);
  if (!build || build <= buildNumber) return null;
  const want = assetName();
  const asset = rel.assets.find((a) => a.name === want) ?? rel.assets.find((a) => a.name === 'raqeem.apk');
  if (!asset) return null;
  return {
    version: rel.tag_name.replace(/^v/, ''),
    build,
    url: asset.browser_download_url,
    sizeMb: asset.size ? Math.round(asset.size / 1048576) : null,
    notes: (rel.body ?? '').trim(),
  };
}

/** ينزّل الملف (مع نسبة التقدم) ثم يفتح شاشة التثبيت في أندرويد */
export async function downloadAndInstall(u: AppUpdate, onProgress: (ratio: number) => void): Promise<void> {
  const target = `${FileSystem.cacheDirectory}raqeem-${u.build}.apk`;
  const existing = await FileSystem.getInfoAsync(target);
  if (!existing.exists) {
    const task = FileSystem.createDownloadResumable(u.url, `${target}.part`, {}, (p) => {
      if (p.totalBytesExpectedToWrite > 0) onProgress(p.totalBytesWritten / p.totalBytesExpectedToWrite);
    });
    const done = await task.downloadAsync();
    if (!done || done.status >= 400) throw new Error('تعذّر تنزيل التحديث. تأكد من الإنترنت وحاول مجدداً.');
    await FileSystem.moveAsync({ from: `${target}.part`, to: target });
  }
  onProgress(1);
  const contentUri = await FileSystem.getContentUriAsync(target);
  await IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
    data: contentUri,
    type: 'application/vnd.android.package-archive',
    flags: 1, // FLAG_GRANT_READ_URI_PERMISSION
  });
}

/** حذف ملفات التحديث القديمة من الذاكرة المؤقتة بعد التثبيت */
export async function cleanupUpdates(): Promise<void> {
  try {
    const dir = FileSystem.cacheDirectory;
    if (!dir) return;
    const files = await FileSystem.readDirectoryAsync(dir);
    const old = files.filter((f) => { const m = /^raqeem-(\d+)\.apk(\.part)?$/.exec(f); return !!m && Number(m[1]) <= buildNumber; });
    await Promise.all(old.map((f) => FileSystem.deleteAsync(`${dir}${f}`, { idempotent: true })));
  } catch {
    // تنظيف فقط
  }
}
