import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// لوحة التحكم تُنشر تحت /dashboard/ (ADMIN_BASE يغيّرها، مثلاً '/' لنطاق admin.* لاحقاً)
export default defineConfig(({ command, isPreview }) => ({
  base: command === 'build' || isPreview ? process.env.ADMIN_BASE || '/dashboard/' : '/',
  plugins: [react()],
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
