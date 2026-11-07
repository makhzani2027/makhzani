/** تنزيل «رقيم لسطح المكتب» (ويندوز، يعمل بلا إنترنت) — لأصحاب المتاجر وموظفيهم في اللوحة أونلاين */
import { useState } from 'react';
import { Alert, Button, Card, Icon, PageHeader, toast } from '../../ui';
import { useAuth } from '../../lib/auth';
import { errorMessage } from '../../lib/supabase';
import { IS_DEMO } from '../../lib/env';
import { downloadStoreFile, exportStoreFile } from '../../lib/storeFile';

export const DESKTOP_URL = 'https://github.com/makhzani2027/raqeem-app/releases/download/desktop/Raqeem-Setup.exe';

const STEPS = [
  'اضغط «تنزيل البرنامج»: ينزل ملفان — البرنامج Raqeem-Setup.exe، وملف بيانات متجرك (الاسم والشعار والمنتجات والأسعار والكميات).',
  'افتح الملف. إن ظهر «Windows protected your PC» اضغط More info ثم Run anyway (البرنامج جديد وغير موقّع بشهادة مدفوعة).',
  'اختر مكان التثبيت ثم «تثبيت»، وافتح «رقيم» من سطح المكتب.',
  'عند أول فتح اختر مكان حفظ البيانات على حاسوبك (مثلاً D:\\Raqeem).',
  'أنشئ حساب شركتك واختر «ملف بيانات متجري» الذي نزل مع البرنامج: يُملأ الاسم والشعار وتُنقل منتجاتك وأسعارها وكمياتها. ثم ضع كلمة سر.',
  'ابدأ البيع والعروض والفواتير، كلها بلا إنترنت.',
];

export default function DesktopApp() {
  const auth = useAuth();
  const [busy, setBusy] = useState(false);
  const saveData = async () => {
    if (IS_DEMO || !auth.store) return;
    setBusy(true);
    try {
      const f = await exportStoreFile({ name: auth.store.name, logo_key: auth.store.logo_key });
      downloadStoreFile(f);
      toast.success(`نزل ملف بيانات متجرك (${f.products.length} منتج)`);
    } catch (e) { toast.error(errorMessage(e)); } finally { setBusy(false); }
  };
  const download = () => {
    window.location.href = DESKTOP_URL;
    void saveData();
  };
  return (
    <>
      <PageHeader title="برنامج الحاسوب" description="رقيم على حاسوبك: يعمل بلا إنترنت، وبياناتك محفوظة عندك." />
      <div className="stack" style={{ maxWidth: 820 }}>
        <Card>
          <div className="row" style={{ gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ width: 64, height: 64, borderRadius: 16, display: 'grid', placeItems: 'center', background: 'var(--accent-soft)', color: 'var(--accent-soft-ink)' }}><Icon name="download" size={30} /></span>
            <div className="grow" style={{ minWidth: 220 }}>
              <b style={{ fontSize: 18 }}>رقيم لسطح المكتب — ويندوز ١٠ و١١</b>
              <div className="dim small">البيع والمخزون وعروض الأسعار والفواتير والتقارير، بلا إنترنت. نسخة احتياطية تلقائية كل يوم.</div>
            </div>
            <Button variant="primary" size="lg" icon="download" loading={busy} onClick={download}>تنزيل البرنامج</Button>
          </div>
        </Card>
        <Card title="خطوات التثبيت" icon="list">
          <ol style={{ margin: 0, paddingInlineStart: 22, display: 'flex', flexDirection: 'column', gap: 10, lineHeight: 1.8 }}>
            {STEPS.map((s) => <li key={s}>{s}</li>)}
          </ol>
        </Card>
        <Alert tone="info">
          ملف بيانات المتجر يحمل اسم متجرك وشعاره وأقسامه ومنتجاته وأسعارها وكمياتها الحالية — بلا زبائن ولا فواتير ولا كلمات سر.
          بعد النقل يعمل البرنامج مستقلاً على حاسوبك، وبياناته لا تصل للإنترنت.
        </Alert>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <Button icon="download" loading={busy} onClick={() => void saveData()}>تنزيل ملف بيانات متجري فقط</Button>
          <Button variant="ghost" icon="external" onClick={() => window.open(DESKTOP_URL, '_blank', 'noopener')}>فتح رابط البرنامج في نافذة جديدة</Button>
        </div>
      </div>
    </>
  );
}
