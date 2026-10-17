/** التوصيل والدفع: أجرة كل محافظة ومدتها، وطرق الدفع في التطبيق والحد الأدنى والتوصيل المجاني */
import { useEffect, useState } from 'react';
import { GOVERNORATES, governorateName, type CheckoutSettings, type DeliveryZone } from '@raqeem/shared';
import { Alert, Button, Card, DataTable, Field, Input, Modal, MoneyInput, PageHeader, Select, Switch, Textarea, askConfirm, type Column } from '../../ui';
import { useAction, useLoad } from '../../lib/hooks';
import { useSettings } from '../../lib/settings';
import { getSetting, saveSetting } from '../sales/data/app-settings';
import { useMoney } from '../sales/components/common';
import { zones } from './api';
import '../sales/sales.css';

export default function Delivery() {
  const m = useMoney();
  const { reload } = useSettings();
  const list = useLoad(zones.list, []);
  const cfg = useLoad(() => getSetting('checkout', true), []);
  const [f, setF] = useState<CheckoutSettings | null>(null);
  const [edit, setEdit] = useState<DeliveryZone | 'new' | null>(null);
  useEffect(() => { if (cfg.data) setF(cfg.data); }, [cfg.data]);
  const save = useAction(async () => { await saveSetting('checkout', f!); reload(); }, { success: 'حُفظت إعدادات الدفع' });
  const cols: Column<DeliveryZone>[] = [
    { key: 'g', header: 'المحافظة', primary: true, cell: (z) => <b>{governorateName(z.governorate)}</b> },
    { key: 'f', header: 'الأجرة', end: true, cell: (z) => (z.fee ? m(z.fee) : 'مجاني') },
    { key: 'e', header: 'المدة', cell: (z) => <span className="dim">{z.eta_text ?? '—'}</span> },
    { key: 'a', header: 'الحالة', cell: (z) => (z.is_active ? 'متاح' : <span className="faint">متوقف</span>) },
  ];
  const missing = GOVERNORATES.filter((g) => !(list.data ?? []).some((z) => z.governorate === g.key));
  return (
    <>
      <PageHeader title="التوصيل والدفع" description="أين توصّل وبكم، وكيف يدفع الزبون في التطبيق." actions={<Button variant="primary" icon="plus" disabled={!missing.length} onClick={() => setEdit('new')}>إضافة محافظة</Button>} />
      <div className="sx-split">
        <DataTable rows={list.data} columns={cols} rowKey={(z) => z.id} loading={list.loading} error={list.error} onRetry={list.reload} onRowClick={setEdit}
          empty={{ icon: 'truck', title: 'لا مناطق توصيل', text: 'أضف المحافظات التي توصّل إليها وأجرة كل منها.' }} />
        <Card title="الدفع في التطبيق" icon="card">
          {!f ? null : (
            <div className="stack">
              <Switch label="الدفع عند الاستلام" checked={f.cod_enabled} onChange={(v) => setF({ ...f, cod_enabled: v })} />
              <Switch label="الدفع في المكتب" checked={f.office_enabled} onChange={(v) => setF({ ...f, office_enabled: v })} />
              {f.office_enabled ? <Field label="تعليمات الدفع في المكتب"><Textarea rows={2} value={f.office_instructions ?? ''} onChange={(e) => setF({ ...f, office_instructions: e.target.value || null })} /></Field> : null}
              <Switch label="الدفع الإلكتروني" hint="بطاقة/زين كاش عبر بوابة الدفع" checked={f.online_enabled} onChange={(v) => setF({ ...f, online_enabled: v })} />
              {f.online_enabled ? <Alert tone="info">يحتاج ربط بوابة الدفع (Wayl) من إعدادات الخادم.</Alert> : null}
              <Switch label="الاستلام من المحل" checked={f.pickup_enabled} onChange={(v) => setF({ ...f, pickup_enabled: v })} />
              <Field label="أقل مبلغ للطلب"><MoneyInput value={f.min_order_total} onChange={(v) => setF({ ...f, min_order_total: v ?? 0 })} /></Field>
              <Field label="توصيل مجاني فوق" hint="فارغ = لا يوجد"><MoneyInput value={f.free_delivery_over} onChange={(v) => setF({ ...f, free_delivery_over: v })} /></Field>
              <Button variant="primary" loading={save.busy} onClick={() => void save.run()}>حفظ الإعدادات</Button>
            </div>
          )}
        </Card>
      </div>
      {edit ? <ZoneModal z={edit === 'new' ? null : edit} options={edit === 'new' ? missing : GOVERNORATES.filter((g) => g.key === (edit as DeliveryZone).governorate)} next={(list.data?.length ?? 0) + 1} onClose={() => setEdit(null)} onDone={() => { setEdit(null); void list.reload(); }} />
        : null}
    </>
  );
}

function ZoneModal({ z, options, next, onClose, onDone }: { z: DeliveryZone | null; options: readonly { key: string; name: string }[]; next: number; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ governorate: z?.governorate ?? options[0]?.key ?? '', fee: z?.fee ?? 5000, eta_text: z?.eta_text ?? '', is_active: z?.is_active ?? true });
  const save = useAction(() => zones.save({ governorate: f.governorate, fee: f.fee, eta_text: f.eta_text || null, is_active: f.is_active, ...(z ? {} : { sort: next }) }, z?.id), { success: 'حُفظت المنطقة' });
  const del = useAction(() => zones.remove(z!.id), { success: 'حُذفت المنطقة' });
  return (
    <Modal open onClose={onClose} title={z ? governorateName(z.governorate) : 'محافظة جديدة'} width={440}
      footer={<>{z ? <Button variant="danger" icon="trash" onClick={async () => { if (await askConfirm({ title: 'حذف المنطقة؟', danger: true, confirm: 'حذف' })) { await del.run(); onDone(); } }}>حذف</Button> : null}<span className="grow" /><Button onClick={onClose}>إلغاء</Button><Button variant="primary" loading={save.busy} onClick={async () => { if (await save.run()) onDone(); }}>حفظ</Button></>}>
      <div className="stack">
        <Field label="المحافظة"><Select value={f.governorate} disabled={!!z} onChange={(e) => setF({ ...f, governorate: e.target.value })} options={options.map((g) => ({ value: g.key, label: g.name }))} /></Field>
        <Field label="أجرة التوصيل"><MoneyInput value={f.fee} onChange={(v) => setF({ ...f, fee: v ?? 0 })} /></Field>
        <Field label="المدة"><Input value={f.eta_text} onChange={(e) => setF({ ...f, eta_text: e.target.value })} placeholder="خلال ٢٤ ساعة" /></Field>
        <Switch label="متاح" checked={f.is_active} onChange={(v) => setF({ ...f, is_active: v })} />
      </div>
    </Modal>
  );
}
