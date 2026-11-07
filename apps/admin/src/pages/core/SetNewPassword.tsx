/** بعد فتح رابط «نسيت كلمة السر» من البريد: كلمة سر جديدة ثم الدخول للوحة */
import { useState, type FormEvent } from 'react';
import { Alert, Button, Field, Input, Mark } from '../../ui';
import { useAuth } from '../../lib/auth';
import { supabase, errorMessage } from '../../lib/supabase';
import './login.css';

export default function SetNewPassword() {
  const { endRecovery, profile, signOut } = useAuth();
  const [pw1, setPw1] = useState('');
  const [pw2, setPw2] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (pw1.length < 8) { setError('كلمة السر ٨ أحرف على الأقل.'); return; }
    if (pw1 !== pw2) { setError('كلمتا السر غير متطابقتين.'); return; }
    if (!supabase) return;
    setBusy(true);
    const { error: err } = await supabase.auth.updateUser({ password: pw1 });
    setBusy(false);
    if (err) { setError(errorMessage(err)); return; }
    if (typeof history !== 'undefined') history.replaceState(null, '', location.pathname + location.search);
    endRecovery();
  };

  return (
    <div className="login-page">
      <main className="login-form" style={{ gridColumn: '1 / -1' }}>
        <form onSubmit={submit} className="col" style={{ gap: 14, width: 'min(420px, 100%)' }}>
          <Mark size={56} />
          <div>
            <h2 style={{ fontSize: 28 }}>كلمة سر جديدة</h2>
            <p className="dim">{profile?.email ? <>للحساب <b className="ltr">{profile.email}</b></> : 'اكتب كلمة السر الجديدة لحسابك.'}</p>
          </div>
          {error ? <Alert tone="danger">{error}</Alert> : null}
          <Field label="كلمة السر الجديدة" required><Input type="password" dir="ltr" autoFocus autoComplete="new-password" value={pw1} onChange={(e) => setPw1(e.target.value)} icon="lock" /></Field>
          <Field label="تأكيدها" required><Input type="password" dir="ltr" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} icon="lock" /></Field>
          <Button type="submit" variant="primary" size="lg" block loading={busy}>حفظ والدخول</Button>
          <Button variant="ghost" block onClick={() => { endRecovery(); void signOut(); }}>إلغاء</Button>
        </form>
      </main>
    </div>
  );
}
