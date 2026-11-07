/** تنزيل «رقيم لسطح المكتب» (ويندوز، يعمل بلا إنترنت) — لأصحاب المتاجر وموظفيهم في اللوحة أونلاين */
import { Alert, Button, Card, Icon, PageHeader } from '../../ui';

export const DESKTOP_URL = 'https://github.com/makhzani2027/raqeem-app/releases/download/desktop/Raqeem-Setup.exe';

const STEPS = [
  'اضغط «تنزيل البرنامج» واحفظ الملف Raqeem-Setup.exe.',
  'افتح الملف. إن ظهر «Windows protected your PC» اضغط More info ثم Run anyway (البرنامج جديد وغير موقّع بشهادة مدفوعة).',
  'اختر مكان التثبيت ثم «تثبيت»، وافتح «رقيم» من سطح المكتب.',
  'أنشئ حساب شركتك: الاسم والشعار وكلمة سر. تُحفظ بياناتك في D:\\Raqeem (أو «المستندات» إن لم يوجد القرص D).',
  'أضف منتجاتك وابدأ البيع والعروض والفواتير، كلها بلا إنترنت.',
];

export default function DesktopApp() {
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
            <a className="btn primary lg" href={DESKTOP_URL} rel="noopener"><Icon name="download" size={18} />تنزيل البرنامج</a>
          </div>
        </Card>
        <Card title="خطوات التثبيت" icon="list">
          <ol style={{ margin: 0, paddingInlineStart: 22, display: 'flex', flexDirection: 'column', gap: 10, lineHeight: 1.8 }}>
            {STEPS.map((s) => <li key={s}>{s}</li>)}
          </ol>
        </Card>
        <Alert tone="info">
          برنامج الحاسوب مستقل عن حسابك هنا على الإنترنت: تبدأ فيه بحساب شركة جديد على حاسوبك، وبياناته لا تصل للإنترنت.
          ربط الاثنين (نقل المنتجات والتزامن) ميزة قادمة.
        </Alert>
        <div><Button variant="ghost" icon="external" onClick={() => window.open(DESKTOP_URL, '_blank', 'noopener')}>فتح رابط التنزيل في نافذة جديدة</Button></div>
      </div>
    </>
  );
}
