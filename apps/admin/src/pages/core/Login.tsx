import { useEffect, useState, type FormEvent } from 'react';
import { Alert, Button, Field, Input, Mark } from '../../ui';
import { useAuth } from '../../lib/auth';
import { supabase, errorMessage } from '../../lib/supabase';
import { StoreSignupForm } from './StoreSignup';
import './login.css';

/**
 * دخول اللوحة: بريد أو رقم هاتف + كلمة سر (+ رمز التحقق بخطوتين إن فُعّل).
 * حسابات الموظفين يُنشئها صاحب المتجر من «الموظفون»، وصاحب متجر جديد يسجّل من «أنشئ متجرك».
 */
export default function Login({ denied }: { denied: boolean }) {
  const { signIn, signOut, reload, mfaPending } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [factorId, setFactorId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [forgot, setForgot] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  // «أنشئ متجرك» يظهر فقط إن كانت قاعدة البيانات تدعم تعدد المتاجر
  const [multiStore, setMultiStore] = useState(false);
  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    void supabase.rpc('current_store').then(({ error: e }) => { if (alive) setMultiStore(!e); });
    return () => { alive = false; };
  }, []);
  const platformLink = typeof location !== 'undefined' && /\/platform\/?$/.test(location.pathname);
  const [signup, setSignup] = useState(() => typeof location !== 'undefined' && /[?&]signup\b/.test(location.search));

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

  // «نسيت كلمة السر»: رابط لبريد الحساب يفتح اللوحة على شاشة كلمة سر جديدة
  const sendReset = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const em = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) { setError('اكتب البريد الإلكتروني للحساب (ليس رقم الهاتف).'); return; }
    if (!supabase) return;
    setBusy(true);
    // دالة الخادم ترسل الرابط لحساب صاحب رقيم فقط، وترفض أي بريد آخر
    const { error: err } = await supabase.functions.invoke('recover', { body: { email: em } });
    setBusy(false);
    if (err) {
      let msg = 'تعذّر إرسال الرابط، حاول بعد قليل.';
      try { const j = await (err as { context?: Response }).context?.json(); if (j?.error) msg = j.error; } catch { /* الرسالة الافتراضية */ }
      setError(msg);
      return;
    }
    setSent(em);
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
        {forgot && !factorId ? (
          <form onSubmit={sendReset} className="col" style={{ gap: 16, width: 'min(380px, 100%)' }}>
            <div className="only-mobile" style={{ marginBottom: 8 }}><Mark size={56} /></div>
            <div>
              <h2 style={{ fontSize: 28 }}>نسيت كلمة السر</h2>
              <p className="dim">لحساب صاحب رقيم فقط: اكتب بريدك وسنرسل لك رابطاً تضع منه كلمة سر جديدة. أصحاب المتاجر وموظفوهم: يعيد صاحب المتجر تعيين كلمة السر.</p>
            </div>
            {error ? <Alert tone="danger">{error}</Alert> : null}
            {sent ? (
              <Alert tone="success">أرسلنا الرابط إلى <b className="ltr">{sent}</b>. افتح بريدك (وتفقّد مجلد الرسائل غير المرغوبة Spam) واضغط الرابط خلال ساعة.</Alert>
            ) : (
              <Field label="البريد الإلكتروني"><Input type="email" dir="ltr" autoFocus required value={email} onChange={(e) => setEmail(e.target.value)} icon="user" placeholder="name@mail.com" /></Field>
            )}
            {!sent ? <Button type="submit" variant="primary" size="lg" block loading={busy}>إرسال رابط كلمة السر</Button> : null}
            <Button variant="ghost" block onClick={() => { setForgot(false); setSent(null); setError(null); }}>رجوع لتسجيل الدخول</Button>
          </form>
        ) : signup && multiStore && !factorId ? <StoreSignupForm onBack={() => setSignup(false)} /> : (
        <form onSubmit={submit} className="col" style={{ gap: 16, width: 'min(380px, 100%)' }}>
          <div className="only-mobile" style={{ marginBottom: 8 }}><Mark size={56} /></div>
          {!factorId && multiStore ? (
            <div className="seg-tabs" role="tablist" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, padding: 4, borderRadius: 14, background: 'var(--sunken)' }}>
              <button type="button" role="tab" aria-selected="true" className="btn" style={{ background: 'var(--card)', boxShadow: 'var(--shadow-float)' }}>تسجيل الدخول</button>
              <button type="button" role="tab" aria-selected="false" className="btn ghost" onClick={() => { setError(null); setSignup(true); }}>اشترك وأنشئ متجرك</button>
            </div>
          ) : null}
          <div>
            <h2 style={{ fontSize: 28 }}>{factorId ? 'رمز التحقق' : platformLink ? 'دخول إدارة رقيم' : 'تسجيل الدخول'}</h2>
            <p className="dim">{factorId ? 'افتح تطبيق المصادقة واكتب الرمز المكوّن من ٦ أرقام.'
              : platformLink ? 'لوحة صاحب رقيم: طلبات المتاجر الجديدة والمتاجر المشتركة.'
              : 'حساب واحد لكل شيء: صاحب رقيم، أصحاب المتاجر المشتركة، وموظفوهم. بعد الدخول تفتح لك لوحتك تلقائياً.'}</p>
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
              <Field label="البريد الإلكتروني أو رقم الهاتف">
                <Input autoComplete="username" dir="ltr" required value={email} onChange={(e) => setEmail(e.target.value)} icon="user" placeholder="name@mail.com أو 07XXXXXXXXX" />
              </Field>
              <Field label="كلمة السر">
                <Input type="password" autoComplete="current-password" dir="ltr" required value={password} onChange={(e) => setPassword(e.target.value)} icon="lock" />
              </Field>
            </>
          )}
          <Button type="submit" variant="primary" size="lg" block loading={busy}>{factorId ? 'تحقق' : 'دخول'}</Button>
          {factorId ? <Button variant="ghost" block onClick={() => { setFactorId(null); setCode(''); setError(null); void signOut(); }}>الخروج واستعمال حساب آخر</Button> : null}
          {!factorId ? (
            <button type="button" className="link-btn small" style={{ alignSelf: 'center' }} onClick={() => { setError(null); setSent(null); setForgot(true); }}>نسيت كلمة السر؟</button>
          ) : null}
          {!factorId && multiStore ? (
            <div className="card" style={{ padding: 14, textAlign: 'center' }}>
              <b>صاحب متجر وتريد لوحة لمتجرك؟</b>
              <div style={{ marginTop: 8 }}><Button variant="default" block onClick={() => { setError(null); setSignup(true); }}>أنشئ متجرك على رقيم</Button></div>
            </div>
          ) : null}
        </form>
        )}
      </main>
    </div>
  );
}
