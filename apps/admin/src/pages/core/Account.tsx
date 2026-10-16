import { useEffect, useState } from 'react';
import { Alert, Badge, Button, Card, Field, Input, PageHeader, Segmented, toast } from '../../ui';
import { useAuth } from '../../lib/auth';
import { IS_DEMO } from '../../lib/env';
import { supabase, errorMessage } from '../../lib/supabase';
import { useThemePref, type ThemePref } from '../../lib/theme';

/** حسابي: الاسم، كلمة السر، التحقق بخطوتين (TOTP)، المظهر */
export default function Account() {
  const { profile, isOwner, role, reload } = useAuth();
  const [name, setName] = useState(profile?.full_name ?? '');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [theme, setTheme] = useThemePref();
  const [busy, setBusy] = useState<string | null>(null);
  const [mfa, setMfa] = useState<{ id: string; status: string }[]>([]);
  const [enroll, setEnroll] = useState<{ id: string; qr: string; secret: string } | null>(null);
  const [code, setCode] = useState('');

  const loadMfa = async () => {
    if (!supabase) return;
    const { data } = await supabase.auth.mfa.listFactors();
    setMfa((data?.totp ?? []).map((f) => ({ id: f.id, status: f.status })));
  };
  useEffect(() => { void loadMfa(); }, []);

  const saveName = async () => {
    if (!supabase || !profile) return;
    setBusy('name');
    const { error } = await supabase.from('profiles').update({ full_name: name.trim() }).eq('id', profile.id);
    setBusy(null);
    if (error) toast.error(errorMessage(error)); else { toast.success('تم حفظ الاسم'); void reload(); }
  };
  const savePw = async () => {
    if (!supabase) return;
    if (pw.length < 10) return toast.error('كلمة السر يجب ألا تقل عن ١٠ أحرف.');
    if (pw !== pw2) return toast.error('كلمتا السر غير متطابقتين.');
    setBusy('pw');
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(null);
    if (error) toast.error(errorMessage(error)); else { toast.success('تم تغيير كلمة السر'); setPw(''); setPw2(''); }
  };
  const startEnroll = async () => {
    if (!supabase) return;
    setBusy('mfa');
    const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: `رقيم ${new Date().toISOString().slice(0, 10)}` });
    setBusy(null);
    if (error || !data) return toast.error(errorMessage(error));
    setEnroll({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
  };
  const verifyEnroll = async () => {
    if (!supabase || !enroll) return;
    setBusy('verify');
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: enroll.id, code: code.trim() });
    setBusy(null);
    if (error) return toast.error('الرمز غير صحيح. تأكد من وقت الهاتف وحاول مجدداً.');
    toast.success('تم تفعيل التحقق بخطوتين');
    setEnroll(null); setCode(''); void loadMfa();
  };
  const removeFactor = async (id: string) => {
    if (!supabase) return;
    const { error } = await supabase.auth.mfa.unenroll({ factorId: id });
    if (error) toast.error(errorMessage(error)); else { toast.success('تم إيقاف التحقق بخطوتين'); void loadMfa(); }
  };
  const verified = mfa.filter((f) => f.status === 'verified');

  return (
    <>
      <PageHeader title="حسابي" description={`${profile?.email ?? ''} · ${isOwner ? 'صاحب المتجر' : role?.name ?? 'موظف'}`} />
      {IS_DEMO ? <Alert>في وضع العرض لا تُحفظ تغييرات الحساب.</Alert> : null}
      <div className="grid-2">
        <Card title="الاسم" icon="user">
          <div className="col">
            <Field label="الاسم الظاهر في الفواتير والسجل"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
            <div><Button variant="primary" loading={busy === 'name'} disabled={IS_DEMO || !name.trim()} onClick={saveName}>حفظ</Button></div>
          </div>
        </Card>
        <Card title="المظهر" icon="sun">
          <Segmented<ThemePref> value={theme} onChange={setTheme} label="المظهر" options={[{ value: 'auto', label: 'تلقائي' }, { value: 'light', label: 'فاتح' }, { value: 'dark', label: 'غامق' }]} />
          <p className="small faint" style={{ marginTop: 10 }}>«تلقائي» يتبع إعداد جهازك.</p>
        </Card>
        <Card title="كلمة السر" icon="lock">
          <div className="col">
            <Field label="كلمة السر الجديدة" hint="١٠ أحرف على الأقل"><Input type="password" dir="ltr" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
            <Field label="أعد كتابتها"><Input type="password" dir="ltr" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} /></Field>
            <div><Button variant="primary" loading={busy === 'pw'} disabled={IS_DEMO || !pw} onClick={savePw}>تغيير كلمة السر</Button></div>
          </div>
        </Card>
        <Card title="التحقق بخطوتين" icon="shield" actions={verified.length ? <Badge tone="success">مفعّل</Badge> : <Badge>غير مفعّل</Badge>}>
          <div className="col">
            <p className="dim small">عند الدخول يُطلب رمز من تطبيق مصادقة على هاتفك (Google Authenticator أو Microsoft Authenticator). ننصح به بشدة لصاحب المتجر.</p>
            {verified.map((f) => <div key={f.id} className="row between"><span>تطبيق المصادقة</span><Button size="sm" variant="danger" onClick={() => void removeFactor(f.id)}>إيقاف</Button></div>)}
            {!verified.length && !enroll ? <div><Button icon="shield" loading={busy === 'mfa'} disabled={IS_DEMO} onClick={startEnroll}>تفعيل</Button></div> : null}
            {enroll ? (
              <div className="col">
                <p className="small">١. امسح الرمز بتطبيق المصادقة:</p>
                <img src={enroll.qr} alt="رمز التفعيل" width={168} height={168} style={{ background: '#fff', borderRadius: 12, padding: 8 }} />
                <p className="small faint">أو اكتب المفتاح يدوياً: <span className="code">{enroll.secret}</span></p>
                <Field label="٢. اكتب الرمز الظاهر في التطبيق"><Input inputMode="numeric" className="num" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} /></Field>
                <div className="row"><Button variant="primary" loading={busy === 'verify'} disabled={code.length !== 6} onClick={verifyEnroll}>تأكيد</Button><Button variant="ghost" onClick={() => setEnroll(null)}>إلغاء</Button></div>
              </div>
            ) : null}
          </div>
        </Card>
      </div>
    </>
  );
}
