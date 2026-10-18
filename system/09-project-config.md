# إعدادات المشروع الفعلية (معلومات عامة فقط)

> ⚠️ هذا الملف في GitHub — لا يُكتب فيه أبداً: كلمات السر، `service_role`، مفاتيح Wayl أو R2 أو Firebase.
> يُملأ بعد الإعداد (`08-setup-guide.md`).

## المعرّفات الثابتة في الكود
| | القيمة |
|---|---|
| اسم التطبيق | رقيم |
| حزمة أندرويد | `iq.raqeem.app` |
| رابط التطبيق العميق (scheme) | `raqeem://` |
| مشروع Firebase | `raqeemiq` |
| الموقع | `https://raqeemiq.web.app` |
| لوحة التحكم | `https://raqeemiq.web.app/dashboard/` |
| حاويات التخزين | `media` (عامة)، `private` |

## Supabase
| | القيمة |
|---|---|
| Project ref | `odstlkepelydettcvite` |
| Project URL | `https://odstlkepelydettcvite.supabase.co` |
| anon public key | — |
| Google callback | `https://odstlkepelydettcvite.supabase.co/auth/v1/callback` |
| Webhook الدفع | `https://odstlkepelydettcvite.supabase.co/functions/v1/payments-webhook` |

## متغيرات البيئة
```
# apps/mobile/.env  (للتجربة المحلية فقط — البناء يقرأ GitHub Variables)
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
EXPO_PUBLIC_MEDIA_BASE=          # فارغ = Supabase Storage
EXPO_PUBLIC_SITE_URL=https://raqeemiq.web.app

# apps/admin/.env.local
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=
VITE_MEDIA_BASE=
```
بلا هذه القيم: اللوحة والتطبيق يعملان في **وضع العرض**.
