/**
 * قوالب الطباعة. كل قالب يعيد PrintDoc نقياً (HTML + CSS + الورق)، وprintDoc يرسله لنافذة الطباعة،
 * وpreviewSrcDoc يبني صفحة كاملة لمعاينة حية داخل iframe (الإعدادات، نقطة البيع).
 */
import { fontFaceCss, printHtml } from '../lib/print';
import type { PrintDoc } from './common';

export type { PrintDoc } from './common';
export { buildReceipt, type ReceiptData } from './receipt';
export { buildDeliverySlip } from './deliverySlip';
export { buildInvoiceA4 } from './invoiceA4';
export { buildStatementA4 } from './statementA4';
export { buildReportA4, type ReportTable } from './reportA4';
export { buildVoucher } from './voucher';

/** آخر مستند طُبع — يفيد اختبارات العرض الآلية وزر «طباعة مرة أخرى» */
let last: PrintDoc | null = null;
export const lastPrinted = () => last;

export function printDoc(doc: PrintDoc): Promise<void> {
  last = doc;
  (window as unknown as { __rqLastPrint?: PrintDoc }).__rqLastPrint = doc;
  return printHtml(doc.html, { paper: doc.paper, css: doc.css, title: doc.title });
}

/** صفحة HTML كاملة للمعاينة داخل iframe بعرض الورق الحقيقي */
export function previewSrcDoc(doc: PrintDoc): string {
  const width = doc.paper === '58mm' ? '58mm' : doc.paper === '80mm' ? '80mm' : '210mm';
  const pad = doc.paper === 'A4' ? 'padding:12mm;' : '';
  return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><style>${fontFaceCss()}
*{box-sizing:border-box}html,body{margin:0;background:#fff;color:#000;font-family:'Sans',system-ui,sans-serif}
body{width:${width};${pad}}
${doc.css}</style></head><body>${doc.html}</body></html>`;
}
