import { useEffect, useState, type FormEvent } from 'react';
import { Alert, Button, Field, Input, Mark } from '../../ui';
import { useAuth } from '../../lib/auth';
import { supabase, errorMessage } from '../../lib/supabase';
import './login.css';

/**
 * دخول الموظفين: بريد + كلمة سر (+ رمز التحقق بخطوتين إن فعّله الموظف).
 * الحسابات يُنشئها صاحب المتجر من «الموظفون» — لا تسجيل ذاتي.
 */
export default function Login({ denied }: { denied: boolean }) {
  const { signIn, signOut, reload, mfaPending } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [factorId, setFactorId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // جلسة بكلمة السر فقط لحساب مفعّل فيه التحقق بخطوتين (بعد الدخول أو عند إعادة فتح اللوحة): نطلب الرمز
  useEffect(() => {
    if (!mfaPending || factorId || !supabase) return;
    let alive = true;
    void supabase.auth.mfa.listFactors().then(({ data }) => {
      const totp = data?.totp?.find((x) => x.status === 'verified');
      if (alive && totp) setFactorId(totp.id);
    });
    return () => { alive = false; };
  }, [mfaPending, factorId]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (factorId && supabase) {
        const { error: err } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: code.trim() });
        if (err) throw err;
        await reload();
        return;
      }
      const err = await signIn(email, password);
      if (err) { setError(err); return; }
      // التحقق بخطوتين: إن كان للحساب عامل مفعّل نطلب الرمز
      if (supabase) {
        const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
        if (data && data.nextLevel === 'aal2' && data.currentLevel !== 'aal2') {
          const { data: f } = await supabase.auth.mfa.listFactors();
          const totp = f?.totp?.find((x) => x.status === 'verified');
          if (totp) { setFactorId(totp.id); return; }
        }
      }
    } catch (ex) {
      setError(errorMessage(ex));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-page">
      <aside className="login-art" aria-hidden="true">
        <div className="login-art-inner">
          <Mark size={88} ink="#EDEEEC" hole="#E8622A" />
          <h1>رَقيم</h1>
          <p>كلُّ قطعةٍ مرقومة.</p>
        </div>
        <span className="login-foot">قبل خمسة آلاف عام، في أوروك، سُجّل أول مخزون في التاريخ على لوح من طين.</span>
      </aside>
      <main className="login-form">
        <form onSubmit={submit} className="col" style={{ gap: 16, width: 'min(380px, 100%)' }}>
          <div className="only-mobile" style={{ marginBottom: 8 }}><Mark size={56} /></div>
          <div>
            <h2 style={{ fontSize: 28 }}>{factorId ? 'رمز التحقق' : 'تسجيل الدخول'}</h2>
            <p className="dim">{factorId ? 'افتح تطبيق المصادقة واكتب الرمز المكوّن من ٦ أرقام.' : 'لوحة إدارة المتجر والمخزون — للموظفين فقط.'}</p>
          </div>
          {denied ? (
            <Alert tone="warning">هذا الحساب ليس حساب موظف فعّال. اطلب من صاحب المتجر إضافتك أو تفعيلك.
              <div style={{ marginTop: 8 }}><Button size="sm" onClick={() => void signOut()}>الخروج وتجربة حساب آخر</Button></div>
            </Alert>
          ) : null}
          {error ? <Alert tone="danger">{error}</Alert> : null}
          {factorId ? (
            <Field label="الرمز">
              <Input autoFocus inputMode="numeric" autoComplete="one-time-code" className="num" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
            </Field>
          ) : (
            <>
              <Field label="البريد الإلكتروني">
                <Input type="email" autoComplete="username" dir="ltr" required value={email} onChange={(e) => setEmail(e.target.value)} icon="mail" />
              </Field>
              <Field label="كلمة السر">
                <Input type="password" autoComplete="current-password" dir="ltr" required value={password} onChange={(e) => setPassword(e.target.value)} icon="lock" />
              </Field>
            </>
          )}
          <Button type="submit" variant="primary" size="lg" block loading={busy}>{factorId ? 'تحقق' : 'دخول'}</Button>
          {factorId ? <Button variant="ghost" block onClick={() => { setFactorId(null); setCode(''); setError(null); void signOut(); }}>الخروج واستعمال حساب آخر</Button> : null}
          <p className="small faint">نسيت كلمة السر؟ اطلب من صاحب المتجر إعادة تعيينها من صفحة الموظفين.</p>
        </form>
      </main>
    </div>
  );
}
