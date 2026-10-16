/**
 * الباركود: التحقق من EAN-13/EAN-8/UPC-A، وتوليد باركود داخلي للمنتجات التي لا تملك باركوداً.
 * الباركود الداخلي يبدأ بـ «2» (نطاق الاستخدام الداخلي في GS1) فلا يتعارض مع باركود المصنّع.
 */
import { toLatinDigits } from './format';

/** رقم التحقق لـ EAN-13 / EAN-8 / UPC-A (نفس الخوارزمية: الأوزان ٣ و١ من اليمين) */
export function gs1CheckDigit(body: string): number {
  let sum = 0;
  for (let i = 0; i < body.length; i++) {
    const d = Number(body[body.length - 1 - i]);
    sum += i % 2 === 0 ? d * 3 : d;
  }
  return (10 - (sum % 10)) % 10;
}

export function isValidGtin(code: string): boolean {
  const s = toLatinDigits(code).trim();
  if (!/^\d{8}$|^\d{12}$|^\d{13}$|^\d{14}$/.test(s)) return false;
  return gs1CheckDigit(s.slice(0, -1)) === Number(s[s.length - 1]);
}

/** باركود داخلي EAN-13: «2» + «0» + تسلسل من ١٠ أرقام + رقم التحقق. seq من دالة قاعدة البيانات */
export function internalEan13(seq: number): string {
  if (!Number.isInteger(seq) || seq < 0 || seq > 9_999_999_999) throw new Error('تسلسل الباركود خارج النطاق');
  const body = `20${String(seq).padStart(10, '0')}`;
  return body + gs1CheckDigit(body);
}

export const isInternalBarcode = (code: string) => /^20\d{11}$/.test(code) && isValidGtin(code);

/** ينظف ما يرسله قارئ الباركود (مسافات، أسطر، أرقام مشرقية) */
export function cleanScan(raw: string): string {
  return toLatinDigits(raw).replace(/[\r\n\t]/g, '').trim();
}

/** SKU مقترح: بادئة القسم (حرفان أو ثلاثة لاتينية) + تسلسل: «ACC-00042» */
export function suggestSku(prefix: string, seq: number): string {
  const p = (prefix || 'RQ').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4) || 'RQ';
  return `${p}-${String(seq).padStart(5, '0')}`;
}
