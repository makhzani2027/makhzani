import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';

/**
 * خطوط ثمانية (@font-face) تُحقن في index.html بمسار يتبع base (/dashboard/).
 * لو كُتبت في CSS بمسار مطلق (/fonts/…) لطُلبت من جذر النطاق لا من مجلد اللوحة.
 */
const FONTS: [family: string, file: string, weight: number][] = [
  ['Sans', 'thmanyahsans-Regular', 400], ['Sans', 'thmanyahsans-Medium', 500], ['Sans', 'thmanyahsans-Bold', 700],
  ['Sans', 'thmanyahsans-Black', 900], ['Display', 'thmanyahserifdisplay-Bold', 700], ['Display', 'thmanyahserifdisplay-Black', 900],
  ['Reading', 'thmanyahseriftext-Regular', 400],
];
function fontFaces(): Plugin {
  let base = '/';
  return {
    name: 'raqeem-font-faces',
    configResolved(c) { base = c.base; },
    transformIndexHtml: {
      order: 'post',
      handler: () => [{
        tag: 'style', injectTo: 'head-prepend',
        children: FONTS.map(([f, file, w]) => `@font-face{font-family:'${f}';src:url('${base}fonts/${file}.woff2') format('woff2');font-weight:${w};font-display:swap}`).join(''),
      }],
    },
  };
}

// لوحة التحكم تُنشر تحت /dashboard/ (ADMIN_BASE يغيّرها، مثلاً '/' لنطاق admin.* لاحقاً)
export default defineConfig(({ command, isPreview }) => ({
  base: command === 'build' || isPreview ? process.env.ADMIN_BASE || '/dashboard/' : '/',
  plugins: [react(), fontFaces()],
  server: { port: 5173, host: true },
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
    // React في حزمة مستقلة: بدونها قد يضع المجمّع React داخل حزمة مشتركة تدخل في حلقة استيراد فتنكسر الصفحات
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (/node_modules[\\/](react|react-dom|scheduler|react-router|react-router-dom)[\\/]/.test(id)) return 'react';
          // الحزمة المشتركة لا تستورد شيئاً من اللوحة، فجمعها في حزمة واحدة يمنع حلقات التهيئة (ثوابت غير معرّفة وقت التحميل)
          if (/packages[\\/]shared[\\/]/.test(id)) return 'shared';
          return undefined;
        },
      },
    },
  },
}));
