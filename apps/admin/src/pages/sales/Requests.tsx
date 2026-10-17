/** طلبات التوفير: ما طلبه الزبائن وغير موجود. مراجعة ← جاري توفيره ← صار متوفراً (مع ربط المنتج) أو غير ممكن */
import { useEffect, useState } from 'react';
import { REQUEST_STATUS, formatPhone, whatsappLink, type RequestStatus } from '@raqeem/shared';
import { Badge, Button, DataTable, Drawer, Field, Input, PageHeader, SearchInput, Tabs, Textarea, Thumb, type Column } from '../../ui';
import { useAuth } from '../../lib/auth';
import { useAction, useDebounced, useLoad } from '../../lib/hooks';
import { useFmt } from '../../lib/settings';
import { useCounts } from '../../lib/counts';
import { listRequests, requestImageUrl, searchProducts, setRequestStatus, type ProductLite, type RequestRow } from './api';
import { useMoney } from './components/common';
import './sales.css';

const FLOW: Partial<Record<RequestStatus, RequestStatus[]>> = {
  new: ['reviewing', 'sourcing', 'available', 'rejected'],
  reviewing: ['sourcing', 'available', 'rejected'],
  sourcing: ['available', 'rejected'],
  available: ['fulfilled'],
};

export default function Requests() {
  const fmt = useFmt();
  const m = useMoney();
  const { can } = useAuth();
  const counts = useCounts();
  const [tab, setTab] = useState<RequestStatus | 'open' | 'all'>('open');
  const [q, setQ] = useState('');
  const dq = useDebounced(q, 250);
  const list = useLoad(() => listRequests(tab, dq), [tab, dq]);
  const [sel, setSel] = useState<RequestRow | null>(null);

  const columns: Column<RequestRow>[] = [
    { key: 't', header: 'المطلوب', primary: true, cell: (r) => <div><b>{r.title}</b>{r.details ? <div className="small faint truncate" style={{ maxWidth: 360 }}>{r.details}</div> : null}</div> },
    { key: 'c', header: 'الزبون', cell: (r) => <div>{r.customer_name ?? '—'}<div className="small faint ltr" style={{ textAlign: 'start' }}>{r.customer_phone ? formatPhone(r.customer_phone) : ''}</div></div> },
    { key: 'q', header: 'الكمية', end: true, hideOnMobile: true, cell: (r) => fmt.qty(r.qty) },
    { key: 'b', header: 'الميزانية', end: true, hideOnMobile: true, cell: (r) => (r.budget ? m(r.budget) : '—') },
    { key: 's', header: 'الحالة', cell: (r) => <Badge tone={REQUEST_STATUS[r.status].tone}>{REQUEST_STATUS[r.status].label}</Badge> },
    { key: 'd', header: 'منذ', hideOnMobile: true, cell: (r) => <span className="dim">{fmt.ago(r.created_at)}</span> },
  ];
  return (
    <>
      <PageHeader title="طلبات التوفير" description="منتجات طلبها الزبائن من التطبيق وغير موجودة لديك — فرصة بيع لا تفوّتها." />
      <Tabs value={tab} onChange={setTab} items={[{ value: 'open', label: 'المفتوحة' }, { value: 'new', label: 'جديدة' }, { value: 'sourcing', label: 'جاري توفيرها' }, { value: 'available', label: 'صارت متوفرة' }, { value: 'all', label: 'الكل' }]} />
      <DataTable rows={list.data} columns={columns} rowKey={(r) => r.id} loading={list.loading} error={list.error} onRetry={list.reload} onRowClick={setSel}
        toolbar={<div className="sx-filters"><div className="grow"><SearchInput value={q} onChange={setQ} placeholder="اسم المنتج أو الزبون…" /></div></div>}
        empty={{ icon: 'request', title: 'لا طلبات هنا', text: 'حين يطلب زبون منتجاً غير موجود يظهر طلبه هنا.' }} />
      {sel ? <RequestDrawer r={sel} canEdit={can('requests.manage')} onClose={() => setSel(null)} onSaved={() => { setSel(null); void list.reload(); void counts.refresh(); }} /> : null}
    </>
  );
}

function RequestDrawer({ r, canEdit, onClose, onSaved }: { r: RequestRow; canEdit: boolean; onClose: () => void; onSaved: () => void }) {
  const fmt = useFmt();
  const m = useMoney();
  const [reply, setReply] = useState(r.staff_reply ?? '');
  const [img, setImg] = useState<string | null>(null);
  const [pq, setPq] = useState('');
  const dpq = useDebounced(pq, 200);
  const [product, setProduct] = useState<ProductLite | null>(r.product_id ? { id: r.product_id, name: r.product_name ?? 'المنتج', cover_key: null, price: null, sku: null } : null);
  const hits = useLoad(() => (dpq.trim().length > 1 ? searchProducts(dpq) : Promise.resolve([])), [dpq]);
  useEffect(() => { void requestImageUrl(r.image_key).then(setImg).catch(() => undefined); }, [r.image_key]);
  const save = useAction(async (s: RequestStatus) => { await setRequestStatus(r.id, s, reply.trim() || null, s === 'available' ? product?.id ?? null : r.product_id); return true; }, { success: 'حُدّث الطلب وأُبلغ الزبون' });
  const wa = whatsappLink(r.customer_phone, `مرحباً ${r.customer_name ?? ''}، بخصوص طلبك «${r.title}»: ${reply || REQUEST_STATUS[r.status].label}`);
  const next = FLOW[r.status] ?? [];
  return (
    <Drawer open onClose={onClose} title={<span>طلب <span className="ltr">{r.number}</span></span>} width={480}
      footer={canEdit && next.length ? <div className="sx-row">{next.map((s) => <Button key={s} variant={s === 'available' ? 'primary' : s === 'rejected' ? 'danger' : 'default'} loading={save.busy} disabled={s === 'available' && !product} onClick={async () => { if (await save.run(s)) onSaved(); }}>{REQUEST_STATUS[s].label}</Button>)}</div> : undefined}>
      <div className="stack">
        <div><Badge tone={REQUEST_STATUS[r.status].tone}>{REQUEST_STATUS[r.status].label}</Badge> <span className="sx-muted">{fmt.date(r.created_at, true)}</span></div>
        <h3 style={{ margin: 0 }}>{r.title}</h3>
        {r.details ? <p className="sx-pre">{r.details}</p> : null}
        {img ? <img src={img} alt="صورة أرفقها الزبون" style={{ maxWidth: '100%', borderRadius: 12 }} /> : null}
        <dl className="kv">
          <dt>الزبون</dt><dd>{r.customer_name ?? '—'} {r.customer_phone ? <span className="ltr dim">{formatPhone(r.customer_phone)}</span> : null}</dd>
          <dt>الكمية</dt><dd>{fmt.qty(r.qty)}</dd>
          {r.budget ? <><dt>الميزانية</dt><dd>{m(r.budget)}</dd></> : null}
          {r.link_url ? <><dt>رابط</dt><dd><a href={r.link_url} target="_blank" rel="noreferrer noopener" className="ltr truncate" style={{ display: 'block' }}>{r.link_url}</a></dd></> : null}
        </dl>
        {canEdit ? (
          <>
            <Field label="ردّك للزبون" hint="يصله إشعاراً في التطبيق مع تغيير الحالة"><Textarea rows={3} value={reply} onChange={(e) => setReply(e.target.value)} placeholder="وفّرناه لك، تجده الآن في المتجر." /></Field>
            {next.includes('available') ? (
              <Field label="المنتج في المتجر" hint="مطلوب عند «صار متوفراً» حتى يفتحه الزبون مباشرة">
                {product ? <div className="sx-between"><b>{product.name}</b><Button size="sm" variant="ghost" onClick={() => setProduct(null)}>تغيير</Button></div> : (
                  <>
                    <Input icon="search" value={pq} onChange={(e) => setPq(e.target.value)} placeholder="ابحث عن المنتج…" />
                    <div className="list">{(hits.data ?? []).map((p) => <button key={p.id} type="button" className="list-item sx-alert-row" style={{ background: 'transparent' }} onClick={() => setProduct(p)}><Thumb imageKey={p.cover_key} size="sm" /><span className="grow">{p.name}</span>{p.price ? <span className="dim">{m(p.price)}</span> : null}</button>)}</div>
                  </>
                )}
              </Field>
            ) : null}
            {wa ? <Button icon="whatsapp" onClick={() => window.open(wa, '_blank', 'noopener')}>مراسلة الزبون</Button> : null}
          </>
        ) : r.staff_reply ? <p className="sx-pre">{r.staff_reply}</p> : null}
      </div>
    </Drawer>
  );
}
