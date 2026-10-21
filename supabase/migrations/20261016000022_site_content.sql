-- =============================================================================
-- رقيم — ٢٢: محتوى الموقع التعريفي (app_settings.site) + مجلد site/ في حاوية media لشعارات طرق الدفع
-- آمن لإعادة التشغيل. القراءة للجميع (is_public) والكتابة لـ settings.manage بسياستي app_settings في ١٨_rls.
-- الشكل: SiteContent في packages/shared/src/site.ts (والنسخة نفسها في apps/site/config.json — يفحص تطابقها site.test.ts).
-- بيانات التواصل والمدينة ليست هنا: مصدرها الوحيد app_settings.store.
-- =============================================================================

insert into public.app_settings (key, value, is_public) values ('site', $site$
{
  "hero": {
    "eyebrow": "متجر عراقي في {city} · توصيل لكل المحافظات",
    "subtitle": "منتجات أصلية بضمان، من الهاتف وإكسسواراته إلى أجهزة البيت والمطبخ. اطلب من التطبيق، وادفع عند الاستلام، وتابع طلبك خطوة بخطوة حتى باب بيتك."
  },
  "delivery": {
    "title": "نوصل لكل العراق",
    "rows": [
      {
        "label": "داخل {city}",
        "value": "خلال ٢٤ ساعة"
      },
      {
        "label": "باقي المحافظات",
        "value": "من ١ إلى ٣ أيام"
      },
      {
        "label": "أجرة التوصيل",
        "value": "حسب المحافظة، وتظهر قبل التأكيد"
      }
    ],
    "governorates": [
      "بغداد",
      "البصرة",
      "نينوى",
      "أربيل",
      "السليمانية",
      "دهوك",
      "كركوك",
      "الأنبار",
      "بابل",
      "كربلاء",
      "النجف",
      "واسط",
      "ميسان",
      "ذي قار",
      "المثنى",
      "القادسية (الديوانية)",
      "صلاح الدين",
      "ديالى"
    ],
    "note": "العنوان في العراق بلا رمز بريدي، لذلك نطلب منك **أقرب نقطة دالة** ورقم هاتف المستلم حتى يصل المندوب بلا تأخير."
  },
  "payments": {
    "title": "طرق الدفع",
    "methods": [
      {
        "key": "cod",
        "label": "عند الاستلام",
        "description": "ادفع نقداً للمندوب بعد أن يصلك طلبك. الطريقة الأسهل والأكثر استعمالاً.",
        "enabled": true,
        "logo_key": null
      },
      {
        "key": "office",
        "label": "في المكتب أو عبر واتساب",
        "description": "ادفع في محلنا أو استلم طلبك بنفسك. نتواصل معك على واتساب لتأكيد الطلب والموعد.",
        "enabled": true,
        "logo_key": null
      },
      {
        "key": "zaincash",
        "label": "زين كاش",
        "description": "ادفع من محفظة زين كاش في صفحة البوابة نفسها.",
        "enabled": false,
        "logo_key": null
      },
      {
        "key": "fib",
        "label": "المصرف العراقي الأول (FIB)",
        "description": "ادفع من تطبيق FIB بمسح الرمز أو بالرابط.",
        "enabled": false,
        "logo_key": null
      },
      {
        "key": "qi",
        "label": "كي كارد / آسيا باي",
        "description": "ادفع ببطاقة كي أو محفظة آسيا باي.",
        "enabled": false,
        "logo_key": null
      },
      {
        "key": "visa",
        "label": "Visa",
        "description": "بطاقة Visa عبر بوابة دفع عراقية، ولا نرى رقم بطاقتك أبداً.",
        "enabled": false,
        "logo_key": null
      },
      {
        "key": "mastercard",
        "label": "Mastercard",
        "description": "بطاقة Mastercard عبر بوابة دفع عراقية، ولا نرى رقم بطاقتك أبداً.",
        "enabled": false,
        "logo_key": null
      }
    ]
  },
  "faq": [
    {
      "q": "هل المنتجات أصلية؟",
      "a": "نعم. نشتري من الوكلاء والموزعين المعتمدين فقط، والأجهزة تُسجَّل برقمها التسلسلي على فاتورتك حتى يكون ضمانك واضحاً."
    },
    {
      "q": "كم يستغرق التوصيل، وكم أجرته؟",
      "a": "داخل {city} خلال ٢٤ ساعة غالباً، وباقي المحافظات من ١ إلى ٣ أيام. الأجرة تختلف حسب المحافظة وتظهر لك في التطبيق قبل تأكيد الطلب."
    },
    {
      "q": "هل أستطيع الدفع عند الاستلام؟",
      "a": "نعم، وهو الخيار الأكثر استعمالاً. تدفع نقداً للمندوب المبلغ نفسه الظاهر في التطبيق. ويمكنك أيضاً الدفع في المكتب، أو إلكترونياً حين يُفعَّل."
    },
    {
      "q": "هل أحتاج حساباً لأتصفح؟",
      "a": "لا. التصفح والسلة بلا تسجيل. نطلب الدخول بحساب Google عند إتمام الطلب فقط، حتى نعرف أين نوصل ونتابع معك."
    },
    {
      "q": "كيف أُرجع منتجاً أو أستبدله؟",
      "a": "خلال {returns_days} من الاستلام، بحالته الأصلية مع علبته وملحقاته. افتح الطلب في التطبيق وتواصل معنا، أو راسلنا برقم الطلب. التفاصيل في [سياسة الإرجاع](/returns)."
    },
    {
      "q": "هل يمكنني إلغاء طلبي؟",
      "a": "نعم، من صفحة الطلب في التطبيق ما دام لم يدخل مرحلة التجهيز. بعد ذلك تواصل معنا وسنساعدك."
    },
    {
      "q": "هل التطبيق متوفر على آيفون؟",
      "a": "التطبيق لأندرويد حالياً، وقريباً على Google Play. إلى ذلك الحين يمكن لمستخدمي آيفون الطلب عبر واتساب مباشرة."
    },
    {
      "q": "كيف أحذف حسابي وبياناتي؟",
      "a": "من التطبيق: حسابي ← حذف الحساب. أو راسلنا وسنحذفه لك. التفاصيل في [سياسة الخصوصية](/privacy#delete)."
    }
  ],
  "stats": {
    "products": 500,
    "governorates": null,
    "delivery_days": "١–٣",
    "payment_methods": null
  },
  "footer": {
    "about": "متجر عراقي لمنتجات أصلية بضمان، وتوصيل لكل المحافظات.",
    "copyright": "© {year} {name}. جميع الحقوق محفوظة."
  }
}
$site$::jsonb, true)
on conflict (key) do nothing;

-- الموقع يقرأ هذا المفتاح بمفتاح anon: يبقى عاماً حتى لو حُفظ بغير ذلك
update public.app_settings set is_public = true where key = 'site' and not is_public;

-- شعارات طرق الدفع في media/site/…: يرفعها من يملك settings.manage (صفحة «الموقع التعريفي»)، والمجلدات الأخرى كما كانت
drop policy if exists media_insert on storage.objects;
create policy media_insert on storage.objects for insert to authenticated with check (
  bucket_id = 'media' and (
    ((storage.foldername(name))[1] in ('products', 'categories', 'brands', 'banners', 'campaigns')
      and ((select public.has_perm('products.write')) or (select public.has_perm('store.manage'))))
    or ((storage.foldername(name))[1] = 'site' and (select public.has_perm('settings.manage')))));
drop policy if exists media_update on storage.objects;
create policy media_update on storage.objects for update to authenticated using (
  bucket_id = 'media' and ((select public.has_perm('products.write')) or (select public.has_perm('store.manage'))
    or ((storage.foldername(name))[1] = 'site' and (select public.has_perm('settings.manage')))));
drop policy if exists media_delete on storage.objects;
create policy media_delete on storage.objects for delete to authenticated using (
  bucket_id = 'media' and ((select public.has_perm('products.write')) or (select public.has_perm('store.manage'))
    or ((storage.foldername(name))[1] = 'site' and (select public.has_perm('settings.manage')))));
