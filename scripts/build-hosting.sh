#!/usr/bin/env bash
# يجمع موقع رقيم التعريفي + لوحة التحكم في مجلد hosting/ لنشره على Firebase Hosting:
#   raqeemiq.web.app/             ← الموقع التعريفي (apps/site)
#   raqeemiq.web.app/dashboard/   ← لوحة التحكم (apps/admin)
# متغيرات اختيارية (كلها عامة، لا أسرار):
#   SUPABASE_URL, SUPABASE_ANON_KEY  ← بيانات حية في الموقع + ربط لوحة التحكم (بدونها: وضع العرض)
#   MEDIA_BASE_URL                   ← رابط الصور العام (R2)؛ فارغ = Supabase Storage
#   DOWNLOAD_URL, DOWNLOAD_VERSION, DOWNLOAD_SIZE_MB ← زر تنزيل APK (وإلا apps/site/download-config.json)
# تجربة محلية بعد البناء: node scripts/serve-hosting.mjs 4810
set -euo pipefail
cd "$(dirname "$0")/.."

ADMIN_BASE="${ADMIN_BASE:-/dashboard/}"
export ADMIN_BASE

rm -rf hosting
mkdir -p hosting

# ١) الموقع: الألوان/الأيقونات/الشعار من packages/shared، الخطوط، كسر الكاش ?v=<sha>، download.json
node scripts/build-site.mjs site

# ٢) لوحة التحكم تحت /dashboard/ (متغيرات VITE_* من بيئة النشر إن لم تُضبط مباشرة)
VITE_SUPABASE_URL="${VITE_SUPABASE_URL:-${SUPABASE_URL:-}}" \
VITE_SUPABASE_ANON_KEY="${VITE_SUPABASE_ANON_KEY:-${SUPABASE_ANON_KEY:-}}" \
VITE_MEDIA_BASE="${VITE_MEDIA_BASE:-${MEDIA_BASE_URL:-}}" \
  npm run build -w @raqeem/admin >/dev/null
dest="hosting/${ADMIN_BASE#/}"
dest="${dest%/}"
mkdir -p "$(dirname "$dest")"
cp -r apps/admin/dist "$dest"
node scripts/build-site.mjs dashboard

# ٣) فحص: كل رابط داخلي موجود، ولا سكربت مضمّن في اللوحة، ولا علامة بناء متبقية
node scripts/check-hosting.mjs

echo "✓ hosting/ جاهز ($(du -sh hosting | cut -f1))"
