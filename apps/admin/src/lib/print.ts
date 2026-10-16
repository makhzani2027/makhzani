/**
 * الطباعة: يكتب HTML في إطار مخفي بخط ثمانية ثم يفتح نافذة الطباعة.
 * يعمل مع أي طابعة حرارية معرّفة في النظام (٥٨/٨٠ ملم) ومع A4 والملصقات. القوالب في src/print/.
 */
export type PaperSize = '58mm' | '80mm' | 'A4' | 'A4-landscape' | { width_mm: number; height_mm: number };

function pageCss(paper: PaperSize): string {
  if (paper === 'A4') return '@page { size: A4; margin: 12mm; }';
  if (paper === 'A4-landscape') return '@page { size: A4 landscape; margin: 10mm; }';
  if (typeof paper === 'object') return `@page { size: ${paper.width_mm}mm ${paper.height_mm}mm; margin: 0; }`;
  // الحرارية: العرض ثابت والطول يتبع المحتوى
  return `@page { size: ${paper} auto; margin: 0; } body { width: ${paper}; }`;
}

/** خطوط ثمانية بروابط مطلقة (الإطار لا يرث مسار اللوحة) */
export function fontFaceCss(): string {
  const base = new URL(import.meta.env.BASE_URL || '/', window.location.origin).href;
  const f = (family: string, file: string, weight: number) =>
    `@font-face{font-family:'${family}';src:url('${base}fonts/${file}.woff2') format('woff2');font-weight:${weight};}`;
  return [
    f('Sans', 'thmanyahsans-Regular', 400), f('Sans', 'thmanyahsans-Medium', 500), f('Sans', 'thmanyahsans-Bold', 700),
    f('Sans', 'thmanyahsans-Black', 900), f('Display', 'thmanyahserifdisplay-Black', 900),
  ].join('');
}

export function escapeHtml(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/**
 * يطبع HTML (محتوى body فقط) بمقاس الورق المطلوب. يعيد Promise تنتهي بعد إغلاق نافذة الطباعة.
 * css: أنماط القالب. title: اسم الملف عند «حفظ كـ PDF».
 */
export function printHtml(body: string, opts: { paper: PaperSize; css?: string; title?: string }): Promise<void> {
  return new Promise((resolve) => {
    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.cssText = 'position:fixed;inset-inline-end:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument!;
    doc.open();
    doc.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>${escapeHtml(opts.title ?? 'رقيم')}</title>
<style>${fontFaceCss()}${pageCss(opts.paper)}
*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
html,body{margin:0;padding:0;background:#fff;color:#000;font-family:'Sans',system-ui,sans-serif}
${opts.css ?? ''}</style></head><body>${body}</body></html>`);
    doc.close();
    const win = iframe.contentWindow!;
    const cleanup = () => {
      setTimeout(() => iframe.remove(), 500);
      resolve();
    };
    const go = async () => {
      try {
        await (doc as Document & { fonts?: FontFaceSet }).fonts?.ready;
        const imgs = Array.from(doc.images);
        await Promise.all(imgs.map((im) => (im.complete ? null : new Promise((r) => { im.onload = im.onerror = r; }))));
      } catch {
        /* نطبع على أي حال */
      }
      win.addEventListener('afterprint', cleanup, { once: true });
      win.focus();
      win.print();
      // بعض المتصفحات لا تطلق afterprint
      setTimeout(cleanup, 60_000);
    };
    if (doc.readyState === 'complete') void go();
    else iframe.onload = () => void go();
  });
}
