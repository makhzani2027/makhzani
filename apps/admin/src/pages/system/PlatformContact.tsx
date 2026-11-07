/** بيانات تواصل موقع رقيم التعريفي (الصفحة العامة والسياسات) — لمدير المنصة وحده، منفصلة عن إعدادات أي متجر */
import { useEffect, useState } from 'react';
import { isValidIraqiPhone, normalizeIraqiPhone } from '@raqeem/shared';
import { Alert, Button, Card, ErrorState, Field, Input, Loading } from '../../ui';
import { useAction, useLoad } from '../../lib/hooks';
import { AppError, sb } from '../../lib/supabase';
import { IS_DEMO } from '../../lib/env';

interface Contact {
  phone?: string; whatsapp?: string; email?: string; address?: string; city?: string; hours?: string; map_url?: string;
  socials?: { instagram?: string; facebook?: string; tiktok?: string; telegram?: string };
}
const SITE = 'https://raqeem-iq.web.app';

export default function PlatformContact() {
  const cur = useLoad(async () => {
    if (IS_DEMO) return {} as Contact;
    const { data, error } = await sb().from('platform_settings').select('value').eq('key', 'contact').maybeSingle();
    if (error) throw error;
    return ((data?.value ?? {}) as Contact);
  }, []);
  const [d, setD] = useState<Contact | null>(null);
  useEffect(() => { if (cur.data) setD(cur.data); }, [cur.data]);

  const save = useAction(async () => {
    if (!d) return;
    if (d.whatsapp && !isValidIraqiPhone(d.whatsapp)) throw new AppError('رقم واتساب ليس رقم موبايل عراقي صحيح (مثال: 0770 123 4567).');
    if (d.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email.trim())) throw new AppError('البريد الإلكتروني غير صحيح.');
    for (const [k, v] of Object.entries(d.socials ?? {})) if (v && !/^https:\/\//.test(v)) throw new AppError(`رابط ${k} يجب أن يبدأ بـ https://`);
    const next: Contact = { ...d, whatsapp: d.whatsapp ? normalizeIraqiPhone(d.whatsapp) ?? d.whatsapp : undefined, phone: d.phone ? normalizeIraqiPhone(d.phone) ?? d.phone.trim() : undefined };
    const { data, error } = await sb().rpc('set_platform_setting', { key: 'contact', value: next });
    if (error) throw error;
    setD(data as Contact);
  }, { success: 'حُفظت بيانات موقع رقيم — تظهر في الموقع فوراً' });

  if (cur.error) return <ErrorState message={cur.error} onRetry={cur.reload} />;
  if (!d) return <Loading />;
  const set = (k: keyof Omit<Contact, 'socials'>) => (e: { target: { value: string } }) => setD({ ...d, [k]: e.target.value || undefined });
  const soc = (k: keyof NonNullable<Contact['socials']>) => (e: { target: { value: string } }) => setD({ ...d, socials: { ...d.socials, [k]: e.target.value || undefined } });
  return (
    <Card title="بيانات التواصل في موقع رقيم" icon="globe">
      <Alert tone="info">
        هذه البيانات تظهر في الموقع التعريفي العام <b className="ltr">{SITE}</b> وصفحات السياسات. يعدّلها مدير المنصة فقط،
        ولا تتأثر بإعدادات أي متجر (ولا المتجر الأول).
      </Alert>
      <div className="form-grid" style={{ marginTop: 14 }}>
        <Field label="الهاتف"><Input dir="ltr" value={d.phone ?? ''} onChange={set('phone')} placeholder="0770 123 4567" /></Field>
        <Field label="واتساب"><Input dir="ltr" value={d.whatsapp ?? ''} onChange={set('whatsapp')} placeholder="0770 123 4567" /></Field>
        <Field label="البريد الإلكتروني"><Input dir="ltr" type="email" value={d.email ?? ''} onChange={set('email')} placeholder="info@example.com" /></Field>
        <Field label="المدينة"><Input value={d.city ?? ''} onChange={set('city')} placeholder="بغداد" /></Field>
        <Field label="العنوان"><Input value={d.address ?? ''} onChange={set('address')} placeholder="بغداد، العراق" /></Field>
        <Field label="رابط الخريطة" hint="من Google Maps ← مشاركة ← نسخ الرابط"><Input dir="ltr" value={d.map_url ?? ''} onChange={set('map_url')} /></Field>
        <Field label="أوقات الدوام"><Input value={d.hours ?? ''} onChange={set('hours')} placeholder="السبت–الخميس، ١٠ص–١٠م" /></Field>
        <Field label="انستغرام"><Input dir="ltr" value={d.socials?.instagram ?? ''} onChange={soc('instagram')} placeholder="https://instagram.com/…" /></Field>
        <Field label="فيسبوك"><Input dir="ltr" value={d.socials?.facebook ?? ''} onChange={soc('facebook')} placeholder="https://facebook.com/…" /></Field>
        <Field label="تيك توك"><Input dir="ltr" value={d.socials?.tiktok ?? ''} onChange={soc('tiktok')} placeholder="https://tiktok.com/@…" /></Field>
        <Field label="تيليغرام"><Input dir="ltr" value={d.socials?.telegram ?? ''} onChange={soc('telegram')} placeholder="https://t.me/…" /></Field>
      </div>
      <div className="form-actions" style={{ marginTop: 16 }}>
        <Button variant="primary" loading={save.busy} onClick={() => void save.run()}>حفظ بيانات موقع رقيم</Button>
      </div>
    </Card>
  );
}
