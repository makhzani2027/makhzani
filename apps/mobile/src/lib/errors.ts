/** رسالة عربية مفهومة لأي خطأ: رسائل قاعدة البيانات عربية أصلاً وتُعرض كما هي، وأخطاء الشبكة تُترجم */
export function friendlyError(e: unknown, fallback = 'حدث خطأ غير متوقع. أعد المحاولة.'): string {
  const msg = e instanceof Error ? e.message : typeof e === 'string' ? e : (e as { message?: string } | null)?.message;
  if (!msg) return fallback;
  if (/network request failed|failed to fetch|networkerror|load failed|timeout|fetch failed/i.test(msg)) {
    return 'تعذّر الاتصال بالخادم. تأكد من الإنترنت ثم أعد المحاولة.';
  }
  if (/JWT|not authenticated|permission denied|row-level security/i.test(msg)) {
    return 'انتهت جلستك أو لا تملك صلاحية لهذا. سجّل الدخول من جديد.';
  }
  // رسالة عربية من الخادم (raise exception) تُعرض كما هي
  if (/[؀-ۿ]/.test(msg)) return msg;
  return fallback;
}
