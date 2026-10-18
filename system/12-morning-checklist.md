# قائمة صباحك — العمل اليدوي فقط

كل الكود جاهز ومدفوع على الفرع `claude/happy-rubin-s67gcc`. ما بقي حسابات وربط لا يستطيع غيرك فعلها.
اتبع الترتيب. كل خطوة مشروحة بالنقرات في `08-setup-guide.md` (رقم القسم بين قوسين).
بعد كل مرحلة أرسل لي «تم» مع أي خطأ يظهر، **ولا ترسل لي أي مفتاح سري** — مكانها أسرار GitHub فقط.

## الآن (حوالي ساعة) — ليعمل النظام فعلياً
- [ ] **١. جرّب وضع العرض أولاً** (٠): افتح التطبيق والموقع واللوحة ببيانات تجريبية، وأخبرني بأي ملاحظة على الشكل.
- [ ] **٢. بريد المتجر** (١): Gmail جديد للمتجر تفتح به كل الحسابات التالية.
- [ ] **٣. Supabase** (٢): مشروع `raqeem` في Frankfurt، احفظ: كلمة سر القاعدة، Project URL، anon key، Project ref، Access token. اضبط روابط Auth (الخمسة).
- [ ] **٤. Google Cloud** (٣): شاشة الموافقة + OAuth client (Web) برابط `https://<ref>.supabase.co/auth/v1/callback` ← الصق Client ID/Secret في Supabase ← Google.
- [ ] **٥. Firebase** (٤): مشروع `raqeem-iq` + Hosting + حساب الخدمة (JSON) + تطبيق أندرويد `iq.raqeem.app` (google-services.json).
- [ ] **٦. أسرار GitHub** (٥): المستودع ← Settings ← Secrets and variables ← Actions:
  - Secrets: `SUPABASE_ACCESS_TOKEN`، `SUPABASE_PROJECT_REF`، `SUPABASE_DB_PASSWORD`، `PUSH_WEBHOOK_SECRET`، `FIREBASE_SERVICE_ACCOUNT`، `GOOGLE_SERVICES_JSON`، `BACKUP_PASSPHRASE`، `SIGNING_PASSPHRASE`.
  - Variables: `SUPABASE_URL`، `SUPABASE_ANON_KEY`، `FIREBASE_PROJECT_ID` = `raqeem-iq`، `SITE_URL` = `https://raqeem-iq.web.app`.
  - احفظ `BACKUP_PASSPHRASE` و`SIGNING_PASSPHRASE` في مكان آمن خارج GitHub (مدير كلمات سر). ضياعهما لا يُعوّض.
- [ ] **٧. Actions ← Deploy Supabase ← Run workflow** (اختر الفرع `claude/happy-rubin-s67gcc`) ← انتظر ✅.
- [ ] **٨. اجعل نفسك المالك** (٦): أنشئ مستخدمك في Supabase ثم `select public.make_owner('بريدك', 'اسمك');` في SQL Editor.
- [ ] **٩. Actions ← Deploy Site ← Run workflow** ← افتح `https://raqeem-iq.web.app` ثم `/dashboard/` وادخل ← فعّل التحقق بخطوتين من «حسابي».
- [ ] **١٠. اللوحة ← الإعدادات**: اسم المتجر، الهاتف، واتساب، العنوان، ساعات العمل، سعر صرف الدولار، رسوم التوصيل للمحافظات.

## بعدها — التطبيق على الهاتف
- [ ] **١١. Expo Go**: ثبّته على هاتفك. أخبرني وسأعطيك رمز QR، أو على حاسوب: أنشئ `apps/mobile/.env` بالقيمتين العامتين (٧) ثم `npm install` و`npm run mobile:start`.
- [ ] **١٢. Actions ← Create Signing Key ← Run workflow** (مرة واحدة) ← نزّل `signing/raqeem-release.keystore.enc` واحفظه مع الجملة السرية.
- [ ] **١٣. Actions ← Build Android ← Run workflow** ← بعد ~٢٠ دقيقة: APK في Releases ← ثبّته وجرّب الدخول بـ Google والطلب والإشعار.
- [ ] **١٤.** ضع رابط الـ APK في المتغير `DOWNLOAD_URL` (و`DOWNLOAD_VERSION`) ← شغّل Deploy Site ليعمل زر التنزيل في الموقع.

## مع العميل
- [ ] **١٥.** أجوبة الأسئلة ⭐ (ومعها س٩: هل سعر الجملة سرّي؟) في `04-questions-owner.md` و`04b-questions-client.md`.
- [ ] **١٦.** مراجعة بيانات المتجر في `apps/site/config.json` والنصوص القانونية (الخصوصية، الشروط، الإرجاع) — القيم المظلّلة افتراضية (مدة حفظ الفواتير ٥ سنوات، مهلة حذف الحساب ٧ أيام، مهلة الاسترداد ١٤ يوماً). بعد الموافقة أخبرني لأزيل شريط «مسودة».
- [ ] **١٧.** إدخال المنتجات الحقيقية (يدوياً أو استيراد CSV من «المنتجات») وتجربة البيع من نقطة البيع وطباعة إيصال حراري.

## لاحقاً (عند الحاجة)
- [ ] **Cloudflare R2** (٨): عندما تقترب الصور من ١ جيجا.
- [ ] **Wayl** (٩): بعد عقد العميل. أعطهم رابط الـ Webhook، وأضف `WAYL_API_KEY` و`WAYL_WEBHOOK_SECRET`، واطلب منهم السماح بالرجوع إلى `raqeem://payment-return`. ⚠️ واجهة Wayl البرمجية مكتوبة حسب المتوقع ويجب أن أتحقق منها مع وثائقهم قبل أول دفعة حقيقية.
- [ ] **النطاق** (١٠): مثل `raqeem.iq` ← أخبرني لأحدّث الروابط.
- [ ] **Google Play** (١١): حساب مطوّر «منظمة» (٢٥$) ← أجهّز لك AAB والوصف واللقطات ونموذج أمان البيانات.
- [ ] **الفرع الرئيسي**: حين ترضى عن كل شيء، أخبرني لأفتح طلب دمج إلى `main`.

## ما لم يُختبر بعد (يُختبر عند خطواتك)
- ملفات سير العمل لم تعمل على GitHub بعد (فُحصت بـ actionlint فقط). إن فشلت خطوة أرسل لي رابط التشغيل وسأصلحها.
- الدخول بـ Google والإشعارات والدفع تحتاج الحسابات الحقيقية.
- بناء Gradle الكامل للأندرويد يُجرَّب لأول مرة في Build Android.
