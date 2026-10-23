/** الإعدادات: المتجر، العملة وسعر الصرف، الفروع، الفواتير والطباعة (معاينة حية + طباعة تجريبية)، المخزون ونقطة البيع، التطبيق */
import { useEffect, useState } from 'react';
import { isValidIraqiPhone, normalizeIraqiPhone, type AppConfigSettings, type Branch, type CurrencySettings, type Invoice, type InvoiceItem, type InventorySettings, type InvoiceSettings, type Payment, type StoreSettings } from '@raqeem/shared';
import { Alert, Badge, Button, Card, DataTable, ErrorState, Field, Input, Loading, Modal, NumberInput, PageHeader, Segmented, Select, Switch, Tabs, Textarea, type Column } from '../../ui';
import { useAction, useLoad } from '../../lib/hooks';
import { AppError } from '../../lib/supabase';
import { useFmt, useSettings } from '../../lib/settings';
import { buildReceipt, previewSrcDoc, printDoc } from '../../print';
import { getSetting, saveSetting, type PosSettings, type SettingsMap } from '../sales/data/app-settings';
import { listWarehouses } from '../sales/data/lookups';
import { useMoney } from '../sales/components/common';
import { listBranches, saveBranch } from './api';
import '../sales/sales.css';

type Tab = 'store' | 'currency' | 'branches' | 'invoice' | 'inventory' | 'app';

export default function Settings() {
  const [tab, setTab] = useState<Tab>('store');
  return (
    <>
      <PageHeader title="الإعدادات" description="بيانات المتجر والعملة والطباعة والمخزون والتطبيق. محتوى الموقع التعريفي (الأسئلة وطرق الدفع والتوصيل) في «الموقع التعريفي»." />
      <Tabs value={tab} onChange={setTab} items={[{ value: 'store', label: 'المتجر' }, { value: 'currency', label: 'العملة' }, { value: 'branches', label: 'الفروع' }, { value: 'invoice', label: 'الفواتير والطباعة' }, { value: 'inventory', label: 'المخزون والبيع' }, { value: 'app', label: 'التطبيق' }]} />
      {tab === 'store' ? <StoreTab /> : tab === 'currency' ? <CurrencyTab /> : tab === 'branches' ? <BranchesTab /> : tab === 'invoice' ? <InvoiceTab /> : tab === 'inventory' ? <InventoryTab /> : <AppTab />}
    </>
  );
}

/** يحمّل إعداداً، يحرّره محلياً، ويحفظه */
function useDraft<K extends 'store' | 'currency' | 'invoice' | 'inventory' | 'app' | 'pos'>(key: K) {
  const l = useLoad(() => getSetting(key, true), [key]);
  const [d, setD] = useState<SettingsMap[K] | null>(null);
  useEffect(() => { if (l.data) setD(l.data); }, [l.data]);
  const save = useAction(async () => { if (d) await saveSetting(key, d); }, { success: 'حُفظت الإعدادات' });
  return { d, setD, save, error: l.error, reload: l.reload };
}

function Shell({ error, reload, ready, children }: { error: string | null; reload: () => void; ready: boolean; children: React.ReactNode }) {
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!ready) return <Loading />;
  return <>{children}</>;
}

function StoreTab() {
  const { reload: reloadCtx } = useSettings();
  const { d, setD, error, reload } = useDraft('store');
  const s = d as StoreSettings | null;
  // الهاتف وواتساب بصيغة واحدة +9647… كما في «الموقع التعريفي» (روابط wa.me و tel والموقع تعتمدها)
  const save = useAction(async () => {
    if (!s) return;
    if (s.phone && !isValidIraqiPhone(s.phone)) throw new AppError('رقم الهاتف ليس رقم موبايل عراقي صحيح (مثال: 0770 123 4567).');
    if (s.whatsapp && !isValidIraqiPhone(s.whatsapp)) throw new AppError('رقم واتساب ليس رقم موبايل عراقي صحيح (مثال: 0770 123 4567).');
    const next: StoreSettings = { ...s, phone: normalizeIraqiPhone(s.phone), whatsapp: normalizeIraqiPhone(s.whatsapp) };
    await saveSetting('store', next);
    setD(next);
  }, { success: 'حُفظت الإعدادات' });
  return (
    <Shell error={error} reload={reload} ready={!!s}>
      {s ? (
        <Card>
          <div className="form-grid">
            <Field label="اسم المتجر" required><Input value={s.name} onChange={(e) => setD({ ...s, name: e.target.value })} /></Field>
            <Field label="الاسم القانوني"><Input value={s.legal_name ?? ''} onChange={(e) => setD({ ...s, legal_name: e.target.value || null })} /></Field>
            <Field label="الهاتف"><Input dir="ltr" value={s.phone ?? ''} onChange={(e) => setD({ ...s, phone: e.target.value || null })} /></Field>
            <Field label="واتساب"><Input dir="ltr" value={s.whatsapp ?? ''} onChange={(e) => setD({ ...s, whatsapp: e.target.value || null })} /></Field>
            <Field label="البريد"><Input dir="ltr" value={s.email ?? ''} onChange={(e) => setD({ ...s, email: e.target.value || null })} /></Field>
            <Field label="المدينة" hint="تظهر في الموقع: «داخل الموصل»…"><Input value={s.city ?? ''} onChange={(e) => setD({ ...s, city: e.target.value || null })} placeholder="بغداد" /></Field>
            <Field label="العنوان"><Input value={s.address ?? ''} onChange={(e) => setD({ ...s, address: e.target.value || null })} /></Field>
            <Field label="رابط الخريطة"><Input dir="ltr" value={s.map_url ?? ''} onChange={(e) => setD({ ...s, map_url: e.target.value || null })} /></Field>
            <Field label="أوقات الدوام"><Input value={s.hours ?? ''} onChange={(e) => setD({ ...s, hours: e.target.value || null })} placeholder="السبت–الخميس ٩ص–٩م" /></Field>
            <Field label="انستغرام"><Input dir="ltr" value={s.socials?.instagram ?? ''} onChange={(e) => setD({ ...s, socials: { ...s.socials, instagram: e.target.value || undefined } })} /></Field>
            <Field label="فيسبوك"><Input dir="ltr" value={s.socials?.facebook ?? ''} onChange={(e) => setD({ ...s, socials: { ...s.socials, facebook: e.target.value || undefined } })} /></Field>
            <Field label="تيك توك"><Input dir="ltr" value={s.socials?.tiktok ?? ''} onChange={(e) => setD({ ...s, socials: { ...s.socials, tiktok: e.target.value || undefined } })} /></Field>
            <Field label="شكل الأرقام"><Segmented value={s.digits} onChange={(v) => setD({ ...s, digits: v })} options={[{ value: 'arab', label: '١٢٣ عربية' }, { value: 'latn', label: '123 لاتينية' }]} /></Field>
          </div>
          <div className="form-actions" style={{ marginTop: 16 }}><Button variant="primary" loading={save.busy} onClick={async () => { await save.run(); reloadCtx(); }}>حفظ بيانات المتجر</Button></div>
        </Card>
      ) : null}
    </Shell>
  );
}

function CurrencyTab() {
  const fmt = useFmt();
  const m = useMoney();
  const { d, setD, error, reload } = useDraft('currency');
  const c = d as CurrencySettings | null;
  const saveRate = useAction(async (next: CurrencySettings) => { await saveSetting('currency', next); return true; }, { success: 'حُفظ سعر الصرف' });
  return (
    <Shell error={error} reload={reload} ready={!!c}>
      {c ? (
        <Card title="الدينار والدولار" icon="coins">
          <div className="stack" style={{ maxWidth: 520 }}>
            <Switch label="تفعيل الدولار" hint="فواتير وعروض أسعار ودفعات وأرصدة بالدولار، كلٌّ منفصل عن الدينار" checked={c.usd_enabled} onChange={(v) => setD({ ...c, usd_enabled: v })} />
            <Field label="سعر صرف اليوم (دينار لكل دولار)" hint={c.usd_rate_updated_at ? `آخر تحديث ${fmt.ago(c.usd_rate_updated_at)}` : undefined}>
              <NumberInput value={c.usd_rate} onChange={(v) => setD({ ...c, usd_rate: v ?? 0 })} suffix="د.ع" />
            </Field>
            <Alert tone="info">كل فاتورة تحفظ سعر يومها، فتغيير السعر لا يغيّر الفواتير السابقة. ١٠٠ دولار = {m((c.usd_rate || 0) * 100)}</Alert>
            <div><Button variant="primary" loading={saveRate.busy} disabled={!(c.usd_rate > 0)} onClick={async () => { const next = { ...c, usd_rate_updated_at: new Date().toISOString() }; if (await saveRate.run(next)) setD(next); }}>حفظ سعر الصرف</Button></div>
          </div>
        </Card>
      ) : null}
    </Shell>
  );
}

function BranchesTab() {
  const list = useLoad(listBranches, []);
  const [edit, setEdit] = useState<Branch | 'new' | null>(null);
  const cols: Column<Branch>[] = [
    { key: 'n', header: 'الفرع', primary: true, cell: (b) => <span><b>{b.name}</b> {b.is_default ? <Badge plain tone="accent">الرئيسي</Badge> : null}</span> },
    { key: 'a', header: 'العنوان', cell: (b) => <span className="dim">{b.address ?? '—'}</span> },
    { key: 'p', header: 'الهاتف', hideOnMobile: true, cell: (b) => <span className="ltr">{b.phone ?? '—'}</span> },
    { key: 's', header: 'الحالة', cell: (b) => (b.is_active ? 'فعّال' : <span className="faint">موقوف</span>) },
  ];
  return (
    <>
      <div className="sx-between"><span className="sx-muted">لكل فرع صناديقه ومخازنه. الفرع الرئيسي يُختار افتراضياً.</span><Button variant="primary" icon="plus" onClick={() => setEdit('new')}>فرع جديد</Button></div>
      <DataTable rows={list.data} columns={cols} rowKey={(b) => b.id} loading={list.loading} error={list.error} onRetry={list.reload} onRowClick={setEdit} empty={{ icon: 'store', title: 'لا فروع' }} />
      {edit ? <BranchModal b={edit === 'new' ? null : edit} onClose={() => setEdit(null)} onDone={() => { setEdit(null); void list.reload(); }} /> : null}
    </>
  );
}

function BranchModal({ b, onClose, onDone }: { b: Branch | null; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState({ name: b?.name ?? '', address: b?.address ?? '', phone: b?.phone ?? '', is_default: b?.is_default ?? false, is_active: b?.is_active ?? true });
  const save = useAction(() => saveBranch({ ...f, address: f.address || null, phone: f.phone || null }, b?.id), { success: 'حُفظ الفرع' });
  return (
    <Modal open onClose={onClose} title={b ? b.name : 'فرع جديد'} width={460} footer={<><Button onClick={onClose}>إلغاء</Button><Button variant="primary" loading={save.busy} onClick={async () => { if (await save.run()) onDone(); }}>حفظ</Button></>}>
      <div className="stack">
        <Field label="الاسم" required><Input autoFocus value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="العنوان"><Input value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></Field>
        <Field label="الهاتف"><Input dir="ltr" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
        <Switch label="الفرع الرئيسي" checked={f.is_default} onChange={(v) => setF({ ...f, is_default: v })} />
        <Switch label="فعّال" checked={f.is_active} onChange={(v) => setF({ ...f, is_active: v })} />
      </div>
    </Modal>
  );
}

function sampleReceipt(): { invoice: Invoice; items: InvoiceItem[]; payments: Payment[] } {
  const at = new Date().toISOString();
  const invoice = { id: 'sample', number: 'S-000123', kind: 'sale', channel: 'pos', status: 'posted', customer_id: null, supplier_id: null, order_id: null, return_of: null, warehouse_id: 'w', branch_id: null, quotation_id: null, currency: 'IQD', exchange_rate: 1, subtotal: 83000, discount: 3000, delivery_fee: 0, total: 80000, paid: 80000, due: 0, cost_total: 0, note: null, cash_session_id: null, created_by: null, created_at: at, voided_at: null, voided_by: null, void_reason: null } as Invoice;
  const item = (name: string, qty: number, price: number, discount = 0, serials: string[] = []): InvoiceItem => ({ id: name, invoice_id: 'sample', variant_id: name, product_id: name, name, variant_title: null, sku: 'RQ-1', qty, unit_price: price, discount, line_total: qty * price - discount, unit_cost: 0, serials, price_tier: 'retail', unit_name: null, unit_factor: 1, lot_code: null, expiry_date: null });
  const items = [item('شاحن سريع ٦٥ واط GaN', 1, 45000), item('كابل USB-C مضفّر ٢ متر', 2, 9000, 2000), item('سماعة لاسلكية', 1, 20000, 0, ['SN8812094'])];
  const payments = [{ id: 'p', number: 'RC-1', direction: 'in', method: 'cash', amount: 100000, currency: 'IQD', exchange_rate: 1, amount_iqd: 100000, account_id: null, customer_id: null, supplier_id: null, invoice_id: 'sample', order_id: null, cash_session_id: null, reference: null, note: null, created_by: null, created_at: at, voided_at: null } as Payment];
  return { invoice, items, payments };
}

function InvoiceTab() {
  const { store } = useSettings();
  const { d, setD, save, error, reload } = useDraft('invoice');
  const s = d as InvoiceSettings | null;
  const [html, setHtml] = useState('');
  useEffect(() => {
    if (!s) return;
    let alive = true;
    void buildReceipt({ ...sampleReceipt(), customer: null, cashier: 'حيدر', change: 20000 }, store, s).then((doc) => alive && setHtml(previewSrcDoc(doc)));
    return () => { alive = false; };
  }, [s, store]);
  const test = async () => { if (s) await printDoc(await buildReceipt({ ...sampleReceipt(), customer: null, cashier: 'طباعة تجريبية', change: 20000 }, store, s)); };
  return (
    <Shell error={error} reload={reload} ready={!!s}>
      {s ? (
        <div className="sx-split preview-aside">
          <Card>
            <div className="stack">
              <Field label="عرض الطابعة الحرارية"><Segmented value={String(s.receipt_width) as '58' | '80'} onChange={(v) => setD({ ...s, receipt_width: Number(v) as 58 | 80 })} options={[{ value: '80', label: '٨٠ ملم' }, { value: '58', label: '٥٨ ملم' }]} /></Field>
              <Switch label="الشعار في الإيصال" checked={s.show_logo} onChange={(v) => setD({ ...s, show_logo: v })} />
              <Switch label="رمز QR برقم الفاتورة" checked={s.show_qr} onChange={(v) => setD({ ...s, show_qr: v })} />
              <Field label="نص أعلى الإيصال"><Input value={s.header_note ?? ''} onChange={(e) => setD({ ...s, header_note: e.target.value || null })} placeholder="فرع الكرادة" /></Field>
              <Field label="نص الشكر أسفل الإيصال"><Input value={s.footer_note ?? ''} onChange={(e) => setD({ ...s, footer_note: e.target.value || null })} /></Field>
              <Field label="سياسة الإرجاع"><Textarea rows={3} value={s.return_policy ?? ''} onChange={(e) => setD({ ...s, return_policy: e.target.value || null })} /></Field>
              <div className="form-grid">
                <Field label="عرض ملصق الباركود (ملم)"><NumberInput value={s.label_size.width_mm} onChange={(v) => setD({ ...s, label_size: { ...s.label_size, width_mm: v ?? 50 } })} /></Field>
                <Field label="ارتفاعه (ملم)"><NumberInput value={s.label_size.height_mm} onChange={(v) => setD({ ...s, label_size: { ...s.label_size, height_mm: v ?? 25 } })} /></Field>
              </div>
              <div className="sx-row"><Button variant="primary" loading={save.busy} onClick={() => void save.run()}>حفظ إعدادات الطباعة</Button><Button icon="printer" onClick={() => void test()}>طباعة تجريبية</Button></div>
            </div>
          </Card>
          <div><span className="section-title">معاينة حية</span><iframe title="معاينة الإيصال" className="receipt-frame" style={{ width: s.receipt_width === 58 ? 240 : 320, height: 720 }} srcDoc={html} /></div>
        </div>
      ) : null}
    </Shell>
  );
}

function InventoryTab() {
  const inv = useDraft('inventory');
  const pos = useDraft('pos');
  const whs = useLoad(listWarehouses, []);
  const i = inv.d as InventorySettings | null;
  const p = pos.d as PosSettings | null;
  return (
    <Shell error={inv.error ?? pos.error} reload={() => { void inv.reload(); void pos.reload(); }} ready={!!i && !!p}>
      {i && p ? (
        <div className="grid-2">
          <Card title="المخزون" icon="layers">
            <div className="stack">
              <Field label="المخزن الافتراضي للبيع"><Select value={i.default_warehouse_id ?? ''} onChange={(e) => inv.setD({ ...i, default_warehouse_id: e.target.value || null })} placeholder="الرئيسي" options={(whs.data ?? []).map((w) => ({ value: w.id, label: w.name }))} /></Field>
              <Field label="حد التنبيه الافتراضي للنواقص"><NumberInput value={i.low_stock_default} onChange={(v) => inv.setD({ ...i, low_stock_default: v ?? 0 })} /></Field>
              <Switch label="السماح بالبيع بالسالب" hint="البيع حتى لو لم يكفِ المخزون المسجّل (غير منصوح)" checked={i.allow_negative_stock} onChange={(v) => inv.setD({ ...i, allow_negative_stock: v })} />
              <div><Button variant="primary" loading={inv.save.busy} onClick={() => void inv.save.run()}>حفظ</Button></div>
            </div>
          </Card>
          <Card title="نقطة البيع" icon="pos">
            <div className="stack">
              <Switch label="طباعة الإيصال تلقائياً بعد كل بيع" checked={p.auto_print} onChange={(v) => pos.setD({ ...p, auto_print: v })} />
              <Switch label="لا بيع بلا جلسة صندوق مفتوحة" checked={p.require_cash_session} onChange={(v) => pos.setD({ ...p, require_cash_session: v })} />
              <Field label="تنبيه الطلب المتأخر بعد (دقيقة)"><NumberInput value={p.late_order_minutes} onChange={(v) => pos.setD({ ...p, late_order_minutes: v ?? 30 })} /></Field>
              <div><Button variant="primary" loading={pos.save.busy} onClick={() => void pos.save.run()}>حفظ</Button></div>
            </div>
          </Card>
        </div>
      ) : null}
    </Shell>
  );
}

function AppTab() {
  const { d, setD, save, error, reload } = useDraft('app');
  const a = d as AppConfigSettings | null;
  return (
    <Shell error={error} reload={reload} ready={!!a}>
      {a ? (
        <Card title="تطبيق المتجر" icon="phone">
          <div className="stack" style={{ maxWidth: 560 }}>
            <div className="form-grid">
              <Field label="أحدث نسخة"><NumberInput value={a.latest_version} onChange={(v) => setD({ ...a, latest_version: v ?? 1 })} /></Field>
              <Field label="أقل نسخة مسموحة" hint="الأقدم منها يُطلب منه التحديث"><NumberInput value={a.min_version} onChange={(v) => setD({ ...a, min_version: v ?? 1 })} /></Field>
              <Field label="رابط Google Play"><Input dir="ltr" value={a.play_store_url ?? ''} onChange={(e) => setD({ ...a, play_store_url: e.target.value || null })} /></Field>
              <Field label="رابط APK مباشر"><Input dir="ltr" value={a.apk_url ?? ''} onChange={(e) => setD({ ...a, apk_url: e.target.value || null })} /></Field>
            </div>
            <Switch label="وضع الصيانة" hint="يُغلق التطبيق مؤقتاً برسالة للزبائن" checked={a.maintenance} onChange={(v) => setD({ ...a, maintenance: v })} />
            {a.maintenance ? <Field label="رسالة الصيانة"><Textarea rows={2} value={a.maintenance_message ?? ''} onChange={(e) => setD({ ...a, maintenance_message: e.target.value || null })} placeholder="نحدّث المتجر، نعود خلال ساعة." /></Field> : null}
            {a.min_version > a.latest_version ? <Alert tone="warning">أقل نسخة أكبر من أحدث نسخة — سيُمنع الجميع.</Alert> : null}
            <div><Button variant="primary" loading={save.busy} onClick={() => void save.run()}>حفظ</Button></div>
          </div>
        </Card>
      ) : null}
    </Shell>
  );
}

