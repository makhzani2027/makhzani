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
  },
}));
