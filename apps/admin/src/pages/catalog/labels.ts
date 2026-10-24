/**
 * ملصقات الباركود/QR: ملصق واحد لكل صفحة بمقاس InvoiceSettings.label_size (٥٠×٢٥ ملم افتراضياً)،
 * وهو ما تتوقعه طابعات الملصقات الحرارية. نفس HTML يُستعمل للمعاينة في اللوحة وللطباعة.
 */
import { escapeHtml, printHtml } from '../../lib/print';
import { barcodeSvg, qrSvg } from '../../ui';

export interface LabelItem {
  name: string;
  variant: string | null;
  price: number | null;
  /** الباركود، أو SKU إن لم يوجد */
  code: string;
  copies: number;
}

export interface LabelOptions {
  size: { width_mm: number; height_mm: number };
  mode: 'barcode' | 'qr';
  showName: boolean;
  showPrice: boolean;
  money: (n: number) => string;
}

/** أنماط الملصق بوحدات ملم حتى تطابق المعاينةُ المطبوعَ */
export function labelCss(size: LabelOptions['size']): string {
  const h = size.height_mm;
  const f = Math.max(1.9, Math.min(3.4, h / 9)); // حجم الخط الأساسي بالملم
  return `
.lbl{width:${size.width_mm}mm;height:${h}mm;padding:1.4mm 2mm;display:flex;flex-direction:column;justify-content:space-between;overflow:hidden;
  font-family:'Sans',system-ui,sans-serif;color:black;background:white;page-break-after:always;break-after:page;line-height:1.25}
.lbl:last-child{page-break-after:auto;break-after:auto}
.lbl .nm{font-weight:700;font-size:${f}mm;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.lbl .vr{font-size:${f * 0.82}mm;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.lbl .bc{flex:1;min-height:0;display:flex;align-items:stretch;justify-content:center;margin:.6mm 0 .2mm}
.lbl .bc svg{width:100%;height:100%;display:block}
.lbl .ft{display:flex;justify-content:space-between;align-items:baseline;gap:1mm}
.lbl .cd{font-family:ui-monospace,Menlo,monospace;font-size:${f * 0.78}mm;direction:ltr;letter-spacing:.2mm}
.lbl .pr{font-weight:900;font-size:${f * 1.15}mm;white-space:nowrap}
.lbl.qr{flex-direction:row;align-items:center;gap:2mm}
.lbl.qr .q{height:${h - 2.8}mm;width:${h - 2.8}mm;flex:none}
.lbl.qr .q svg{width:100%;height:100%;display:block}
.lbl.qr .tx{flex:1;min-width:0;display:flex;flex-direction:column;justify-content:center;gap:.5mm}`;
}

/** باركود بلا نص داخلي (نكتبه نحن) يتمدد بعرض الملصق */
function stretchBarcode(code: string): string {
  const svg = barcodeSvg(code, { height: 60, width: 2, showText: false });
  // نحذف width/height من وسم <svg> الجذري فقط (تبقى للأشرطة <rect> وإلا اختفت)
  return svg.replace(/<svg[^>]*>/, (tag) => tag.replace(/\s(width|height)="[^"]*"/g, '').replace('<svg', '<svg preserveAspectRatio="none"'));
}

export async function labelHtml(item: LabelItem, opts: LabelOptions): Promise<string> {
  const name = opts.showName ? `<div class="nm">${escapeHtml(item.name)}</div>${item.variant ? `<div class="vr">${escapeHtml(item.variant)}</div>` : ''}` : '';
  const price = opts.showPrice && item.price !== null ? `<span class="pr">${escapeHtml(opts.money(item.price))}</span>` : '<span></span>';
  const code = `<span class="cd">${escapeHtml(item.code)}</span>`;
  if (opts.mode === 'qr') {
    const q = await qrSvg(item.code, 160).catch(() => '');
    return `<div class="lbl qr"><div class="q">${q}</div><div class="tx">${name}${price}${code}</div></div>`;
  }
  return `<div class="lbl">${name}<div class="bc">${stretchBarcode(item.code)}</div><div class="ft">${code}${price}</div></div>`;
}

export async function printLabels(items: LabelItem[], opts: LabelOptions): Promise<void> {
  const parts: string[] = [];
  for (const it of items) {
    if (it.copies <= 0 || !it.code) continue;
    const html = await labelHtml(it, opts);
    for (let i = 0; i < Math.min(it.copies, 500); i++) parts.push(html);
  }
  if (!parts.length) return;
  await printHtml(parts.join(''), { paper: opts.size, css: labelCss(opts.size), title: 'ملصقات الباركود' });
}
