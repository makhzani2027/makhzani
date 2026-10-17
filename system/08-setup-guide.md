# دليل الإعداد — خطوة بخطوة

كل ما تحتاج إنشاءه وربطه حتى يعمل «رقيم» فعلياً. اتبع الترتيب. لا تحتاج حاسوباً بطرفية: كل شيء من المتصفح و GitHub.

> 🔐 **قاعدة ذهبية**: المفاتيح السرية **لا تُكتب أبداً** في الكود أو في محادثة أو في التطبيق. مكانها فقط:
> GitHub ← المستودع ← **Settings ← Secrets and variables ← Actions**. المسموح في الكود فقط `anon key` (عام ومحمي بالصلاحيات).
>
> 💡 قبل كل هذا يمكنك تجربة كل شيء الآن في **وضع العرض** (بيانات تجريبية) — انظر الخطوة ٠.

## قائمة سريعة
| # | الخطوة | الوقت | مطلوب لـ |
|---|---|---|---|
| ٠ | التجربة الفورية (وضع العرض) | ٥ د | أن ترى كل شيء الآن |
| ١ | بريد خاص بالمتجر | ٥ د | ملكية كل الحسابات |
| ٢ | Supabase (قاعدة البيانات) | ١٠ د | كل شيء |
| ٣ | Google Cloud (الدخول بحساب Google) | ١٥ د | دخول الزبائن |
| ٤ | Firebase (الموقع + الإشعارات) | ١٥ د | الموقع، اللوحة، الإشعارات |
| ٥ | أسرار GitHub + النشر | ١٠ د | رفع قاعدة البيانات والموقع |
| ٦ | اجعل نفسك المالك | ٢ د | لوحة التحكم |
| ٧ | ربط التطبيق | ٥ د | التطبيق الحقيقي |
| ٨ | Cloudflare R2 (اختياري الآن) | ١٥ د | عند كثرة الصور |
| ٩ | Wayl (عند التعاقد) | — | الدفع الإلكتروني |
| ١٠ | النطاق الحقيقي (لاحقاً) | ٢٠ د | `raqeem.iq` مثلاً |
| ١١ | Google Play (لاحقاً) | — | النشر في المتجر |

---

## ٠. التجربة الفورية (بلا أي حساب)
- **التطبيق عبر QR**: ثبّت **Expo Go** من Google Play على هاتفك. سأشغّل لك خادم التطوير وأعطيك رمز QR/رابطاً (أو شغّله بنفسك على حاسوب:
  `npm install` ثم `npm run mobile:start` وامسح الرمز). يفتح المتجر ببيانات تجريبية.
- **لوحة التحكم**: بعد الخطوة ٥ تعمل على `https://raqeemiq.web.app/dashboard/` — وبلا Supabase تفتح في وضع العرض أيضاً.

## ١. بريد خاص بالمتجر
أنشئ حساب Gmail جديداً للمتجر (مثل `raqeem.store@gmail.com`) وافتح به **كل** الحسابات التالية. أضف نفسك وبريد العميل كمشرفين حيث يمكن.
هكذا لا تضيع ملكية أي خدمة إن تغيّر شخص.

## ٢. Supabase — قاعدة البيانات
1. https://supabase.com ← **Start your project** ← الدخول بحساب GitHub أو بريد المتجر.
2. **New project**:
   - Name: `raqeem` · Database password: كلمة قوية **احفظها** (تحتاجها في الخطوة ٥) · Region: **Central EU (Frankfurt)** · Plan: Free.
3. بعد الإنشاء (دقيقتان) احفظ من **Project Settings ← API** (أو **Data API**):
   - `Project URL` مثل `https://abcdxyz.supabase.co` · `anon public` key · `Project ref` (الجزء `abcdxyz`).
4. **Authentication ← URL Configuration**:
   - Site URL: `https://raqeemiq.web.app/dashboard/`
   - Redirect URLs (أضف كلاً منها): `raqeem://auth-callback` · `raqeem://payment-return` · `exp://**` · `http://localhost:5173/**` · `https://raqeemiq.web.app/**`
5. **Authentication ← Sign In / Providers ← Email**: فعّل Email، وعطّل «Allow new users to sign up» (الموظفون يُنشؤون من اللوحة فقط؛ الزبائن عبر Google).
6. لا تنفّذ أي SQL بيدك: سير العمل في الخطوة ٥ يبني قاعدة البيانات كلها تلقائياً.
7. **Access token** (لسير العمل): https://supabase.com/dashboard/account/tokens ← **Generate new token** ← الاسم `github` ← انسخه (يظهر مرة).

## ٣. Google Cloud — تسجيل الدخول بحساب Google
1. https://console.cloud.google.com ← أنشئ مشروعاً `raqeem`.
2. **APIs & Services ← OAuth consent screen** (أو Google Auth Platform ← Branding): External، اسم التطبيق «رقيم»، بريد المتجر، شعار (`brand/icons/store-icon-512.png`)،
   روابط: الخصوصية `https://raqeemiq.web.app/privacy` والشروط `https://raqeemiq.web.app/terms`. ثم **Publish app**.
3. **Credentials ← Create credentials ← OAuth client ID ← Web application**:
   - Authorized redirect URIs: `https://<Project ref>.supabase.co/auth/v1/callback`
   - انسخ **Client ID** و **Client secret**.
4. في Supabase: **Authentication ← Sign In / Providers ← Google** ← فعّل والصق القيمتين ← Save.

## ٤. Firebase — الموقع ولوحة التحكم والإشعارات
1. https://console.firebase.google.com ← **Add project** ← اختر مشروع Google Cloud `raqeem` نفسه (أو جديد) ← المعرّف **`raqeemiq`** (إن كان محجوزاً اختر قريباً وأخبرني).
2. **Build ← Hosting ← Get started** (اضغط Next حتى النهاية؛ لا تحتاج تثبيت شيء).
3. **حساب الخدمة** (للنشر والإشعارات): ⚙️ **Project settings ← Service accounts ← Generate new private key** ← ملف JSON. افتحه بالمفكرة وانسخ **كل** النص.
4. **تطبيق أندرويد** (للإشعارات): ⚙️ Project settings ← General ← **Add app ← Android** ← Package name: `iq.raqeem.app` ← Register ←
   نزّل `google-services.json` وانسخ كل نصه.
5. **Cloud Messaging**: يجب أن يكون «Firebase Cloud Messaging API (V1)» **Enabled**.

## ٥. أسرار GitHub والنشر
المستودع ← **Settings ← Secrets and variables ← Actions**.

**تبويب Secrets ← New repository secret** (الاسم حرفياً):
| الاسم | القيمة | لـ |
|---|---|---|
| `SUPABASE_ACCESS_TOKEN` | من ٢-٧ | نشر قاعدة البيانات والدوال |
| `SUPABASE_PROJECT_REF` | من ٢-٣ | |
| `SUPABASE_DB_PASSWORD` | من ٢-٢ | تطبيق migrations |
| `PUSH_WEBHOOK_SECRET` | أي نص عشوائي طويل تخترعه (٤٠ حرفاً إنكليزياً وأرقام) | ربط الإشعارات بقاعدة البيانات |
| `FIREBASE_SERVICE_ACCOUNT` | JSON من ٤-٣ | نشر الموقع + إرسال الإشعارات |
| `GOOGLE_SERVICES_JSON` | JSON من ٤-٤ | بناء التطبيق بالإشعارات |
| `BACKUP_PASSPHRASE` | جملة سرية طويلة **احفظها** | تشفير النسخة الاحتياطية الأسبوعية |

**تبويب Variables ← New repository variable** (عامة، ليست سرية):
| الاسم | القيمة |
|---|---|
| `SUPABASE_URL` | `https://<ref>.supabase.co` |
| `SUPABASE_ANON_KEY` | anon public key |
| `FIREBASE_PROJECT_ID` | `raqeemiq` |

**أسرار إضافية حسب الحاجة**: `PAYMENT_PROVIDER` (`wayl` أو `mock`)، `PAYMENT_REDIRECT_URL`، `R2_PUBLIC_URL`، `MEDIA_PUBLIC_URL`، و`GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` (من الخطوة ٣، إن أردت ضبط Google عبر سير العمل بدل لوحة Supabase).

ثم: **Actions ← Deploy Supabase ← Run workflow** ← انتظر ✅ (يبني الجداول والصلاحيات والدوال والبيانات الأولية ويربط الإشعارات).
ثم: **Actions ← Deploy Site ← Run workflow** ← افتح `https://raqeemiq.web.app` و`https://raqeemiq.web.app/dashboard/`.

> **ربط الإشعارات** (يفعله سير العمل تلقائياً؛ يدوياً إن احتجت) في SQL Editor:
> ```sql
> insert into private.settings values ('push_url','https://<ref>.supabase.co/functions/v1/push'), ('push_secret','<PUSH_WEBHOOK_SECRET>')
> on conflict do nothing;
> ```

## ٦. اجعل نفسك المالك
1. في Supabase: **Authentication ← Users ← Add user ← Create new user**: بريدك + كلمة سر قوية + ✅ Auto Confirm.
2. **SQL Editor ← New query** ← الصق (ضع بريدك) ← **Run**:
   ```sql
   select public.make_owner('بريدك@gmail.com', 'اسمك');
   ```
3. ادخل اللوحة ببريدك وكلمة السر. من **الموظفين** تضيف الباقين، ومن **حسابي** فعّل التحقق بخطوتين.

## ٧. ربط التطبيق
لا شيء عليك: سير عمل البناء يقرأ `SUPABASE_URL` و`SUPABASE_ANON_KEY` من Variables. للتجربة عبر Expo Go من حاسوب:
أنشئ `apps/mobile/.env` فيه `EXPO_PUBLIC_SUPABASE_URL=…` و`EXPO_PUBLIC_SUPABASE_ANON_KEY=…`.
**بناء APK**: Actions ← **Build Android** ← Run workflow ← بعد ~٢٠ دقيقة في Releases.

## ٨. Cloudflare R2 (عندما تقترب الصور من ١ جيجا)
1. https://dash.cloudflare.com ← **R2** ← فعّل (يطلب بطاقة، المجاني ١٠ جيجا) ← **Create bucket** `raqeem-media`.
2. Bucket ← Settings ← **Public access ← R2.dev subdomain ← Allow** (أو نطاقك لاحقاً) ← انسخ الرابط العام.
3. R2 ← **Manage API tokens ← Create** (Object Read & Write على هذا الـ bucket) ← انسخ Access Key ID و Secret.
4. أسرار GitHub: `R2_ACCOUNT_ID`، `R2_ACCESS_KEY_ID`، `R2_SECRET_ACCESS_KEY`، `R2_BUCKET`. ومتغير: `MEDIA_BASE_URL` = الرابط العام.
5. شغّل Deploy Supabase ثم Deploy Site. (نقل الصور القديمة: سير عمل `Migrate media` — أخبرني.)

## ٩. Wayl — الدفع الإلكتروني (بعد عقد العميل)
1. العميل يسجّل حساب تاجر في Wayl ويوثّق المتجر.
2. من لوحة Wayl: **API key** و**Webhook secret**. رابط الـ Webhook الذي تعطيه لهم: `https://<ref>.supabase.co/functions/v1/payments-webhook`.
3. أسرار GitHub: `WAYL_API_KEY`، `WAYL_WEBHOOK_SECRET` (و`WAYL_BASE_URL` إن أعطوك رابطاً مختلفاً) ← Deploy Supabase.
4. اللوحة ← **التوصيل والدفع** ← فعّل «الدفع الإلكتروني». نجرّب بمبلغ صغير قبل الإعلان.

## ١٠. النطاق الحقيقي (لاحقاً)
Firebase ← Hosting ← **Add custom domain** ← `raqeem.iq` ← أضف سجلات DNS التي يعطيك إياها عند مزوّد النطاق ← انتظر الشهادة (حتى ٢٤ ساعة).
للوحة على نطاق فرعي: Hosting ← **Add another site** ← `raqeemiq-admin` ← نطاق `admin.raqeem.iq` — وأخبرني لأحدّث سير العمل وروابط Supabase.

## ١١. Google Play (لاحقاً)
1. https://play.google.com/console ← حساب مطوّر (٢٥$) باسم المتجر (حساب «منظمة» يتجنب شرط التجربة المغلقة ١٤ يوماً للأفراد).
2. أنشئ التطبيق «رقيم» ← سأجهز لك: ملف AAB موقّع، الوصف، لقطات الشاشة، الأيقونة، صورة الواجهة، نموذج أمان البيانات، رابط الخصوصية.
