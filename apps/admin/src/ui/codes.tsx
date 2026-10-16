import { useEffect, useRef, useState } from 'react';
import JsBarcode from 'jsbarcode';
import QRCode from 'qrcode';
import { isValidGtin } from '@raqeem/shared';

/** باركود SVG: EAN-13 إن كان صالحاً، وإلا CODE128 (يقبل أي نص لاتيني) */
export function Barcode({ value, height = 48, width = 1.6, showText = true, color = '#000' }: { value: string; height?: number; width?: number; showText?: boolean; color?: string }) {
  const ref = useRef<SVGSVGElement>(null);
  const [bad, setBad] = useState(false);
  useEffect(() => {
    if (!ref.current || !value) return;
    try {
      JsBarcode(ref.current, value, {
        format: /^\d{13}$/.test(value) && isValidGtin(value) ? 'EAN13' : 'CODE128',
        height, width, displayValue: showText, fontSize: 13, margin: 0, background: 'transparent', lineColor: color, font: 'monospace',
      });
      setBad(false);
    } catch {
      setBad(true);
    }
  }, [value, height, width, showText, color]);
  if (!value) return null;
  return bad ? <span className="small faint">رمز غير صالح للباركود</span> : <svg ref={ref} role="img" aria-label={`باركود ${value}`} />;
}

/** باركود كنص SVG (للطباعة داخل القوالب) */
export function barcodeSvg(value: string, opts: { height?: number; width?: number; showText?: boolean } = {}): string {
  const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  try {
    JsBarcode(el, value, {
      format: /^\d{13}$/.test(value) && isValidGtin(value) ? 'EAN13' : 'CODE128',
      height: opts.height ?? 40, width: opts.width ?? 1.4, displayValue: opts.showText ?? true, fontSize: 11, margin: 0, background: '#fff', font: 'monospace',
    });
    return el.outerHTML;
  } catch {
    return '';
  }
}

/** رمز QR كنص SVG */
export async function qrSvg(text: string, size = 96): Promise<string> {
  return QRCode.toString(text, { type: 'svg', margin: 0, width: size, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' } });
}

export function QrCode({ value, size = 120 }: { value: string; size?: number }) {
  const [svg, setSvg] = useState('');
  useEffect(() => { void qrSvg(value, size).then(setSvg).catch(() => setSvg('')); }, [value, size]);
  return <span style={{ display: 'inline-block', width: size, height: size }} role="img" aria-label="رمز QR" dangerouslySetInnerHTML={{ __html: svg }} />;
}
