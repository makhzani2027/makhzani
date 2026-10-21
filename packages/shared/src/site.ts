/**
 * محتوى الموقع التعريفي (app_settings.site — عام، يكتبه settings.manage من صفحة «الموقع التعريفي» في اللوحة).
 * بيانات التواصل (الهاتف، واتساب، البريد، المدينة، العنوان، الخريطة، الساعات، الحسابات) ليست هنا: مصدرها الوحيد app_settings.store.
 *
 * النصوص تقبل علامات بسيطة تُعرض بأمان (textContent فقط، لا HTML):
 *   {city} مدينة المتجر · {name} اسم المتجر · {returns_days} مدة الإرجاع · {year} السنة الحالية (في التذييل)
 *   **نص** غامق · [نص](/returns) رابط (يبدأ بـ / أو https://)
 * النسخة نفسها في apps/site/config.json (احتياط الموقع بلا اتصال) وفي migration 22 (الصف الأول) — يفحص تطابقها site.test.ts.
 */
import { GOVERNORATES } from './iraq';

export interface SiteFaqItem {
  q: string;
  a: string;
}

export interface SitePaymentMethod {
  /** مفتاح لاتيني ثابت: cod، office، zaincash، fib، qi، visa، mastercard، أو مفتاح جديد يضيفه المالك */
  key: string;
  label: string;
  description: string;
  enabled: boolean;
  /** صورة الشعار في حاوية media (site/payments/…) — بلا صورة تظهر أيقونة محايدة. لا نضع شعارات الشركات في المستودع */
  logo_key: string | null;
}

export interface SiteDeliveryRow {
  label: string;
  value: string;
}

export interface SiteContent {
  hero: {
    /** السطر الصغير فوق العنوان الرئيسي */
    eyebrow: string;
    /** الفقرة تحت العنوان */
    subtitle: string;
  };
  delivery: {
    title: string;
    rows: SiteDeliveryRow[];
    /** أسماء المحافظات التي تظهر كشارات */
    governorates: string[];
    note: string;
  };
  payments: {
    title: string;
    methods: SitePaymentMethod[];
  };
  faq: SiteFaqItem[];
  stats: {
    /** null = العدد الحقيقي للمنتجات المنشورة (إن تجاوز ٥٠) */
    products: number | null;
    /** null = عدد شارات المحافظات */
    governorates: number | null;
    /** نص حر: «١–٣» */
    delivery_days: string;
    /** null = عدد طرق الدفع المفعّلة */
    payment_methods: number | null;
  };
  footer: {
    about: string;
    /** {year} تُستبدل بالسنة الحالية بالأرقام العربية، و{name} باسم المتجر */
    copyright: string;
  };
}

/** المحافظات الافتراضية في بطاقة التوصيل: الـ١٨ المعروفة (حلبجة مستحدثة ولا نوصل لها بعد) */
export const SITE_DEFAULT_GOVERNORATES: string[] = GOVERNORATES.filter((g) => g.key !== 'halabja').map((g) => g.name);

export const DEFAULT_SITE_CONTENT: SiteContent = {
  hero: {
    eyebrow: 'متجر عراقي في {city} · توصيل لكل المحافظات',
    subtitle: 'منتجات أصلية بضمان، من الهاتف وإكسسواراته إلى أجهزة البيت والمطبخ. اطلب من التطبيق، وادفع عند الاستلام، وتابع طلبك خطوة بخطوة حتى باب بيتك.',
  },
  delivery: {
    title: 'نوصل لكل العراق',
    rows: [
      { label: 'داخل {city}', value: 'خلال ٢٤ ساعة' },
      { label: 'باقي المحافظات', value: 'من ١ إلى ٣ أيام' },
      { label: 'أجرة التوصيل', value: 'حسب المحافظة، وتظهر قبل التأكيد' },
    ],
    governorates: SITE_DEFAULT_GOVERNORATES,
    note: 'العنوان في العراق بلا رمز بريدي، لذلك نطلب منك **أقرب نقطة دالة** ورقم هاتف المستلم حتى يصل المندوب بلا تأخير.',
  },
  payments: {
    title: 'طرق الدفع',
    methods: [
      { key: 'cod', label: 'عند الاستلام', description: 'ادفع نقداً للمندوب بعد أن يصلك طلبك. الطريقة الأسهل والأكثر استعمالاً.', enabled: true, logo_key: null },
      { key: 'office', label: 'في المكتب أو عبر واتساب', description: 'ادفع في محلنا أو استلم طلبك بنفسك. نتواصل معك على واتساب لتأكيد الطلب والموعد.', enabled: true, logo_key: null },
      { key: 'zaincash', label: 'زين كاش', description: 'ادفع من محفظة زين كاش في صفحة البوابة نفسها.', enabled: false, logo_key: null },
      { key: 'fib', label: 'المصرف العراقي الأول (FIB)', description: 'ادفع من تطبيق FIB بمسح الرمز أو بالرابط.', enabled: false, logo_key: null },
      { key: 'qi', label: 'كي كارد / آسيا باي', description: 'ادفع ببطاقة كي أو محفظة آسيا باي.', enabled: false, logo_key: null },
      { key: 'visa', label: 'Visa', description: 'بطاقة Visa عبر بوابة دفع عراقية، ولا نرى رقم بطاقتك أبداً.', enabled: false, logo_key: null },
      { key: 'mastercard', label: 'Mastercard', description: 'بطاقة Mastercard عبر بوابة دفع عراقية، ولا نرى رقم بطاقتك أبداً.', enabled: false, logo_key: null },
    ],
  },
  faq: [
    { q: 'هل المنتجات أصلية؟', a: 'نعم. نشتري من الوكلاء والموزعين المعتمدين فقط، والأجهزة تُسجَّل برقمها التسلسلي على فاتورتك حتى يكون ضمانك واضحاً.' },
    { q: 'كم يستغرق التوصيل، وكم أجرته؟', a: 'داخل {city} خلال ٢٤ ساعة غالباً، وباقي المحافظات من ١ إلى ٣ أيام. الأجرة تختلف حسب المحافظة وتظهر لك في التطبيق قبل تأكيد الطلب.' },
    { q: 'هل أستطيع الدفع عند الاستلام؟', a: 'نعم، وهو الخيار الأكثر استعمالاً. تدفع نقداً للمندوب المبلغ نفسه الظاهر في التطبيق. ويمكنك أيضاً الدفع في المكتب، أو إلكترونياً حين يُفعَّل.' },
    { q: 'هل أحتاج حساباً لأتصفح؟', a: 'لا. التصفح والسلة بلا تسجيل. نطلب الدخول بحساب Google عند إتمام الطلب فقط، حتى نعرف أين نوصل ونتابع معك.' },
    { q: 'كيف أُرجع منتجاً أو أستبدله؟', a: 'خلال {returns_days} من الاستلام، بحالته الأصلية مع علبته وملحقاته. افتح الطلب في التطبيق وتواصل معنا، أو راسلنا برقم الطلب. التفاصيل في [سياسة الإرجاع](/returns).' },
    { q: 'هل يمكنني إلغاء طلبي؟', a: 'نعم، من صفحة الطلب في التطبيق ما دام لم يدخل مرحلة التجهيز. بعد ذلك تواصل معنا وسنساعدك.' },
    { q: 'هل التطبيق متوفر على آيفون؟', a: 'التطبيق لأندرويد حالياً، وقريباً على Google Play. إلى ذلك الحين يمكن لمستخدمي آيفون الطلب عبر واتساب مباشرة.' },
    { q: 'كيف أحذف حسابي وبياناتي؟', a: 'من التطبيق: حسابي ← حذف الحساب. أو راسلنا وسنحذفه لك. التفاصيل في [سياسة الخصوصية](/privacy#delete).' },
  ],
  stats: { products: 500, governorates: null, delivery_days: '١–٣', payment_methods: null },
  footer: {
    about: 'متجر عراقي لمنتجات أصلية بضمان، وتوصيل لكل المحافظات.',
    copyright: '© {year} {name}. جميع الحقوق محفوظة.',
  },
};

/** يدمج قيمة مخزّنة (قد تكون ناقصة أو قديمة) فوق الافتراضي: كل قسم على حدة، والقوائم تُستبدل كاملة */
export function mergeSiteContent(raw: unknown): SiteContent {
  const d = DEFAULT_SITE_CONTENT;
  const v = (raw && typeof raw === 'object' ? raw : {}) as Partial<SiteContent>;
  const obj = <T extends object>(def: T, x: unknown): T => ({ ...def, ...(x && typeof x === 'object' && !Array.isArray(x) ? (x as Partial<T>) : {}) });
  const arr = <T,>(def: T[], x: unknown): T[] => (Array.isArray(x) ? (x as T[]) : def);
  const delivery = obj(d.delivery, v.delivery);
  const payments = obj(d.payments, v.payments);
  return {
    hero: obj(d.hero, v.hero),
    delivery: { ...delivery, rows: arr(d.delivery.rows, delivery.rows), governorates: arr(d.delivery.governorates, delivery.governorates) },
    payments: { ...payments, methods: arr(d.payments.methods, payments.methods).map((m) => ({ ...m, logo_key: m.logo_key ?? null, enabled: !!m.enabled })) },
    faq: arr(d.faq, v.faq),
    stats: obj(d.stats, v.stats),
    footer: obj(d.footer, v.footer),
  };
}

/** القيم التي يعرضها شريط الأرقام فعلاً (التلقائي يُحسب من المحتوى نفسه) */
export function siteStats(s: SiteContent): { products: number | null; governorates: number; delivery_days: string; payment_methods: number } {
  return {
    products: s.stats.products,
    governorates: s.stats.governorates ?? s.delivery.governorates.length,
    delivery_days: s.stats.delivery_days,
    payment_methods: s.stats.payment_methods ?? s.payments.methods.filter((m) => m.enabled).length,
  };
}

/** يستبدل {city} و{name} و{returns_days} و{year} — أي علامة غير معروفة تبقى كما هي */
export function fillSiteTemplate(text: string, vars: Record<string, string | number | null | undefined>): string {
  return String(text ?? '').replace(/\{(\w+)\}/g, (m, k: string) => (vars[k] != null && vars[k] !== '' ? String(vars[k]) : m));
}

/** مفتاح لاتيني لطريقة دفع جديدة من اسمها (فريد بين المفاتيح الموجودة) */
export function newPaymentKey(label: string, taken: string[]): string {
  const base = label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'method';
  let k = base;
  for (let i = 2; taken.includes(k); i += 1) k = `${base}_${i}`;
  return k;
}
