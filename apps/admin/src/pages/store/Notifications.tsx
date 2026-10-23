/** الإشعارات: حملة لكل زبائن التطبيق بعنوان ونص وصورة ورابط، مع معاينة كما تظهر على الهاتف ثم send_campaign */
import { useState } from 'react';
import { BANNER_LINK_KIND, type BannerLinkKind, type NotificationCampaign } from '@raqeem/shared';
import { Alert, Badge, Button, Card, DataTable, Field, Input, Mark, PageHeader, Select, Textarea, askConfirm, toast, type Column } from '../../ui';
import { useAction, useLoad } from '../../lib/hooks';
import { useFmt, useSettings } from '../../lib/settings';
import { imgUrl, uploadImage } from '../../lib/media';
import { errorMessage } from '../../lib/supabase';
import { campaigns, sendCampaign } from './api';
import '../sales/sales.css';

export default function Notifications() {
  const fmt = useFmt();
  const { store } = useSettings();
  const list = useLoad(campaigns.list, []);
  const [f, setF] = useState({ title: '', body: '', image_key: null as string | null, link_kind: 'none' as BannerLinkKind, link_value: '' });
  const [up, setUp] = useState(false);
  const save = useAction(() => campaigns.save({ title: f.title.trim(), body: f.body.trim() || null, image_key: f.image_key, link_kind: f.link_kind, link_value: f.link_kind === 'none' ? null : f.link_value || null, sent_at: null }), { success: 'حُفظت الحملة كمسودة' });
  const send = useAction(async (c: NotificationCampaign) => {
    if (!(await askConfirm({ title: 'إرسال الإشعار لكل الزبائن؟', body: `«${c.title}» — لا يمكن التراجع بعد الإرسال.`, confirm: 'إرسال الآن' }))) return null;
    const r = await sendCampaign(c.id);
    toast.success(`أُرسل إلى ${fmt.num(r.recipients)} زبون`);
    await list.reload();
    return r;
  });
  const cols: Column<NotificationCampaign>[] = [
    { key: 't', header: 'الحملة', primary: true, cell: (c) => <div><b>{c.title}</b>{c.body ? <div className="small faint truncate" style={{ maxWidth: 380 }} title={c.body}>{c.body}</div> : null}</div> },
    { key: 'd', header: 'أُنشئت', hideOnMobile: true, cell: (c) => <span className="dim">{fmt.date(c.created_at)}</span> },
    { key: 's', header: 'الحالة', cell: (c) => (c.sent_at ? <Badge tone="success">أُرسلت {fmt.ago(c.sent_at)}</Badge> : <Badge>مسودة</Badge>) },
    { key: 'a', header: '', shrink: true, cell: (c) => (!c.sent_at ? <Button size="sm" variant="primary" icon="megaphone" loading={send.busy} onClick={(e) => { e.stopPropagation(); void send.run(c); }}>إرسال</Button> : null) },
  ];
  const valid = f.title.trim().length >= 3;
  return (
    <>
      <PageHeader title="الإشعارات" description="أرسل عرضاً أو خبراً لكل من ثبّت التطبيق." />
      <div className="sx-split">
        <Card title="حملة جديدة" icon="megaphone">
          <div className="stack">
            <Field label="العنوان" required><Input value={f.title} maxLength={60} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="وصلت سماعات جديدة" /></Field>
            <Field label="النص" hint={`${fmt.num(f.body.length)} / ١٧٨`}><Textarea rows={3} maxLength={178} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} placeholder="خصم ١٥٪ لأول ٥٠ طلب، اليوم فقط." /></Field>
            <div className="sx-row">
              <label className="btn"><input type="file" accept="image/*" hidden onChange={async (e) => { const file = e.target.files?.[0]; if (!file) return; setUp(true); try { setF({ ...f, image_key: await uploadImage(file, 'campaigns', 'all') }); } catch (err) { toast.error(errorMessage(err)); } finally { setUp(false); } }} />{up ? 'جارٍ الرفع…' : f.image_key ? 'تغيير الصورة' : 'صورة (اختياري)'}</label>
              {f.image_key ? <Button variant="ghost" onClick={() => setF({ ...f, image_key: null })}>إزالة الصورة</Button> : null}
            </div>
            <div className="form-grid">
              <Field label="عند الضغط يفتح"><Select value={f.link_kind} onChange={(e) => setF({ ...f, link_kind: e.target.value as BannerLinkKind })} options={(Object.keys(BANNER_LINK_KIND) as BannerLinkKind[]).map((k) => ({ value: k, label: BANNER_LINK_KIND[k].label }))} /></Field>
              {f.link_kind !== 'none' ? <Field label="الوجهة" hint="معرّف المنتج/القسم أو كلمة البحث أو الرابط"><Input dir="ltr" value={f.link_value} onChange={(e) => setF({ ...f, link_value: e.target.value })} /></Field> : null}
            </div>
            <span className="section-title">المعاينة</span>
            <div className="notif-preview">
              <Mark size={34} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="sx-between"><b style={{ fontSize: 13 }}>{store.name}</b><span className="sx-muted">الآن</span></div>
                <b style={{ display: 'block' }}>{f.title || 'عنوان الإشعار'}</b>
                <span className="sx-muted">{f.body || 'نص الإشعار يظهر هنا.'}</span>
                {f.image_key ? <img src={imgUrl(f.image_key, 'md') ?? ''} alt="" style={{ width: '100%', borderRadius: 10, marginTop: 6 }} /> : null}
              </div>
            </div>
            <Alert tone="info">يصل لكل زبون نشط في التطبيق، ويظهر في صندوق إشعاراته.</Alert>
            <div className="sx-row">
              <Button disabled={!valid} loading={save.busy} onClick={async () => { if (await save.run()) { setF({ title: '', body: '', image_key: null, link_kind: 'none', link_value: '' }); void list.reload(); } }}>حفظ كمسودة</Button>
              <Button variant="primary" icon="megaphone" disabled={!valid} loading={save.busy || send.busy} onClick={async () => { const c = await save.run(); if (c) { setF({ title: '', body: '', image_key: null, link_kind: 'none', link_value: '' }); if (!(await send.run(c))) void list.reload(); } }}>حفظ وإرسال</Button>
            </div>
          </div>
        </Card>
        <div className="sx-stack">
          <h2 className="section-title">الحملات السابقة</h2>
          <DataTable rows={list.data} columns={cols} rowKey={(c) => c.id} loading={list.loading} error={list.error} onRetry={list.reload} empty={{ icon: 'bell', title: 'لا حملات بعد' }} />
        </div>
      </div>
    </>
  );
}
