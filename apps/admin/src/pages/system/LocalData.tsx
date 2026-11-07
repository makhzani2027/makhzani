/** نسخة الحاسوب — البيانات والنسخ الاحتياطي: مكان الحفظ، نسخة الآن، فتح مجلد النسخ */
import { useState } from 'react';
import { Alert, Button, Card, PageHeader, toast } from '../../ui';
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
  return (
    <>
      <PageHeader title="البيانات والنسخ الاحتياطي" description="نسخة الحاسوب: كل بيانات شركتك محفوظة على هذا الجهاز فقط." />
      <div className="stack" style={{ maxWidth: 760 }}>
        <Card title="مكان البيانات" icon="warehouse">
          <p>حساب: <b>{state.data?.open?.name ?? '—'}</b></p>
          <p className="small dim">المجلد: <span className="ltr">{state.data?.root ?? '…'}</span></p>
          <div className="sx-row" style={{ marginTop: 10 }}>
            <Button icon="external" onClick={() => void post('/local/open-folder', { which: 'root' })}>فتح مجلد البيانات</Button>
          </div>
        </Card>
        <Card title="النسخ الاحتياطي" icon="shield">
          <p className="dim">تُحفظ نسخة تلقائياً كل يوم عند فتح الحساب (آخر ١٤ نسخة). انسخ مجلد النسخ إلى فلاشة أو قرص آخر من حين لآخر، فلو تعطّل الحاسوب تبقى بياناتك.</p>
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
