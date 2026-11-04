/** متاجر المنصة — لمدير المنصة فقط: طلبات المتاجر الجديدة، الموافقة والرفض والإيقاف وإعادة التفعيل */
import { useMemo, useState } from 'react';
import { governorateName, type Store, type StoreStatus } from '@raqeem/shared';
import { Alert, Badge, Button, Card, EmptyState, ErrorState, Loading, PageHeader, Tabs, askConfirm, askText } from '../../ui';
import { useAction, useLoad } from '../../lib/hooks';
import { useFmt } from '../../lib/settings';
import { imgUrl } from '../../lib/media';
import { sb } from '../../lib/supabase';
import { IS_DEMO } from '../../lib/env';

type Row = Store & { owner_name: string | null; owner_email: string | null; products: number; invoices: number; staff: number };
const STATUS: Record<StoreStatus, { label: string; tone: 'warning' | 'success' | 'danger' | 'neutral' }> = {
  pending: { label: 'بانتظار الموافقة', tone: 'warning' },
  active: { label: 'فعّال', tone: 'success' },
  suspended: { label: 'موقوف', tone: 'danger' },
  rejected: { label: 'مرفوض', tone: 'neutral' },
};
const SITE = 'https://raqeem-iq.web.app';
const MAIN = '00000000-0000-4000-a000-000000000001';

export default function Platform() {
  const fmt = useFmt();
  const list = useLoad(async () => {
    if (IS_DEMO) return [] as Row[];
    const { data, error } = await sb().rpc('platform_stores');
    if (error) throw error;
    return (data ?? []) as Row[];
  }, []);
  const [tab, setTab] = useState<StoreStatus | 'all'>('pending');
  const rows = useMemo(() => (list.data ?? []).filter((r) => tab === 'all' || r.status === tab), [list.data, tab]);
  const count = (s: StoreStatus) => (list.data ?? []).filter((r) => r.status === s).length;
  const act = useAction(async (a: { id: string; status: StoreStatus; note?: string | null }) => {
    const { error } = await sb().rpc('set_store_status', { id: a.id, status: a.status, note: a.note ?? null });
    if (error) throw error;
    await list.reload();
  }, { success: 'حُدّثت حالة المتجر' });

  const approve = async (r: Row) => {
    if (await askConfirm({ title: `تفعيل «${r.name}»؟`, body: 'يُجهَّز المتجر فوراً (مخزن رئيسي، صناديق، أدوار الموظفين، الإعدادات) ويدخل صاحبه لوحته.', confirm: 'تفعيل المتجر' })) void act.run({ id: r.id, status: 'active' });
  };
  const reject = async (r: Row) => {
    const note = await askText({ title: `رفض طلب «${r.name}»`, label: 'السبب (يظهر لصاحب الطلب)', placeholder: 'مثلاً: بيانات الشركة غير مكتملة' });
    if (note !== null) void act.run({ id: r.id, status: 'rejected', note });
  };
  const suspend = async (r: Row) => {
    const note = await askText({ title: `إيقاف «${r.name}»`, label: 'السبب (يظهر لصاحب المتجر)', placeholder: 'مثلاً: انتهى الاشتراك' });
    if (note !== null) void act.run({ id: r.id, status: 'suspended', note });
  };

  if (list.error) return <ErrorState message={list.error} onRetry={list.reload} />;
  return (
    <>
      <PageHeader title="متاجر المنصة" description="طلبات أصحاب المتاجر الجدد والمتاجر العاملة. كل متجر منفصل تماماً ببياناته ولوحته." />
      <Tabs value={tab} onChange={setTab} items={[
        { value: 'pending' as const, label: `بانتظار الموافقة${count('pending') ? ` (${fmt.num(count('pending'))})` : ''}` },
        { value: 'active' as const, label: 'الفعّالة' },
        { value: 'suspended' as const, label: 'الموقوفة' },
        { value: 'rejected' as const, label: 'المرفوضة' },
        { value: 'all' as const, label: 'الكل' },
      ]} />
      {!list.data ? <Loading /> : !rows.length ? (
        <EmptyState icon="store" title={tab === 'pending' ? 'لا طلبات جديدة' : 'لا متاجر هنا'} text={tab === 'pending' ? 'رابط التسجيل لأصحاب المتاجر: صفحة الدخول ← «أنشئ متجرك».' : undefined} />
      ) : (
        <div className="stack">
          {tab === 'pending' ? <Alert tone="info">رابط التسجيل الذي ترسله لأصحاب المتاجر: <b className="ltr">{SITE}/dashboard/?signup</b></Alert> : null}
          {rows.map((r) => (
            <Card key={r.id}>
              <div className="row" style={{ gap: 14, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                {r.logo_key ? <img src={imgUrl(r.logo_key, 'sm') ?? ''} alt="" style={{ width: 56, height: 56, objectFit: 'contain', borderRadius: 12, background: '#fff', border: '1px solid var(--line)' }} />
                  : <div style={{ width: 56, height: 56, borderRadius: 12, background: 'var(--soft)', display: 'grid', placeItems: 'center', fontWeight: 900, fontSize: 22 }}>{r.name.slice(0, 1)}</div>}
                <div className="grow" style={{ minWidth: 220 }}>
                  <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <b style={{ fontSize: 17 }}>{r.name}</b>
                    <Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge>
                    {r.id === MAIN ? <Badge tone="neutral">المتجر الرئيسي</Badge> : null}
                  </div>
                  <div className="small dim ltr" style={{ textAlign: 'start' }}>{SITE}/s/{r.slug}</div>
                  <div className="small" style={{ marginTop: 6 }}>
                    صاحبه: <b>{r.owner_name ?? '—'}</b>{r.owner_email ? <> · <span className="ltr">{r.owner_email}</span></> : null}{r.phone ? <> · <span className="ltr">{r.phone}</span></> : null}
                    {r.governorate ? <> · {governorateName(r.governorate)}</> : null}
                  </div>
                  <div className="small dim">طلب في {fmt.date(r.created_at)}{r.approved_at ? ` · فُعّل في ${fmt.date(r.approved_at)}` : ''} · {fmt.num(r.products)} منتج · {fmt.num(r.invoices)} فاتورة · {fmt.num(r.staff)} مستخدم</div>
                  {r.note ? <div className="small" style={{ marginTop: 4 }}>ملاحظة: {r.note}</div> : null}
                </div>
                {r.id !== MAIN ? (
                  <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                    {r.status !== 'active' ? <Button variant="primary" icon="checkCircle" loading={act.busy} onClick={() => void approve(r)}>{r.status === 'suspended' ? 'إعادة التفعيل' : 'موافقة وتفعيل'}</Button> : null}
                    {r.status === 'pending' ? <Button icon="xCircle" disabled={act.busy} onClick={() => void reject(r)}>رفض</Button> : null}
                    {r.status === 'active' ? <Button icon="lock" disabled={act.busy} onClick={() => void suspend(r)}>إيقاف</Button> : null}
                  </div>
                ) : null}
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
