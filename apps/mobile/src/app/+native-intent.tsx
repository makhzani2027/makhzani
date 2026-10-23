import { completeFromUrl } from '@/lib/auth';

/**
 * روابط النظام الواردة والتطبيق مفتوح: عودة Google (auth-callback) وعودة بوابة الدفع (payment-return)
 * تنتظرها نافذة openAuthSessionAsync (lib/auth.tsx و lib/pay.ts). لو تنقّل الموجّه إليها أيضاً
 * لفُتحت شاشة فوق الدخول/الطلب (تبقى نافذة الدخول تحتها، أو تتكرر صفحة الطلب).
 * رمز الدخول يُستبدل هنا أيضاً (مرة واحدة، exchangeCode) احتياطاً إن انتهت النافذة قبل وصول الرابط.
 * عند فتح التطبيق من الرابط نفسه (initial: أُغلق التطبيق أثناء المتصفح) تُفتح الشاشتان كالعادة.
 */
export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }): string | null {
  if (initial) return path;
  const route = path.split(/[?#]/)[0];
  if (/(^|\/)auth-callback\/?$/.test(route)) {
    completeFromUrl(path).catch(() => {});
    return null;
  }
  if (/(^|\/)payment-return\/?$/.test(route)) return null;
  return path;
}
