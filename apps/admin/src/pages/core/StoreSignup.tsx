/**
 * تعدد المتاجر — شاشات ما قبل اللوحة:
 *  • StoreSignupForm: «أنشئ متجرك» — حساب (اسم، هاتف، بريد، كلمة سر) + بيانات الشركة (الاسم، الرابط، المحافظة، الشعار).
 *    إن طلب Supabase تأكيد البريد تُحفظ بيانات المتجر محلياً وتُكمل بعد أول دخول.
 *  • StoreGate: مستخدم مسجّل بلا لوحة — طلب بانتظار الموافقة، مرفوض (يعدّل ويعيد الإرسال)، موقوف،
 *    أو حساب بلا متجر (يُكمل إنشاء متجره).
 */
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { GOVERNORATES, isValidIraqiPhone } from '@raqeem/shared';
import { Alert, Button, Field, Input, Mark, Select } from '../../ui';
import { useAuth } from '../../lib/auth';
import { imgUrl, uploadImage } from '../../lib/media';
import { supabase, errorMessage } from '../../lib/supabase';
import './login.css';

const DRAFT_KEY = 'rq.storeSignup';
const SITE = 'https://raqeem-iq.web.app';

interface StoreDraft { full_name: string; company: string; slug: string; phone: string; governorate: string }
const emptyDraft: StoreDraft = { full_name: '', company: '', slug: '', phone: '', governorate: 'baghdad' };

function readDraft(): StoreDraft {
  try { return { ...emptyDraft, ...(JSON.parse(localStorage.getItem(DRAFT_KEY) ?? '{}') as Partial<StoreDraft>) }; } catch { return emptyDraft; }
}
function saveDraft(d: StoreDraft) { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(d)); } catch { /* */ } }
function clearDraft() { try { localStorage.removeItem(DRAFT_KEY); } catch { /* */ } }

const cleanSlug = (t: string) => t.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/-{2,}/g, '-').replace(/^-+/, '').slice(0, 40);
const slugError = (s: string) => (!s ? 'اكتب رابط المتجر' : !/^[a-z0-9]([a-z0-9-]{1,38})[a-z0-9]$/.test(s) ? 'أحرف إنجليزية صغيرة وأرقام وشرطة، ٣ أحرف على الأقل' : null);

/** حقول بيانات الشركة (مشتركة بين التسجيل وإكمال/تعديل الطلب) */
function CompanyFields({ d, set, logo, setLogo, logoUrl }: {
  d: StoreDraft; set: (p: Partial<StoreDraft>) => void; logo: File | null; setLogo: (f: File | null) => void; logoUrl?: string | null;
}) {
  const preview = useMemo(() => (logo ? URL.createObjectURL(logo) : logoUrl ?? null), [logo, logoUrl]);
  return (
    <>
      <Field label="اسم الشركة أو المتجر" required>
        <Input value={d.company} onChange={(e) => set({ company: e.target.value })} maxLength={80} placeholder="مركز الحلول الكهربائية" />
      </Field>
      <Field label="رابط المتجر" required hint={<span className="ltr">{SITE}/s/{d.slug || 'your-store'}</span>} error={d.slug ? slugError(d.slug) : null}>
        <Input dir="ltr" value={d.slug} onChange={(e) => set({ slug: cleanSlug(e.target.value) })} placeholder="alhulool" maxLength={40} />
      </Field>
      <Field label="محافظة المتجر">
        <Select value={d.governorate} onChange={(e) => set({ governorate: e.target.value })} options={GOVERNORATES.map((g) => ({ value: g.key, label: g.name }))} />
      </Field>
      <Field label="شعار الشركة" hint="صورة مربعة واضحة (اختياري، يمكن إضافته لاحقاً)">
        <div className="row" style={{ gap: 12, alignItems: 'center' }}>
          {preview ? <img src={preview} alt="" style={{ width: 56, height: 56, objectFit: 'contain', borderRadius: 12, border: '1px solid var(--line)', background: '#fff' }} /> : null}
          <label className="btn"><input type="file" accept="image/*" hidden onChange={(e) => { setLogo(e.target.files?.[0] ?? null); e.target.value = ''; }} />{preview ? 'تغيير الشعار' : 'رفع الشعار'}</label>
          {logo ? <Button variant="ghost" size="sm" onClick={() => setLogo(null)}>إزالة</Button> : null}
        </div>
      </Field>
    </>
  );
}

/** يرسل طلب المتجر (بعد وجود جلسة) */
async function submitStore(d: StoreDraft, logo: File | null, uid: string, existingLogo?: string | null): Promise<void> {
  if (!supabase) return;
  let logoKey = existingLogo ?? null;
  if (logo) logoKey = await uploadImage(logo, 'stores', uid);
  const { error } = await supabase.rpc('request_store', { p: { name: d.company.trim(), slug: d.slug, phone: d.phone, governorate: d.governorate, logo_key: logoKey, full_name: d.full_name.trim() || null } });
  if (error) throw error;
  clearDraft();
}

// ---------------------------------------------------------------- إنشاء حساب ومتجر
export function StoreSignupForm({ onBack }: { onBack: () => void }) {
  const { reload } = useAuth();
  const [d, setD] = useState<StoreDraft>(readDraft);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [logo, setLogo] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checkEmail, setCheckEmail] = useState(false);
  const set = (p: Partial<StoreDraft>) => setD((x) => ({ ...x, ...p }));

  const problem = !d.full_name.trim() ? 'اكتب اسمك.' : !isValidIraqiPhone(d.phone) ? 'اكتب رقم هاتف عراقي صحيح، مثل 07701234567.'
    : !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim()) ? 'اكتب بريداً إلكترونياً صحيحاً.' : password.length < 8 ? 'كلمة السر ٨ أحرف على الأقل.'
    : password !== password2 ? 'كلمتا السر غير متطابقتين.' : d.company.trim().length < 2 ? 'اكتب اسم الشركة.' : slugError(d.slug);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (problem) { setError(problem); return; }
    if (!supabase) return;
    setBusy(true);
    try {
      saveDraft(d);
      const { data, error: err } = await supabase.auth.signUp({ email: email.trim().toLowerCase(), password, options: { data: { full_name: d.full_name.trim() } } });
      if (err) throw err;
      if (!data.session || !data.user) { setCheckEmail(true); return; }
      await submitStore(d, logo, data.user.id);
      await reload();
    } catch (ex) {
      const msg = errorMessage(ex);
      setError(/already|registered|exists/i.test(msg) ? 'هذا البريد مسجّل مسبقاً. سجّل الدخول به لإكمال طلب متجرك.' : msg);
    } finally {
      setBusy(false);
    }
  };

  if (checkEmail) {
    return (
      <div className="col" style={{ gap: 16, width: 'min(420px, 100%)' }}>
        <h2 style={{ fontSize: 26 }}>أكّد بريدك الإلكتروني</h2>
        <Alert tone="info">أرسلنا رابط تأكيد إلى <b className="ltr">{email}</b>. افتح الرابط ثم ارجع وسجّل الدخول، وسيكتمل طلب متجرك تلقائياً ببياناتك نفسها.</Alert>
        <Button variant="primary" block onClick={onBack}>العودة لتسجيل الدخول</Button>
      </div>
    );
  }
  return (
    <form onSubmit={submit} className="col" style={{ gap: 14, width: 'min(440px, 100%)' }}>
      <div role="tablist" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, padding: 4, borderRadius: 14, background: 'var(--sunken)' }}>
        <button type="button" role="tab" aria-selected="false" className="btn ghost" onClick={onBack}>تسجيل الدخول</button>
        <button type="button" role="tab" aria-selected="true" className="btn" style={{ background: 'var(--card)', boxShadow: 'var(--shadow-float)' }}>اشترك وأنشئ متجرك</button>
      </div>
      <div>
        <h2 style={{ fontSize: 28 }}>أنشئ متجرك على رقيم</h2>
        <p className="dim">لوحة كاملة لمتجرك: البيع والمخزون وعروض الأسعار والفواتير، منفصلة تماماً عن أي متجر آخر. يُفعَّل المتجر بعد مراجعة الطلب.</p>
      </div>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <div className="section-title">صاحب المتجر</div>
      <Field label="الاسم الكامل" required><Input value={d.full_name} onChange={(e) => set({ full_name: e.target.value })} autoComplete="name" /></Field>
      <Field label="رقم الهاتف" required hint="تستطيع الدخول به لاحقاً بدل البريد"><Input dir="ltr" inputMode="tel" value={d.phone} onChange={(e) => set({ phone: e.target.value })} placeholder="07XX XXX XXXX" autoComplete="tel" /></Field>
      <Field label="البريد الإلكتروني" required><Input type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" icon="mail" /></Field>
      <div className="form-grid">
        <Field label="كلمة السر" required><Input type="password" dir="ltr" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" icon="lock" /></Field>
        <Field label="تأكيدها" required><Input type="password" dir="ltr" value={password2} onChange={(e) => setPassword2(e.target.value)} autoComplete="new-password" /></Field>
      </div>
      <div className="section-title">الشركة</div>
      <CompanyFields d={d} set={set} logo={logo} setLogo={setLogo} />
      <Button type="submit" variant="primary" size="lg" block loading={busy}>إنشاء الحساب وإرسال الطلب</Button>
      <Button variant="ghost" block onClick={onBack}>لديّ حساب — تسجيل الدخول</Button>
    </form>
  );
}

// ---------------------------------------------------------------- مستخدم مسجّل بلا لوحة
export function StoreGate() {
  const { store, profile, session, signOut, reload } = useAuth();
  const owner = !!store?.is_owner && store.id !== '00000000-0000-4000-a000-000000000001';
  const status = owner ? store!.status : profile?.kind === 'staff' && store && store.status !== 'active' ? store.status : null;
  const [editing, setEditing] = useState(false);
  const [d, setD] = useState<StoreDraft>(() => {
    const draft = readDraft();
    return owner && store
      ? { ...draft, company: store.name, slug: store.slug, phone: (store.phone ?? '').replace(/^\+964/, '0'), governorate: store.governorate ?? draft.governorate, full_name: profile?.full_name ?? draft.full_name }
      : { ...draft, full_name: draft.full_name || profile?.full_name || '', phone: draft.phone || (profile?.phone ?? '').replace(/^\+964/, '0') };
  });
  const [logo, setLogo] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (p: Partial<StoreDraft>) => setD((x) => ({ ...x, ...p }));
  // تحديث الحالة كل دقيقة أثناء الانتظار (الموافقة تظهر دون إعادة تحميل)
  useEffect(() => {
    if (status !== 'pending') return;
    const t = setInterval(() => void reload(), 60_000);
    return () => clearInterval(t);
  }, [status, reload]);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const problem = !d.full_name.trim() ? 'اكتب اسمك.' : !isValidIraqiPhone(d.phone) ? 'اكتب رقم هاتف عراقي صحيح.' : d.company.trim().length < 2 ? 'اكتب اسم الشركة.' : slugError(d.slug);
    if (problem) { setError(problem); return; }
    setBusy(true);
    try {
      await submitStore(d, logo, session!.user.id, owner ? store?.logo_key : null);
      setEditing(false);
      await reload();
    } catch (ex) { setError(errorMessage(ex)); } finally { setBusy(false); }
  };

  const form = (title: string, intro: string) => (
    <form onSubmit={send} className="col" style={{ gap: 14, width: 'min(440px, 100%)' }}>
      <div><h2 style={{ fontSize: 26 }}>{title}</h2><p className="dim">{intro}</p></div>
      {error ? <Alert tone="danger">{error}</Alert> : null}
      <Field label="اسمك" required><Input value={d.full_name} onChange={(e) => set({ full_name: e.target.value })} /></Field>
      <Field label="رقم الهاتف" required><Input dir="ltr" inputMode="tel" value={d.phone} onChange={(e) => set({ phone: e.target.value })} placeholder="07XX XXX XXXX" /></Field>
      <CompanyFields d={d} set={set} logo={logo} setLogo={setLogo} logoUrl={owner ? imgUrl(store?.logo_key ?? null, 'sm') : null} />
      <Button type="submit" variant="primary" size="lg" block loading={busy}>إرسال الطلب</Button>
      <Button variant="ghost" block onClick={() => (editing ? setEditing(false) : void signOut())}>{editing ? 'إلغاء' : 'تسجيل الخروج'}</Button>
    </form>
  );

  let body;
  if (status === 'pending' && !editing) {
    body = (
      <div className="col" style={{ gap: 16, width: 'min(440px, 100%)' }}>
        {store?.logo_key ? <img src={imgUrl(store.logo_key, 'sm') ?? ''} alt="" style={{ width: 72, height: 72, objectFit: 'contain', borderRadius: 16, background: '#fff', border: '1px solid var(--line)' }} /> : <Mark size={56} />}
        <h2 style={{ fontSize: 26 }}>طلبك قيد المراجعة</h2>
        <p className="dim">استلمنا طلب متجر «<b>{store?.name}</b>». سنراجعه ونفعّله قريباً، وتفتح لوحة متجرك هنا مباشرة بعد الموافقة.</p>
        <Alert tone="info">رابط متجرك بعد التفعيل: <b className="ltr">{SITE}/s/{store?.slug}</b></Alert>
        <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
          <Button onClick={() => void reload()}>تحديث الحالة</Button>
          <Button variant="ghost" onClick={() => setEditing(true)}>تعديل بيانات الطلب</Button>
          <Button variant="ghost" onClick={() => void signOut()}>تسجيل الخروج</Button>
        </div>
      </div>
    );
  } else if (status === 'pending' || status === 'rejected') {
    body = form(status === 'rejected' ? 'لم تتم الموافقة على الطلب' : 'تعديل طلب المتجر',
      status === 'rejected' ? `${store?.note ? `السبب: ${store.note}. ` : ''}عدّل البيانات وأعد إرسال الطلب.` : 'عدّل البيانات ثم أعد الإرسال.');
  } else if (status === 'suspended') {
    body = (
      <div className="col" style={{ gap: 16, width: 'min(440px, 100%)' }}>
        <Mark size={56} />
        <h2 style={{ fontSize: 26 }}>المتجر موقوف مؤقتاً</h2>
        <p className="dim">لوحة متجر «{store?.name}» متوقفة حالياً{store?.note ? `: ${store.note}` : ''}. تواصل مع إدارة رقيم لإعادة التفعيل.</p>
        <Button variant="ghost" onClick={() => void signOut()}>تسجيل الخروج</Button>
      </div>
    );
  } else if (profile?.kind === 'staff' && profile.status !== 'active') {
    body = (
      <div className="col" style={{ gap: 16, width: 'min(440px, 100%)' }}>
        <Alert tone="warning">هذا الحساب موقوف. اطلب من صاحب المتجر تفعيله.</Alert>
        <Button onClick={() => void signOut()}>الخروج وتجربة حساب آخر</Button>
      </div>
    );
  } else if (!store) {
    // قاعدة بيانات بلا تعدد المتاجر بعد
    body = (
      <div className="col" style={{ gap: 16, width: 'min(440px, 100%)' }}>
        <Alert tone="warning">هذا الحساب ليس حساب موظف فعّال. اطلب من صاحب المتجر إضافتك أو تفعيلك.</Alert>
        <Button onClick={() => void signOut()}>الخروج وتجربة حساب آخر</Button>
      </div>
    );
  } else {
    body = form('أكمل إنشاء متجرك', 'حسابك جاهز. أكمل بيانات شركتك لإرسال طلب المتجر.');
  }
  return (
    <div className="login-page">
      <aside className="login-art" aria-hidden="true">
        <div className="login-art-inner">
          <Mark size={88} ink="#EDEEEC" hole="#E8622A" />
          <h1>رَقيم</h1>
          <p>متجرك، بلوحته الخاصة.</p>
        </div>
      </aside>
      <main className="login-form">{body}</main>
    </div>
  );
}
