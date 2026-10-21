/**
 * الموقع التعريفي: كل ما يراه الزائر في raqeem-iq.web.app يُعدَّل من هنا بلا تغيير في الكود.
 *   التواصل والمدينة ← app_settings.store (المصدر الوحيد، نفسه في «الإعدادات ← المتجر»)
 *   الأسئلة وطرق الدفع والتوصيل والأرقام والتذييل ← app_settings.site (عام، يقرؤه الموقع بمفتاح anon)
 *   رابط Google Play ← app_settings.app
 * حفظ واحد للصفحة كلها، مع حارس للتغييرات غير المحفوظة.
 */
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  GOVERNORATES, SITE_DEFAULT_GOVERNORATES, fillSiteTemplate, isValidIraqiPhone, newPaymentKey, normalizeIraqiPhone, siteStats, toArabicDigits,
  type IconName, type SiteContent as Site, type SitePaymentMethod, type StoreSettings,
} from '@raqeem/shared';
import { Alert, Badge, Button, Card, ErrorState, Field, Icon, IconButton, Input, Loading, NumberInput, PageHeader, Switch, Textarea, Thumb, askConfirm, toast } from '../../ui';
import { useLoad } from '../../lib/hooks';
import { useSettings } from '../../lib/settings';
import { uploadImage } from '../../lib/media';
import { errorMessage } from '../../lib/supabase';
import { getSetting, saveSetting } from '../sales/data/app-settings';
import { useUnsavedGuard } from '../catalog/components/hooks';
import '../sales/sales.css';
import '../catalog/catalog.css';
import './site.css';

/** الموقع على النطاق نفسه (اللوحة تحت /dashboard/)، أو VITE_SITE_URL، أو النطاق المنشور */
const SITE_URL = (import.meta.env.VITE_SITE_URL as string | undefined)?.trim()
  || (import.meta.env.BASE_URL && import.meta.env.BASE_URL !== '/' ? `${window.location.origin}/` : 'https://raqeem-iq.web.app/');

type Contact = Pick<StoreSettings, 'name' | 'phone' | 'whatsapp' | 'email' | 'city' | 'address' | 'map_url' | 'hours' | 'socials'>;
interface Draft { contact: Contact; site: Site; play: string }

const SECTIONS = [
  { id: 'contact', label: 'التواصل والموقع', icon: 'mapPin' },
  { id: 'delivery', label: 'التوصيل والمحافظات', icon: 'truck' },
  { id: 'payments', label: 'طرق الدفع', icon: 'wallet' },
  { id: 'faq', label: 'الأسئلة الشائعة', icon: 'help' },
  { id: 'stats', label: 'الأرقام', icon: 'chartBar' },
  { id: 'footer', label: 'التذييل', icon: 'layout' },
  { id: 'hero', label: 'أعلى الصفحة', icon: 'imageWide' },
] as const satisfies readonly { id: string; label: string; icon: IconName }[];

const SOCIALS = [
  { k: 'instagram', label: 'انستغرام', url: (h: string) => `https://instagram.com/${h}` },
  { k: 'facebook', label: 'فيسبوك', url: (h: string) => `https://facebook.com/${h}` },
  { k: 'tiktok', label: 'تيك توك', url: (h: string) => `https://www.tiktok.com/@${h}` },
  { k: 'telegram', label: 'تيليغرام', url: (h: string) => `https://t.me/${h}` },
] as const;
const HANDLE = /^@?[\w.]{2,}$/;
/** رابط كامل أو اسم حساب (raqeem.iq / @raqeem) ← رابط كامل يصلح للموقع */
const socialUrl = (k: (typeof SOCIALS)[number]['k'], v: string) => {
  const t = v.trim();
  if (!t || /^https?:\/\//.test(t)) return t;
  return SOCIALS.find((x) => x.k === k)!.url(t.replace(/^@/, ''));
};

const isUrl = (v: string | null | undefined) => !v || /^https?:\/\/\S+$/.test(v.trim());
const isEmail = (v: string | null | undefined) => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
const swap = <T,>(a: T[], i: number, d: -1 | 1): T[] => { const b = [...a]; [b[i], b[i + d]] = [b[i + d], b[i]]; return b; };
const neutralIcon = (key: string): IconName => (key === 'cod' ? 'cash' : key === 'office' ? 'store' : 'card');

async function loadAll(): Promise<Draft> {
  const [store, site, app] = await Promise.all([getSetting('store', true), getSetting('site', true), getSetting('app', true)]);
  const { name, phone, whatsapp, email, city, address, map_url, hours, socials } = store;
  return { contact: { name, phone, whatsapp, email, city: city ?? 'بغداد', address, map_url, hours, socials: { ...socials } }, site: JSON.parse(JSON.stringify(site)) as Site, play: app.play_store_url ?? '' };
}

/** أخطاء التحقق: المفتاح = مكان الحقل («contact.phone»، «faq.2.q»…) */
function validate(d: Draft): Record<string, string> {
  const e: Record<string, string> = {};
  const c = d.contact;
  if (!c.name?.trim()) e['contact.name'] = 'اكتب اسم المتجر';
  if (!c.city?.trim()) e['contact.city'] = 'اكتب المدينة';
  if (c.phone && !isValidIraqiPhone(c.phone)) e['contact.phone'] = 'رقم موبايل عراقي غير صحيح (مثال: 0770 123 4567)';
  if (c.whatsapp && !isValidIraqiPhone(c.whatsapp)) e['contact.whatsapp'] = 'رقم واتساب عراقي غير صحيح (مثال: 0770 123 4567)';
  if (!isEmail(c.email)) e['contact.email'] = 'بريد غير صحيح';
  if (!isUrl(c.map_url)) e['contact.map_url'] = 'الرابط يبدأ بـ https://';
  for (const s of SOCIALS) { const v = c.socials?.[s.k]?.trim(); if (v && !isUrl(v) && !HANDLE.test(v)) e[`contact.${s.k}`] = 'اسم الحساب أو الرابط كاملاً: https://…'; }
  if (!isUrl(d.play)) e.play = 'الرابط يبدأ بـ https://';
  d.site.faq.forEach((f, i) => {
    if (!f.q.trim()) e[`faq.${i}.q`] = 'اكتب السؤال';
    if (!f.a.trim()) e[`faq.${i}.a`] = 'اكتب الجواب';
  });
  d.site.payments.methods.forEach((m, i) => { if (!m.label.trim()) e[`pay.${i}`] = 'اكتب اسم الطريقة'; });
  d.site.delivery.rows.forEach((r, i) => { if (!r.label.trim() || !r.value.trim()) e[`row.${i}`] = 'اكتب العنوان والقيمة'; });
  if (!d.site.delivery.title.trim()) e['delivery.title'] = 'اكتب العنوان';
  if (!d.site.footer.copyright.trim()) e['footer.copyright'] = 'اكتب سطر الحقوق';
  return e;
}

export default function SiteContentPage() {
  const loaded = useLoad(loadAll, []);
  const { reload: reloadCtx } = useSettings();
  const [d, setD] = useState<Draft | null>(null);
  const [initial, setInitial] = useState('');
  const [tried, setTried] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (loaded.data) { setD(loaded.data); setInitial(JSON.stringify(loaded.data)); } }, [loaded.data]);
  const dirty = !!d && JSON.stringify(d) !== initial;
  useUnsavedGuard(dirty);
  const errors = useMemo(() => (d ? validate(d) : {}), [d]);
  const err = (k: string) => (tried ? errors[k] ?? null : null);

  const save = useCallback(async () => {
    if (!d || busy) return;
    setTried(true);
    if (Object.keys(errors).length) {
      toast.error('راجع الحقول المعلّمة بالأحمر');
      setTimeout(() => document.querySelector('.site-page [role="alert"]')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
      return;
    }
    setBusy(true);
    try {
      const c = d.contact;
      const contact: Contact = {
        ...c,
        name: c.name.trim(),
        city: c.city?.trim() || null,
        phone: normalizeIraqiPhone(c.phone) ?? null,
        whatsapp: normalizeIraqiPhone(c.whatsapp) ?? null,
        email: c.email?.trim() || null,
        address: c.address?.trim() || null,
        map_url: c.map_url?.trim() || null,
        hours: c.hours?.trim() || null,
        socials: Object.fromEntries(SOCIALS.map((s) => [s.k, socialUrl(s.k, c.socials?.[s.k] ?? '')]).filter(([, v]) => v)),
      };
      // نقرأ store و app من جديد ونكتب فوقهما حقولنا فقط (العملة وشكل الأرقام… تبقى كما هي)
      const [store, app] = await Promise.all([getSetting('store', true), getSetting('app', true)]);
      await saveSetting('store', { ...store, ...contact });
      await saveSetting('site', d.site);
      const play = d.play.trim() || null;
      if (play !== (app.play_store_url ?? null)) await saveSetting('app', { ...app, play_store_url: play });
      const next = { ...d, contact };
      setD(next);
      setInitial(JSON.stringify(next));
      setTried(false);
      reloadCtx();
      toast.success('حُفظ الموقع التعريفي — يظهر للزوار فوراً');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }, [d, busy, errors, reloadCtx]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); void save(); } };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [save]);

  const header = (
    <PageHeader
      title="الموقع التعريفي"
      description="كل ما يراه الزائر في موقع المتجر: التواصل، التوصيل، طرق الدفع، الأسئلة، الأرقام والتذييل. التعديل يظهر للزوار فور الحفظ."
      actions={<Button icon="external" onClick={() => window.open(SITE_URL, '_blank', 'noopener')}>عرض الموقع</Button>}
    />
  );
  if (loaded.error) return <>{header}<ErrorState message={loaded.error} onRetry={loaded.reload} /></>;
  if (!d) return <>{header}<Loading /></>;

  const site = d.site;
  const setSite = (s: Site) => setD({ ...d, site: s });
  const setContact = (c: Partial<Contact>) => setD({ ...d, contact: { ...d.contact, ...c } });
  const vars = { city: d.contact.city || 'بغداد', name: d.contact.name, year: toArabicDigits(new Date().getFullYear()), returns_days: '٧ أيام' };
  const auto = siteStats({ ...site, stats: { ...site.stats, governorates: null, payment_methods: null } });
  const errCount = tried ? Object.keys(errors).length : 0;

  return (
    <div className="site-page">
      {header}
      <nav className="site-toc" aria-label="أقسام الصفحة">
        {SECTIONS.map((s) => (
          <button key={s.id} type="button" className="site-toc-btn" onClick={() => document.getElementById(`sec-${s.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
            <Icon name={s.icon} size={15} />{s.label}
          </button>
        ))}
      </nav>

      <div className="site-sections">
        {/* ------------------------------------------------ التواصل والموقع */}
        <Section id="contact" where="قسم «تواصل معنا»، وزر واتساب في الأسئلة، وصفحات الخصوصية والشروط والإرجاع. المدينة تظهر في أعلى الصفحة وبطاقة التوصيل. هي نفسها بيانات «الإعدادات ← المتجر».">
          <div className="form-grid">
            <Field label="المدينة" required error={err('contact.city')} hint="مثال: الموصل — تستبدل {city} في كل نصوص الموقع">
              <Input value={d.contact.city ?? ''} onChange={(e) => setContact({ city: e.target.value })} list="site-cities" placeholder="بغداد" />
            </Field>
            <Field label="العنوان الكامل" hint="الحي والشارع وأقرب نقطة دالة"><Input value={d.contact.address ?? ''} onChange={(e) => setContact({ address: e.target.value })} /></Field>
            <Field label="الهاتف" error={err('contact.phone')} hint="رقم موبايل عراقي"><Input dir="ltr" inputMode="tel" value={d.contact.phone ?? ''} onChange={(e) => setContact({ phone: e.target.value })} placeholder="0770 123 4567" /></Field>
            <Field label="واتساب" error={err('contact.whatsapp')} hint="زر «راسلنا الآن» في الموقع"><Input dir="ltr" inputMode="tel" value={d.contact.whatsapp ?? ''} onChange={(e) => setContact({ whatsapp: e.target.value })} placeholder="0770 123 4567" /></Field>
            <Field label="البريد" error={err('contact.email')}><Input dir="ltr" inputMode="email" value={d.contact.email ?? ''} onChange={(e) => setContact({ email: e.target.value })} placeholder="hello@example.com" /></Field>
            <Field label="أوقات الدوام"><Input value={d.contact.hours ?? ''} onChange={(e) => setContact({ hours: e.target.value })} placeholder="السبت–الخميس، ١٠ص–١٠م" /></Field>
            <Field label="رابط الخريطة" error={err('contact.map_url')} hint="من خرائط Google ← مشاركة ← نسخ الرابط" className="full"><Input dir="ltr" value={d.contact.map_url ?? ''} onChange={(e) => setContact({ map_url: e.target.value })} placeholder="https://maps.app.goo.gl/abc" /></Field>
            {SOCIALS.map((s) => (
              <Field key={s.k} label={s.label} error={err(`contact.${s.k}`)}>
                <Input dir="ltr" value={d.contact.socials?.[s.k] ?? ''} onChange={(e) => setContact({ socials: { ...d.contact.socials, [s.k]: e.target.value } })} placeholder="raqeem.iq" />
              </Field>
            ))}
          </div>
          <datalist id="site-cities">{GOVERNORATES.map((g) => <option key={g.key} value={g.name} />)}<option value="الموصل" /></datalist>
        </Section>

        {/* ------------------------------------------------ التوصيل والمحافظات */}
        <Section id="delivery" where="بطاقة «نوصل لكل العراق» في قسم الدفع والتوصيل، وجملة التوصيل في الشروط والأحكام (أول سطرين).">
          <Field label="عنوان البطاقة" required error={err('delivery.title')}><Input value={site.delivery.title} onChange={(e) => setSite({ ...site, delivery: { ...site.delivery, title: e.target.value } })} /></Field>
          <span className="section-title">الأسطر</span>
          <div className="site-list">
            {site.delivery.rows.map((r, i) => (
              <div key={i} className="site-item site-row">
                <Input aria-label={`عنوان السطر ${i + 1}`} value={r.label} onChange={(e) => setSite({ ...site, delivery: { ...site.delivery, rows: site.delivery.rows.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) } })} placeholder="داخل {city}" />
                <Input aria-label={`قيمة السطر ${i + 1}`} value={r.value} onChange={(e) => setSite({ ...site, delivery: { ...site.delivery, rows: site.delivery.rows.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)) } })} placeholder="خلال ٢٤ ساعة" />
                <Tools i={i} n={site.delivery.rows.length} what="السطر" name={fillSiteTemplate(r.label, vars)}
                  onMove={(dd) => setSite({ ...site, delivery: { ...site.delivery, rows: swap(site.delivery.rows, i, dd) } })}
                  onDelete={() => setSite({ ...site, delivery: { ...site.delivery, rows: site.delivery.rows.filter((_, j) => j !== i) } })} />
                {err(`row.${i}`) ? <span className="site-err" role="alert">{err(`row.${i}`)}</span> : null}
              </div>
            ))}
          </div>
          <div><Button size="sm" icon="plus" onClick={() => setSite({ ...site, delivery: { ...site.delivery, rows: [...site.delivery.rows, { label: '', value: '' }] } })}>سطر جديد</Button></div>
          <GovEditor list={site.delivery.governorates} onChange={(governorates) => setSite({ ...site, delivery: { ...site.delivery, governorates } })} />
          <Field label="الملاحظة أسفل البطاقة" hint="**نص** يظهر غامقاً"><Textarea rows={2} value={site.delivery.note} onChange={(e) => setSite({ ...site, delivery: { ...site.delivery, note: e.target.value } })} /></Field>
        </Section>

        {/* ------------------------------------------------ طرق الدفع */}
        <Section id="payments" where="بطاقة طرق الدفع في قسم الدفع والتوصيل، والرقم «طرق للدفع» في شريط الأرقام. تظهر المفعّلة فقط وبهذا الترتيب.">
          <Field label="عنوان البطاقة"><Input value={site.payments.title} onChange={(e) => setSite({ ...site, payments: { ...site.payments, title: e.target.value } })} /></Field>
          <Alert tone="info">ارفع شعار كل طريقة من موادها الرسمية (PNG أو JPG). بلا شعار تظهر أيقونة محايدة.</Alert>
          <div className="site-list">
            {site.payments.methods.map((m, i) => (
              <PayRow key={m.key} m={m} i={i} n={site.payments.methods.length} error={err(`pay.${i}`)}
                onChange={(x) => setSite({ ...site, payments: { ...site.payments, methods: site.payments.methods.map((y, j) => (j === i ? x : y)) } })}
                onMove={(dd) => setSite({ ...site, payments: { ...site.payments, methods: swap(site.payments.methods, i, dd) } })}
                onDelete={() => setSite({ ...site, payments: { ...site.payments, methods: site.payments.methods.filter((_, j) => j !== i) } })} />
            ))}
          </div>
          <div><Button size="sm" icon="plus" onClick={() => setSite({ ...site, payments: { ...site.payments, methods: [...site.payments.methods, { key: newPaymentKey('', site.payments.methods.map((x) => x.key)), label: '', description: '', enabled: true, logo_key: null }] } })}>طريقة دفع جديدة</Button></div>
        </Section>

        {/* ------------------------------------------------ الأسئلة الشائعة */}
        <Section id="faq" where="قسم «قبل أن تسأل» في الصفحة الرئيسية، بهذا الترتيب. السؤال يُفتح بالنقر.">
          <p className="site-tip">في النص: <code>{'{city}'}</code> المدينة، <code>{'{returns_days}'}</code> مدة الإرجاع، <code>**غامق**</code>، و<code>[سياسة الإرجاع](/returns)</code> رابط.</p>
          <div className="site-list">
            {site.faq.map((f, i) => (
              <div key={i} className="site-item site-faq">
                <span className="site-num">{toArabicDigits(i + 1)}</span>
                <div className="stack-sm grow">
                  <Field label="السؤال" error={err(`faq.${i}.q`)}><Input value={f.q} onChange={(e) => setSite({ ...site, faq: site.faq.map((x, j) => (j === i ? { ...x, q: e.target.value } : x)) })} /></Field>
                  <Field label="الجواب" error={err(`faq.${i}.a`)}><Textarea rows={3} value={f.a} onChange={(e) => setSite({ ...site, faq: site.faq.map((x, j) => (j === i ? { ...x, a: e.target.value } : x)) })} /></Field>
                </div>
                <Tools i={i} n={site.faq.length} what="السؤال" name={f.q} vertical
                  onMove={(dd) => setSite({ ...site, faq: swap(site.faq, i, dd) })}
                  onDelete={() => setSite({ ...site, faq: site.faq.filter((_, j) => j !== i) })} />
              </div>
            ))}
          </div>
          <div><Button size="sm" icon="plus" onClick={() => setSite({ ...site, faq: [...site.faq, { q: '', a: '' }] })}>سؤال جديد</Button></div>
        </Section>

        {/* ------------------------------------------------ الأرقام */}
        <Section id="stats" where="شريط الأرقام الأربعة تحت أعلى الصفحة.">
          <div className="form-grid">
            <StatField label="المنتجات" autoLabel="العدد الحقيقي للمنتجات المنشورة" value={site.stats.products} auto={null} onChange={(v) => setSite({ ...site, stats: { ...site.stats, products: v } })} />
            <StatField label="المحافظات" autoLabel={`عدد شارات المحافظات (${toArabicDigits(auto.governorates)})`} value={site.stats.governorates} auto={auto.governorates} onChange={(v) => setSite({ ...site, stats: { ...site.stats, governorates: v } })} />
            <Field label="أيام التوصيل" hint="نص حر: «١–٣»"><Input value={site.stats.delivery_days} onChange={(e) => setSite({ ...site, stats: { ...site.stats, delivery_days: e.target.value } })} /></Field>
            <StatField label="طرق الدفع" autoLabel={`عدد الطرق المفعّلة (${toArabicDigits(auto.payment_methods)})`} value={site.stats.payment_methods} auto={auto.payment_methods} onChange={(v) => setSite({ ...site, stats: { ...site.stats, payment_methods: v } })} />
          </div>
        </Section>

        {/* ------------------------------------------------ التذييل */}
        <Section id="footer" where="أسفل كل صفحات الموقع.">
          <div className="form-grid">
            <Field label="اسم المتجر" required error={err('contact.name')} hint="يظهر في التذييل وعنوان الصفحات"><Input value={d.contact.name} onChange={(e) => setContact({ name: e.target.value })} /></Field>
            <Field label="سطر الحقوق" required error={err('footer.copyright')} hint="{year} السنة الحالية تلقائياً، {name} اسم المتجر">
              <Input value={site.footer.copyright} onChange={(e) => setSite({ ...site, footer: { ...site.footer, copyright: e.target.value } })} />
            </Field>
            <Field label="نبذة تحت الشعار" className="full"><Textarea rows={2} value={site.footer.about} onChange={(e) => setSite({ ...site, footer: { ...site.footer, about: e.target.value } })} /></Field>
          </div>
          <div className="site-preview"><span className="section-title">معاينة</span><span>{fillSiteTemplate(site.footer.copyright, vars)}</span></div>
        </Section>

        {/* ------------------------------------------------ أعلى الصفحة */}
        <Section id="hero" where="أول ما يراه الزائر: السطر الصغير فوق «تسوّق بثقة» والفقرة تحته، وزر Google Play.">
          <div className="form-grid">
            <Field label="السطر الصغير" className="full" hint={`يظهر: «${fillSiteTemplate(site.hero.eyebrow, vars)}»`}><Input value={site.hero.eyebrow} onChange={(e) => setSite({ ...site, hero: { ...site.hero, eyebrow: e.target.value } })} /></Field>
            <Field label="الفقرة" className="full"><Textarea rows={3} value={site.hero.subtitle} onChange={(e) => setSite({ ...site, hero: { ...site.hero, subtitle: e.target.value } })} /></Field>
            <Field label="رابط Google Play" error={err('play')} hint="فارغ = «قريباً» (نفسه في الإعدادات ← التطبيق)" className="full"><Input dir="ltr" value={d.play} onChange={(e) => setD({ ...d, play: e.target.value })} placeholder="https://play.google.com/store/apps/details?id=iq.raqeem" /></Field>
          </div>
        </Section>
      </div>

      <div className="save-bar">
        <Button variant="primary" size="lg" icon="check" loading={busy} onClick={() => void save()} kbd="Ctrl+S">حفظ</Button>
        <Button size="lg" disabled={!dirty || busy} onClick={async () => { if (await askConfirm({ title: 'تراجع عن كل التغييرات؟', body: 'تعود الصفحة إلى آخر نسخة محفوظة.', danger: true, confirm: 'تراجع' })) { setD(JSON.parse(initial) as Draft); setTried(false); } }}>تراجع</Button>
        {dirty ? <span className="dirty"><Icon name="info" size={15} />تغييرات لم تُحفظ</span> : <span className="faint">كل التغييرات محفوظة</span>}
        {errCount ? <Badge tone="danger">{toArabicDigits(errCount)} حقل يحتاج مراجعة</Badge> : null}
      </div>
    </div>
  );
}

function Section({ id, where, children }: { id: (typeof SECTIONS)[number]['id']; where: string; children: ReactNode }) {
  const s = SECTIONS.find((x) => x.id === id)!;
  return (
    <div id={`sec-${id}`} className="site-sec">
      <Card title={s.label} icon={s.icon}>
        <p className="site-where"><Icon name="eye" size={15} /><span>{where}</span></p>
        <div className="stack">{children}</div>
      </Card>
    </div>
  );
}

/** أعلى / أسفل / حذف (بتأكيد) */
function Tools({ i, n, what, name, onMove, onDelete, vertical }: { i: number; n: number; what: string; name?: string; onMove: (d: -1 | 1) => void; onDelete: () => void; vertical?: boolean }) {
  return (
    <div className={`site-tools ${vertical ? 'v' : ''}`}>
      <IconButton icon="arrowUp" size="sm" label="أعلى" disabled={i === 0} onClick={() => onMove(-1)} />
      <IconButton icon="arrowDown" size="sm" label="أسفل" disabled={i === n - 1} onClick={() => onMove(1)} />
      <IconButton icon="trash" size="sm" label={`حذف ${what}`} onClick={async () => {
        if (await askConfirm({ title: `حذف ${what}؟`, body: name?.trim() ? `«${name.trim()}» — يختفي من الموقع بعد الحفظ.` : 'يختفي من الموقع بعد الحفظ.', danger: true, confirm: 'حذف' })) onDelete();
      }} />
    </div>
  );
}

function PayRow({ m, i, n, error, onChange, onMove, onDelete }: { m: SitePaymentMethod; i: number; n: number; error: string | null; onChange: (m: SitePaymentMethod) => void; onMove: (d: -1 | 1) => void; onDelete: () => void }) {
  const [up, setUp] = useState(false);
  return (
    <div className={`site-item site-pay ${m.enabled ? '' : 'off'}`}>
      <div className="site-logo">
        <Thumb imageKey={m.logo_key} size="lg" icon={neutralIcon(m.key)} alt={m.label} />
        <label className={`btn sm ${up ? 'loading' : ''}`}>
          <input type="file" accept="image/png,image/jpeg,image/webp" hidden disabled={up} onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            setUp(true);
            try { onChange({ ...m, logo_key: await uploadImage(file, 'site', 'payments') }); } catch (er) { toast.error(errorMessage(er)); } finally { setUp(false); }
          }} />
          {up ? 'جارٍ الرفع…' : m.logo_key ? 'تغيير الشعار' : 'رفع شعار'}
        </label>
        {m.logo_key ? <button type="button" className="site-link" onClick={() => onChange({ ...m, logo_key: null })}>إزالة الشعار</button> : null}
      </div>
      <div className="stack-sm grow">
        <div className="site-pay-head">
          <Input aria-label="اسم الطريقة" value={m.label} onChange={(e) => onChange({ ...m, label: e.target.value })} placeholder="مثال: زين كاش" />
          <Switch label={m.enabled ? 'ظاهرة' : 'مخفية'} checked={m.enabled} onChange={(v) => onChange({ ...m, enabled: v })} />
        </div>
        {error ? <span className="site-err" role="alert">{error}</span> : null}
        <Textarea aria-label="وصف الطريقة" rows={2} value={m.description} onChange={(e) => onChange({ ...m, description: e.target.value })} placeholder="سطر يشرح الطريقة للزبون" />
      </div>
      <Tools i={i} n={n} what="طريقة الدفع" name={m.label} vertical onMove={onMove} onDelete={onDelete} />
    </div>
  );
}

function GovEditor({ list, onChange }: { list: string[]; onChange: (l: string[]) => void }) {
  const [text, setText] = useState('');
  const add = () => {
    const v = text.trim();
    if (!v) return;
    if (list.includes(v)) { toast.error('موجودة في القائمة'); return; }
    onChange([...list, v]);
    setText('');
  };
  const missing = GOVERNORATES.map((g) => g.name).filter((g) => !list.includes(g));
  return (
    <div className="stack-sm">
      <div className="sx-between" style={{ flexWrap: 'wrap', gap: 8 }}>
        <span className="section-title" style={{ margin: 0 }}>المحافظات التي نوصل إليها ({toArabicDigits(list.length)})</span>
        <Button size="sm" variant="ghost" icon="refresh" onClick={() => onChange([...SITE_DEFAULT_GOVERNORATES])}>الـ١٨ الافتراضية</Button>
      </div>
      <div className="site-chips">
        {list.map((g, i) => (
          <span key={g} className="tag-chip">{g}
            <button type="button" aria-label={`إزالة ${g}`} onClick={() => onChange(list.filter((_, j) => j !== i))}><Icon name="close" size={14} /></button>
          </span>
        ))}
        {!list.length ? <span className="faint">لا محافظات — تختفي الشارات من البطاقة</span> : null}
      </div>
      <div className="site-add">
        <Input value={text} list="site-govs" onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} placeholder="أضف محافظة…" aria-label="محافظة جديدة" />
        <Button icon="plus" onClick={add} disabled={!text.trim()}>إضافة</Button>
        <datalist id="site-govs">{missing.map((g) => <option key={g} value={g} />)}</datalist>
      </div>
    </div>
  );
}

/** رقم في الشريط: تلقائي (null) أو رقم يكتبه المالك */
function StatField({ label, autoLabel, value, auto, onChange }: { label: string; autoLabel: string; value: number | null; auto: number | null; onChange: (v: number | null) => void }) {
  return (
    <Field label={label}>
      <div className="stack-sm">
        <Switch label="تلقائي" hint={autoLabel} checked={value == null} onChange={(v) => onChange(v ? null : auto ?? 500)} />
        {value != null ? <NumberInput ariaLabel={label} value={value} min={0} onChange={(v) => onChange(v ?? 0)} /> : null}
      </div>
    </Field>
  );
}
