/** استيراد ملف نصاً (vite/vitest): import sql from '…/x.sql?raw' — يستعمله site.test.ts فقط */
declare module '*?raw' {
  const text: string;
  export default text;
}
