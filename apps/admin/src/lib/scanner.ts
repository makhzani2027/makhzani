import { useEffect, useRef } from 'react';
import { cleanScan } from '@raqeem/shared';

/**
 * قارئ الباركود (USB/بلوتوث) يكتب كلوحة مفاتيح بسرعة كبيرة ثم Enter.
 * هذا الخطاف يلتقط ذلك من أي مكان في الصفحة (حتى لو كان المؤشر في حقل) ويميّزه عن الكتابة اليدوية بالسرعة.
 */
export function useBarcodeScanner(onScan: (code: string) => void, opts: { enabled?: boolean; minLength?: number; maxGapMs?: number } = {}) {
  const { enabled = true, minLength = 4, maxGapMs = 45 } = opts;
  const cb = useRef(onScan);
  cb.current = onScan;
  useEffect(() => {
    if (!enabled) return;
    let buf = '';
    let last = 0;
    let fastCount = 0;
    const onKey = (e: KeyboardEvent) => {
      const t = performance.now();
      const gap = t - last;
      last = t;
      if (e.key === 'Enter') {
        const code = cleanScan(buf);
        // كل الأحرف وصلت بسرعة القارئ ← مسح
        if (code.length >= minLength && fastCount >= code.length - 1) {
          e.preventDefault();
          e.stopPropagation();
          const el = document.activeElement as HTMLInputElement | null;
          // امسح ما كتبه القارئ داخل الحقل إن كان المؤشر فيه
          if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') && el.dataset.scanTarget !== 'keep' && el.value.endsWith(buf)) {
            const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')?.set;
            setter?.call(el, el.value.slice(0, el.value.length - buf.length));
            el.dispatchEvent(new Event('input', { bubbles: true }));
          }
          cb.current(code);
        }
        buf = '';
        fastCount = 0;
        return;
      }
      if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) return;
      if (gap > maxGapMs * 4) {
        buf = '';
        fastCount = 0;
      } else if (gap <= maxGapMs) fastCount += 1;
      buf += e.key;
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [enabled, minLength, maxGapMs]);
}

/** صوت قصير عند المسح (نجاح/خطأ) بلا ملفات صوتية */
export function beep(kind: 'ok' | 'error' = 'ok') {
  try {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AC();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = kind === 'ok' ? 1320 : 220;
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + (kind === 'ok' ? 0.09 : 0.25));
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.3);
    o.onended = () => void ctx.close();
  } catch {
    /* بلا صوت */
  }
}
