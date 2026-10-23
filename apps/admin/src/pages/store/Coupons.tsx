/** الكوبونات: نسبة أو مبلغ أو توصيل مجاني، بحد أدنى وسقف وعدد استخدامات وفترة */
import { useState } from 'react';
import { COUPON_KIND, isoDay, startOfBaghdadDay, type Coupon, type CouponKind } from '@raqeem/shared';
import { Badge, Button, DataTable, Field, Input, Modal, MoneyInput, NumberInput, PageHeader, Select, Switch, askConfirm, type Column } from '../../ui';
import { useAction, useLoad } from '../../lib/hooks';
import { useFmt } from '../../lib/settings';
import { useMoney } from '../sales/components/common';
import { coupons, saveCoupon } from './api';
import '../sales/sales.css';

export default function Coupons() {
  const fmt = useFmt();
  const m = useMoney();
  const list = useLoad(coupons.list, []);
  const [edit, setEdit] = useState<Coupon | 'new' | null>(null);
  const now = new Date().toISOString();
  const state = (c: Coupon) => (!c.is_active ? { t: 'موقوف', tone: 'neutral' as const } : c.ends_at && c.ends_at < now ? { t: 'منتهٍ', tone: 'danger' as const } : c.usage_limit && c.used_count >= c.usage_limit ? { t: 'استُنفد', tone: 'warning' as const } : c.starts_at && c.starts_at > now ? { t: 'لم يبدأ', tone: 'info' as const } : { t: 'فعّال', tone: 'success' as const });
  const cols: Column<Coupon>[] = [
    { key: 'c', header: 'الرمز', primary: true, cell: (c) => <b className="ltr">{c.code}</b> },
    { key: 'k', header: 'الخصم', cell: (c) => (c.kind === 'percent' ? `${fmt.num(c.value)}٪${c.max_discount ? ` (حتى ${m(c.max_discount)})` : ''}` : c.kind === 'fixed' ? m(c.value) : COUPON_KIND.free_delivery.label) },
    { key: 'min', header: 'أقل طلب', hideOnMobile: true, cell: (c) => (c.min_subtotal ? m(c.min_subtotal) : '—') },
    { key: 'u', header: 'الاستخدام', end: true, cell: (c) => `${fmt.num(c.used_count)}${c.usage_limit ? ` / ${fmt.num(c.usage_limit)}` : ''}` },
    { key: 'e', header: 'ينتهي', hideOnMobile: true, cell: (c) => <span className="dim">{c.ends_at ? fmt.date(c.ends_at) : 'بلا نهاية'}</span> },
    { key: 's', header: 'الحالة', cell: (c) => { const s = state(c); return <Badge tone={s.tone}>{s.t}</Badge>; } },
  ];
  return (
    <>
      <PageHeader title="الكوبونات" description="رموز خصم يكتبها الزبون في السلة." actions={<Button variant="primary" icon="plus" onClick={() => setEdit('new')}>كوبون جديد</Button>} />
      <DataTable rows={list.data} columns={cols} rowKey={(c) => c.id} loading={list.loading} error={list.error} onRetry={list.reload} onRowClick={setEdit}
        empty={{ icon: 'ticket', title: 'لا كوبونات', text: 'مثل RAMADAN10 لخصم ١٠٪ على كل الطلبات.', action: <Button variant="primary" onClick={() => setEdit('new')}>كوبون جديد</Button> }} />
      {edit ? <CouponModal c={edit === 'new' ? null : edit} onClose={() => setEdit(null)} onDone={() => { setEdit(null); void list.reload(); }} /> : null}
    </>
  );
}

function CouponModal({ c, onClose, onDone }: { c: Coupon | null; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ code: c?.code ?? '', kind: c?.kind ?? ('percent' as CouponKind), value: c?.value ?? 10, min_subtotal: c?.min_subtotal ?? 0, max_discount: c?.max_discount ?? null, usage_limit: c?.usage_limit ?? null, per_customer_limit: (c ? c.per_customer_limit : 1) as number | null, starts_at: c?.starts_at ? isoDay(c.starts_at) : '', ends_at: c?.ends_at ? isoDay(c.ends_at) : '', is_active: c?.is_active ?? true });
  const save = useAction(() => saveCoupon({
    code: f.code, kind: f.kind, value: f.kind === 'free_delivery' ? 0 : f.value, min_subtotal: f.min_subtotal, max_discount: f.kind === 'percent' ? f.max_discount : null, usage_limit: f.usage_limit, per_customer_limit: f.per_customer_limit,
    // بتوقيت بغداد صراحةً: بداية اليوم ونهايته (slice على ISO بتوقيت UTC كان يُرجع البداية يوماً عند كل تعديل)
    starts_at: f.starts_at ? startOfBaghdadDay(`${f.starts_at}T12:00:00Z`).toISOString() : null, ends_at: f.ends_at ? new Date(startOfBaghdadDay(`${f.ends_at}T12:00:00Z`, 1).getTime() - 1000).toISOString() : null, is_active: f.is_active, ...(c ? {} : { used_count: 0 }),
  }, c?.id), { success: 'حُفظ الكوبون' });
  // remove تعيد void؛ نعيد true حتى نميّز النجاح من الفشل (undefined) فتُغلق النافذة وتُحدَّث القائمة
  const del = useAction(async () => { await coupons.remove(c!.id); return true; }, { success: 'حُذف الكوبون' });
  return (
    <Modal open onClose={onClose} title={c ? `الكوبون ${c.code}` : 'كوبون جديد'} width={560}
      footer={<>{c ? <Button variant="danger" icon="trash" onClick={async () => { if (await askConfirm({ title: 'حذف الكوبون؟', body: c.used_count ? 'استُخدم من قبل؛ الأفضل إيقافه بدل حذفه.' : undefined, danger: true, confirm: 'حذف' })) { if (await del.run()) onDone(); } }}>حذف</Button> : null}<span className="grow" /><Button onClick={onClose}>إلغاء</Button><Button variant="primary" loading={save.busy} onClick={async () => { if (await save.run()) onDone(); }}>حفظ الكوبون</Button></>}>
      <div className="form-grid">
        <Field label="الرمز" required hint="أحرف إنكليزية وأرقام"><Input dir="ltr" autoFocus value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} placeholder="EID20" /></Field>
        <Field label="النوع"><Select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as CouponKind })} options={(Object.keys(COUPON_KIND) as CouponKind[]).map((k) => ({ value: k, label: COUPON_KIND[k].label }))} /></Field>
        {f.kind === 'percent' ? <Field label="النسبة"><NumberInput value={f.value} onChange={(v) => setF({ ...f, value: v ?? 0 })} max={100} suffix="٪" /></Field> : null}
        {f.kind === 'fixed' ? <Field label="المبلغ"><MoneyInput value={f.value} onChange={(v) => setF({ ...f, value: v ?? 0 })} /></Field> : null}
        {f.kind === 'percent' ? <Field label="أقصى خصم (اختياري)"><MoneyInput value={f.max_discount} onChange={(v) => setF({ ...f, max_discount: v })} /></Field> : null}
        <Field label="أقل مجموع للطلب"><MoneyInput value={f.min_subtotal} onChange={(v) => setF({ ...f, min_subtotal: v ?? 0 })} /></Field>
        <Field label="عدد الاستخدامات الكلي" hint="فارغ = بلا حد"><NumberInput value={f.usage_limit} onChange={(v) => setF({ ...f, usage_limit: v })} /></Field>
        <Field label="لكل زبون"><NumberInput value={f.per_customer_limit} onChange={(v) => setF({ ...f, per_customer_limit: v })} /></Field>
        <Field label="يبدأ"><Input type="date" value={f.starts_at} onChange={(e) => setF({ ...f, starts_at: e.target.value })} /></Field>
        <Field label="ينتهي"><Input type="date" value={f.ends_at} onChange={(e) => setF({ ...f, ends_at: e.target.value })} /></Field>
      </div>
      <div style={{ marginTop: 12 }}><Switch label="فعّال" checked={f.is_active} onChange={(v) => setF({ ...f, is_active: v })} /></div>
    </Modal>
  );
}
