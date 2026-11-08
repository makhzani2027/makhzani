/**
 * نسخة الحاسوب — شاشة الحسابات (بدل الدخول أونلاين):
 *  • قائمة حسابات الشركات على هذا الحاسوب، كل حساب بكلمة سره وبياناته في مجلده الخاص.
 *  • «حساب شركة جديد»: الاسم والشعار وكلمة السر ← قاعدة بيانات جديدة جاهزة.
 *  • مجلد البيانات (D:\Raqeem مثلاً) قابل للتغيير.
 */
import { useEffect, useState, type FormEvent } from 'react';
import { Alert, Button, Field, Input, Loading, Mark } from '../../ui';
import { supabase } from '../../lib/supabase';
import { importStoreFile, readStoreFile, type StoreFile } from '../../lib/storeFile';
import './login.css';

interface Account { id: string; name: string; logo: boolean; created_at: string; last_opened_at: string | null }
interface LocalState { root: string; root_chosen?: boolean; accounts: Account[]; open: { id: string; name: string } | null }

async function api<T>(path: string, body?: unknown): Promise<T> {
  const r = await fetch(path, body === undefined ? undefined : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || j.message || 'حدث خطأ، حاول مجدداً.');
  return j as T;
}

const fileToB64 = (f: File) => new Promise<{ data: string; type: string }>((resolve, reject) => {
  const rd = new FileReader();
  rd.onload = () => resolve({ data: String(rd.result).split(',')[1] ?? '', type: f.type });
  rd.onerror = () => reject(new Error('تعذّرت قراءة الصورة.'));
  rd.readAsDataURL(f);
});

export default function LocalAccounts() {
  const [st, setSt] = useState<LocalState | null>(null);
  const [mode, setMode] = useState<'list' | 'create'>('list');
  const [pick, setPick] = useState<Account | null>(null);
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [pw1, setPw1] = useState('');
  const [pw2, setPw2] = useState('');
  const [logo, setLogo] = useState<File | null>(null);
  const [storeFile, setStoreFile] = useState<StoreFile | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const s = await api<LocalState>('/local/state');
    setSt(s);
    if (!s.accounts.length) setMode('create');
  };
  useEffect(() => { void load().catch((e) => setError(e.message)); }, []);

  const open = async (e: FormEvent) => {
    e.preventDefault();
    if (!pick || !supabase) return;
    setError(null); setBusy(true);
    try {
      const s = await api<{ access_token: string; refresh_token: string }>('/local/open', { id: pick.id, password });
      const { error: err } = await supabase.auth.setSession({ access_token: s.access_token, refresh_token: s.refresh_token });
      if (err) throw err;
    } catch (ex) { setError((ex as Error).message); } finally { setBusy(false); }
  };

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (name.trim().length < 2) { setError('اكتب اسم الشركة.'); return; }
    if (pw1.length < 4) { setError('كلمة السر ٤ أحرف على الأقل.'); return; }
    if (pw1 !== pw2) { setError('كلمتا السر غير متطابقتين.'); return; }
    if (!supabase) return;
    setBusy(true);
    try {
      const r = await api<{ id: string; name: string }>('/local/create', { name: name.trim(), password: pw1, logo: logo ? await fileToB64(logo) : null });
      const s = await api<{ access_token: string; refresh_token: string }>('/local/open', { id: r.id, password: pw1 });
      if (storeFile) {
        setProgress('جارٍ نقل المنتجات…');
        const res = await importStoreFile(storeFile, s.access_token, (d, t) => setProgress(`جارٍ نقل المنتجات: ${d} من ${t}`));
        if (res.failed.length) console.warn('منتجات لم تُنقل', res.failed);
        setProgress(null);
      }
      const { error: err } = await supabase.auth.setSession({ access_token: s.access_token, refresh_token: s.refresh_token });
      if (err) throw err;
    } catch (ex) { setError((ex as Error).message); setProgress(null); } finally { setBusy(false); }
  };

  const pickStoreFile = async (f: File | undefined) => {
    if (!f) return;
    setError(null);
    try {
      const j = await readStoreFile(f);
      setStoreFile(j);
      setName(j.store.name || name);
      if (j.store.logo?.data) {
        const bin = Uint8Array.from(atob(j.store.logo.data), (c) => c.charCodeAt(0));
        setLogo(new File([bin], 'logo', { type: j.store.logo.type || 'image/png' }));
      }
    } catch (ex) { setError((ex as Error).message); }
  };

  const confirmRoot = async () => {
    try { await api('/local/confirm-root', {}); await load(); } catch (ex) { setError((ex as Error).message); }
  };

  const chooseRoot = async () => {
    try { await api('/local/choose-root', {}); await load(); } catch (ex) { setError((ex as Error).message); }
  };

  if (!st) return error ? <div className="login-form"><Alert tone="danger">{error}</Alert></div> : <Loading />;
  const preview = logo ? URL.createObjectURL(logo) : null;
  return (
    <div className="login-page">
      <aside className="login-art" aria-hidden="true">
        <div className="login-art-inner">
          <Mark size={88} ink="#EDEEEC" hole="#E8622A" />
          <h1>رَقيم</h1>
          <p>نسخة الحاسوب — تعمل بلا إنترنت.</p>
        </div>
        <span className="login-foot">بياناتك محفوظة على هذا الحاسوب فقط: {st.root}</span>
      </aside>
      <main className="login-form">
        <div className="col" style={{ gap: 16, width: 'min(440px, 100%)' }}>
          <div className="only-mobile"><Mark size={56} /></div>
          {error ? <Alert tone="danger">{error}</Alert> : null}

          {!st.root_chosen && !st.accounts.length ? (
            <div className="col" style={{ gap: 14 }}>
              <div>
                <h2 style={{ fontSize: 28 }}>أين تُحفظ بياناتك؟</h2>
                <p className="dim">كل منتجاتك وفواتيرك ونسخك الاحتياطية تُحفظ في هذا المجلد على حاسوبك. اختر قرصاً غير قرص النظام (مثل D) ليبقى آمناً إن أُعيد تثبيت ويندوز.</p>
              </div>
              <div className="card" style={{ padding: 14 }}><span className="small dim">المكان المقترح</span><div className="ltr" style={{ fontWeight: 800, fontSize: 18, textAlign: 'start' }}>{st.root}</div></div>
              {/onedrive/i.test(st.root) ? <Alert tone="warning">هذا المكان داخل OneDrive، ومزامنته قد تُتلف قاعدة البيانات. اختر مكاناً خارجه مثل D:\Raqeem أو C:\Raqeem.</Alert> : null}
              <Button variant="primary" size="lg" block onClick={() => void confirmRoot()}>الحفظ هنا</Button>
              <Button block icon="edit" onClick={() => void chooseRoot()}>اختيار مكان آخر…</Button>
            </div>
          ) : mode === 'create' ? (
            <form onSubmit={create} className="col" style={{ gap: 14 }}>
              <div>
                <h2 style={{ fontSize: 28 }}>حساب شركة جديد</h2>
                <p className="dim">كل حساب منفصل تماماً: منتجاته وفواتيره وصوره في مجلده الخاص على هذا الحاسوب.</p>
              </div>
              <Field label="ملف بيانات متجري" hint="اختياري: الملف الذي نزل مع البرنامج من لوحة التحكم أونلاين — يملأ الاسم والشعار وينقل المنتجات والأسعار والكميات">
                <div className="row" style={{ gap: 12, alignItems: 'center' }}>
                  <label className="btn"><input type="file" accept=".json,application/json" hidden onChange={(e) => { void pickStoreFile(e.target.files?.[0]); e.target.value = ''; }} />{storeFile ? 'تغيير الملف' : 'اختيار الملف'}</label>
                  {storeFile ? <span className="small"><b>{storeFile.products.length}</b> منتج · <b>{storeFile.categories.length}</b> قسم</span> : null}
                  {storeFile ? <button type="button" className="link-btn small" onClick={() => setStoreFile(null)}>إلغاء</button> : null}
                </div>
              </Field>
              <Field label="اسم الشركة" required><Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="مركز الحلول الكهربائية" autoFocus /></Field>
              <Field label="الشعار" hint="يظهر في الفواتير وعروض الأسعار (اختياري)">
                <div className="row" style={{ gap: 12, alignItems: 'center' }}>
                  {preview ? <img src={preview} alt="" style={{ width: 56, height: 56, objectFit: 'contain', borderRadius: 12, border: '1px solid var(--line)', background: '#fff' }} /> : null}
                  <label className="btn"><input type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { setLogo(e.target.files?.[0] ?? null); e.target.value = ''; }} />{logo ? 'تغيير الشعار' : 'اختيار الشعار'}</label>
                </div>
              </Field>
              <div className="form-grid">
                <Field label="كلمة السر" required><Input type="password" dir="ltr" value={pw1} onChange={(e) => setPw1(e.target.value)} autoComplete="new-password" /></Field>
                <Field label="تأكيدها" required><Input type="password" dir="ltr" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" /></Field>
              </div>
              <Alert tone="info">احفظ كلمة السر جيداً: لا يمكن استرجاعها، وهي تحمي بيانات شركتك على هذا الحاسوب.</Alert>
              <Button type="submit" variant="primary" size="lg" block loading={busy}>{busy ? progress ?? 'جارٍ تجهيز قاعدة البيانات…' : 'إنشاء الحساب'}</Button>
              {st.accounts.length ? <Button variant="ghost" block onClick={() => { setMode('list'); setError(null); }}>رجوع لقائمة الحسابات</Button> : null}
            </form>
          ) : pick ? (
            <form onSubmit={open} className="col" style={{ gap: 14 }}>
              <div className="row" style={{ gap: 12, alignItems: 'center' }}>
                {pick.logo ? <img src={`/local/logo/${pick.id}`} alt="" style={{ width: 56, height: 56, objectFit: 'contain', borderRadius: 12, background: '#fff', border: '1px solid var(--line)' }} /> : <Mark size={48} />}
                <div><h2 style={{ fontSize: 24 }}>{pick.name}</h2><p className="dim small">اكتب كلمة سر الحساب</p></div>
              </div>
              <Field label="كلمة السر"><Input type="password" dir="ltr" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus autoComplete="current-password" icon="lock" /></Field>
              <Button type="submit" variant="primary" size="lg" block loading={busy}>دخول</Button>
              <Button variant="ghost" block onClick={() => { setPick(null); setPassword(''); setError(null); }}>حساب آخر</Button>
            </form>
          ) : (
            <div className="col" style={{ gap: 14 }}>
              <div>
                <h2 style={{ fontSize: 28 }}>اختر حساب الشركة</h2>
                <p className="dim">الحسابات المحفوظة على هذا الحاسوب.</p>
              </div>
              <div className="col" style={{ gap: 8 }}>
                {st.accounts.map((a) => (
                  <button key={a.id} type="button" className="card" onClick={() => { setPick(a); setError(null); }}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, textAlign: 'start', cursor: 'pointer', font: 'inherit', color: 'inherit' }}>
                    {a.logo ? <img src={`/local/logo/${a.id}`} alt="" style={{ width: 44, height: 44, objectFit: 'contain', borderRadius: 10, background: '#fff' }} />
                      : <span style={{ width: 44, height: 44, borderRadius: 10, display: 'grid', placeItems: 'center', background: 'var(--accent-soft)', color: 'var(--accent-soft-ink)', fontWeight: 900, fontSize: 20 }}>{a.name.slice(0, 1)}</span>}
                    <b className="grow truncate">{a.name}</b>
                  </button>
                ))}
              </div>
              <Button variant="primary" icon="plus" block onClick={() => { setMode('create'); setError(null); }}>حساب شركة جديد</Button>
            </div>
          )}
          <div className="small faint" style={{ marginTop: 8 }}>
            {/onedrive/i.test(st.root) ? <Alert tone="warning">مجلد البيانات داخل OneDrive، ومزامنته قد تُتلف قاعدة البيانات وتمنع تشغيلها. انقل المجلد إلى مكان خارجه (مثل D:\Raqeem) ثم اختره من «تغيير».</Alert> : null}
            مجلد البيانات: <span className="ltr">{st.root}</span>{' '}
            <button type="button" className="link-btn small" onClick={() => void chooseRoot()}>تغيير</button>
          </div>
        </div>
      </main>
    </div>
  );
}
