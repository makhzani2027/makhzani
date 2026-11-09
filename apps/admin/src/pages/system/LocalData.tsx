/** نسخة الحاسوب — البيانات والنسخ الاحتياطي: مكان الحفظ، نسخة الآن، فتح مجلد النسخ */
import { useState } from 'react';
import { Alert, Button, Card, Input, PageHeader, toast } from '../../ui';
import { CAN_FETCH_ONLINE, fetchOnlineStore, importStoreFile } from '../../lib/storeFile';
import { useLoad } from '../../lib/hooks';
import { supabase } from '../../lib/supabase';
import { LOCAL_VERSION } from '../../lib/env';

async function post<T>(path: string, body: unknown = {}): Promise<T> {
  const token = (await supabase?.auth.getSession())?.data.session?.access_token;
  const r = await fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || j.message || 'حدث خطأ.');
  return j as T;
}

export default function LocalData() {
  const state = useLoad(async () => (await fetch('/local/state')).json() as Promise<{ root: string; open: { id: string; name: string } | null }>, []);
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<string | null>(null);
  const backup = async () => {
    setBusy(true);
    try { const r = await post<{ file: string }>('/local/backup'); setLast(r.file); toast.success('حُفظت نسخة احتياطية'); } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  // جلب المنتجات من رقيم أونلاين إلى هذا الحساب (الموجود منها بنفس الرمز SKU لا يتكرر)
  const [oid, setOid] = useState('');
  const [opw, setOpw] = useState('');
  const [pulling, setPulling] = useState<string | null>(null);
  const [pullResult, setPullResult] = useState<string | null>(null);
  const pull = async () => {
    if (!oid.trim() || !opw) { toast.error('اكتب بريد أو هاتف حسابك أونلاين وكلمة السر.'); return; }
    setPullResult(null);
    try {
      setPulling('جارٍ الاتصال برقيم أونلاين…');
      const f = await fetchOnlineStore(oid, opw);
      setOpw('');
      const token = (await supabase?.auth.getSession())?.data.session?.access_token ?? '';
      const r = await importStoreFile(f, token, (d, t) => setPulling(`جارٍ النقل: ${d} من ${t}`));
      const dup = r.failed.filter((x) => /sku|barcode|duplicate|unique|مستعمل|موجود/i.test(x)).length;
      setPullResult(`نُقل ${r.ok} منتج من «${f.store.name}»${dup ? `، و${dup} موجود مسبقاً لم يتكرر` : ''}${r.failed.length - dup > 0 ? `، وتعذّر ${r.failed.length - dup}: ${r.failed.filter((x) => !/sku|barcode|duplicate|unique|مستعمل|موجود/i.test(x)).slice(0, 3).join('، ')}` : ''}.`);
      toast.success('انتهى نقل المنتجات');
    } catch (e) { toast.error((e as Error).message); } finally { setPulling(null); }
  };
  return (
    <>
      <PageHeader title="البيانات والنسخ الاحتياطي" description="نسخة الحاسوب: كل بيانات شركتك محفوظة على هذا الجهاز فقط." />
      <div className="stack" style={{ maxWidth: 760 }}>
        {CAN_FETCH_ONLINE ? (
          <Card title="جلب منتجاتي من رقيم أونلاين" icon="download">
            <p className="small dim">أضفت منتجاتك على رقيم أونلاين؟ ادخل بحسابك هناك مرة واحدة (يحتاج إنترنت الآن فقط)، فتُنقل المنتجات والأقسام والعلامات والأسعار والكميات إلى هذا الحساب. المنتجات الموجودة هنا بنفس الرمز لا تتكرر.</p>
            <div className="form-grid" style={{ marginTop: 10 }}>
              <Input dir="ltr" value={oid} onChange={(e) => setOid(e.target.value)} placeholder="البريد أو رقم الهاتف" autoComplete="username" />
              <Input type="password" dir="ltr" value={opw} onChange={(e) => setOpw(e.target.value)} placeholder="كلمة سر رقيم أونلاين" autoComplete="current-password" />
            </div>
            <div style={{ marginTop: 10 }}><Button variant="primary" icon="download" loading={!!pulling} onClick={() => void pull()}>{pulling ?? 'جلب المنتجات'}</Button></div>
            {pullResult ? <Alert tone="success">{pullResult}</Alert> : null}
          </Card>
        ) : null}
        <Card title="مكان البيانات" icon="warehouse">
          <p>حساب: <b>{state.data?.open?.name ?? '—'}</b></p>
          <p className="small dim">المجلد: <span className="ltr">{state.data?.root ?? '…'}</span></p>
          <div className="sx-row" style={{ marginTop: 10 }}>
            <Button icon="external" onClick={() => void post('/local/open-folder', { which: 'root' })}>فتح مجلد البيانات</Button>
          </div>
        </Card>
        <Card title="النسخ الاحتياطي" icon="shield">
          <p className="dim">تُحفظ نسخة تلقائياً كل يوم عند فتح الحساب (آخر ٧ نسخ)، وزر «نسخة احتياطية الآن» يوقف البرنامج ثوانٍ قليلة أثناء النسخ. انسخ مجلد النسخ إلى فلاشة أو قرص آخر من حين لآخر، فلو تعطّل الحاسوب تبقى بياناتك.</p>
          {last ? <Alert tone="success">حُفظت النسخة: <span className="ltr">{last}</span></Alert> : null}
          <div className="sx-row" style={{ marginTop: 10 }}>
            <Button variant="primary" icon="download" loading={busy} onClick={() => void backup()}>نسخة احتياطية الآن</Button>
            <Button icon="external" onClick={() => void post('/local/open-folder', { which: 'backups' })}>فتح مجلد النسخ</Button>
          </div>
        </Card>
        <p className="small faint">رقيم لسطح المكتب {LOCAL_VERSION}</p>
      </div>
    </>
  );
}
