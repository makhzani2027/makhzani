/**
 * منشئ عروض الأسعار — أربع خطوات:
 *  ١) البيانات: الزبون (مسجّل أو اسم وهاتف)، عنوان العرض، المخزن، الصلاحية، مفرد/جملة، العملة.
 *  ٢) المكونات: تصفّح بالقسم والشركة (الكل افتراضياً) والبحث؛ اختيار منتج ← العدد ← سعر القطعة والمجموع ← «أضف للعرض».
 *  ٣) المميزات والشروط: نقاط تُطبع بارزة («تجهيزك بـ ١٠ أمبير نهاراً…») مع اقتراحات من العروض السابقة.
 *  ٤) المراجعة: معاينة ورقة A4 الحقيقية، الخصم، الحفظ والطباعة والواتساب والتحويل لفاتورة.
 * الأسعار والإجمالي يعيد الخادم حسابها عند الحفظ (save_quotation)؛ ما يظهر هنا معاينة بنفس القاعدة.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  QUOTATION_STATUS, isoDay, normalizeArabic, nouns, roundMoney, startOfBaghdadDay, whatsappLink,
  type CurrencyCode, type PriceTier, type Quotation, type QuotationItem, type QuotationStatus,
} from '@raqeem/shared';
import {
  Alert, Avatar, Badge, Button, Card, Checkbox, EmptyState, ErrorState, Field, Icon, IconButton, Input, Loading, Modal, MoneyInput,
  NumberInput, PageHeader, SearchInput, Segmented, Select, Skeleton, Textarea, Thumb, askConfirm, toast,
} from '../../ui';
import { useAuth } from '../../lib/auth';
import { useAction, useLoad } from '../../lib/hooks';
import { useFmt, useSettings } from '../../lib/settings';
import { buildQuotationA4, previewSrcDoc, printDoc } from '../../print';
import { categoryWithChildren } from '../catalog/api';
import { categoryOptions, useCatalogMeta } from '../catalog/components/hooks';
import {
  convertQuotation, getQuotation, loadPosCatalog, quotationItemExtras, recentQuotationFeatures, saveQuotation, setQuotationStatus,
  type QuotationFull,
} from './api';
import { getSetting, useSetting } from './data/app-settings';
import type { CustomerHit } from './data/lookups';
import type { PayLine, PosItem } from './data/types';
import { CustomerPicker, useMoney, useRate } from './components/common';
import { PaymentModal } from './components/PaymentModal';
import { WarehouseHint } from './components/WarehouseHint';
import { printInvoice } from './printing';
import { clearDraft, draftKey, readDraft, writeDraft, type QuoteDraft } from './quoteDraft';
import './sales.css';
import './quote.css';

interface Line { variant_id: string; name: string; variant_title: string | null; image_key: string | null; qty: number; unit_price: number; discount: number; price_tier: PriceTier }
type Step = 'info' | 'items' | 'features' | 'review';
const STEPS: { id: Step; label: string; icon: 'user' | 'boxes' | 'star' | 'fileText' }[] = [
  { id: 'info', label: 'البيانات', icon: 'user' },
  { id: 'items', label: 'المكونات', icon: 'boxes' },
  { id: 'features', label: 'المميزات والشروط', icon: 'star' },
  { id: 'review', label: 'المراجعة والطباعة', icon: 'fileText' },
];

export default function QuotationForm() {
  const { id } = useParams();
  const isNew = !id || id === 'new';
  const existing = useLoad(() => (isNew ? Promise.resolve(null) : getQuotation(id!)), [id]);
  if (existing.error) return <ErrorState message={existing.error} onRetry={existing.reload} />;
  const [gen, setGen] = useState(0);
  if (!isNew && !existing.data) return <Loading />;
  return <Builder key={`${id ?? 'new'}:${gen}`} full={existing.data ?? null} reload={existing.reload} onDiscard={() => setGen((g) => g + 1)} />;
}

/** بصمة العرض المحفوظ: لو تغيّر على الخادم بعد كتابة المسودة تُهمَل المسودة */
const baseOf = (full: QuotationFull | null) => (full ? JSON.stringify([full.quotation.status, full.quotation.total, full.quotation.valid_until, full.quotation.title, full.quotation.note, full.quotation.features, full.items.map((i) => [i.variant_id, i.qty, i.unit_price, i.discount])]) : 'new');

function Builder({ full, reload, onDiscard }: { full: QuotationFull | null; reload: () => Promise<void>; onDiscard: () => void }) {
  const nav = useNavigate();
  const fmt = useFmt();
  const m = useMoney();
  const { store } = useSettings();
  const { can, profile } = useAuth();
  const invoiceCfg = useSetting('invoice');
  const { usd, rate } = useRate();
  const meta = useCatalogMeta();
  const q0 = full?.quotation;
  const locked = q0?.status === 'converted' || q0?.status === 'cancelled';
  const dKey = draftKey(profile?.id, q0?.id);
  const [d0] = useState<QuoteDraft | null>(() => (locked ? null : readDraft(dKey, baseOf(full))));

  // ---------------------------------------------------------------- الحالة
  const [step, setStep] = useState<Step>(d0?.step ?? (q0 ? 'review' : 'info'));
  const [customer, setCustomer] = useState<Pick<CustomerHit, 'id' | 'name' | 'phone' | 'credit_limit' | 'balance'> | null>(d0 ? (d0.customer as CustomerHit | null) : full?.customer ? { ...full.customer, balance: 0 } : null);
  const [freeName, setFreeName] = useState(d0?.freeName ?? q0?.customer_name ?? '');
  const [freePhone, setFreePhone] = useState(d0?.freePhone ?? q0?.customer_phone ?? '');
  const [title, setTitle] = useState(d0?.title ?? q0?.title ?? '');
  const [whId, setWhId] = useState(d0?.whId ?? q0?.warehouse_id ?? '');
  const [currency, setCurrency] = useState<CurrencyCode>(d0?.currency ?? q0?.currency ?? 'IQD');
  const [tier, setTier] = useState<PriceTier>(d0?.tier ?? full?.items[0]?.price_tier ?? 'retail');
  const [valid, setValid] = useState(d0 ? d0.valid : q0 ? q0.valid_until ?? '' : isoDay(startOfBaghdadDay(Date.now(), 7)));
  const [discount, setDiscount] = useState(d0?.discount ?? q0?.discount ?? 0);
  const [note, setNote] = useState(d0?.note ?? q0?.note ?? '');
  const [features, setFeatures] = useState<string[]>(d0?.features ?? q0?.features ?? []);
  const [lines, setLines] = useState<Line[]>(d0?.lines ?? full?.items.map((i) => ({
    variant_id: i.variant_id, name: i.name, variant_title: i.variant_title, image_key: null, qty: i.qty, unit_price: i.unit_price, discount: i.discount, price_tier: i.price_tier,
  })) ?? []);
  const [picking, setPicking] = useState(false);
  const [paying, setPaying] = useState(false);
  const [dirty, setDirty] = useState(!!d0);
  const touch = <T,>(fn: (v: T) => void) => (v: T) => { fn(v); setDirty(true); };

  // المسودة: كل تعديل غير محفوظ يُكتب في المتصفح، فالخروج لقسم آخر والعودة لا يضيّع العرض
  const base = useMemo(() => baseOf(full), [full]);
  useEffect(() => {
    if (locked) return;
    if (!dirty) { clearDraft(dKey); return; }
    writeDraft(dKey, { v: 1, at: Date.now(), base, step, customer, freeName, freePhone, title, whId, currency, tier, valid, discount, note, features, lines });
  }, [dirty, locked, dKey, base, step, customer, freeName, freePhone, title, whId, currency, tier, valid, discount, note, features, lines]);
  const discardDraft = async () => {
    if (!(await askConfirm({ title: 'تجاهل المسودة؟', body: q0 ? 'تُحذف تعديلاتك غير المحفوظة ويعود العرض كما هو محفوظ.' : 'يُحذف العرض غير المحفوظ وتبدأ عرضاً فارغاً.', danger: true, confirm: 'تجاهل المسودة' }))) return;
    clearDraft(dKey);
    onDiscard();
  };

  // الشروط الافتراضية للعرض الجديد من إعدادات الطباعة (ما لم يكتب الموظف شيئاً بعد)
  useEffect(() => {
    if (q0 || d0) return;
    let alive = true;
    void getSetting('invoice').then((s) => { if (alive && s.quote_terms) setNote((n) => n || s.quote_terms!); }).catch(() => undefined);
    return () => { alive = false; };
  }, [q0]);

  const invCfg = useSetting('inventory');
  const sellableWh = meta.warehouses.filter((w) => w.is_active && w.is_sellable);
  const wh = whId || sellableWh.find((w) => w.id === invCfg.default_warehouse_id)?.id || sellableWh.find((w) => w.is_default)?.id || sellableWh[0]?.id || meta.warehouses[0]?.id || '';
  useEffect(() => { if (!whId && wh) setWhId(wh); }, [wh, whId]);
  const whName = meta.warehouses.find((w) => w.id === wh)?.name ?? '';
  const catalog = useLoad(() => (wh ? loadPosCatalog(wh) : Promise.resolve([] as PosItem[])), [wh]);
  // عرض محفوظ بالدينار سعر صرفه 1؛ عند تحويله للدولار نأخذ سعر اليوم
  const r = currency === 'USD' ? (q0?.currency === 'USD' ? q0.exchange_rate : rate) : 1;

  // صور البنود المحفوظة من الكتالوج
  useEffect(() => {
    if (!catalog.data) return;
    setLines((ls) => ls.map((l) => (l.image_key ? l : { ...l, image_key: catalog.data!.find((x) => x.variant_id === l.variant_id)?.image_key ?? null })));
  }, [catalog.data]);

  // مسودة مسترجعة بعد تغيّر أسعار الكتالوج: من لا يملك تعديل الأسعار تُحدَّث أسعار بنوده الجديدة لسعر اليوم
  // (وإلا رفض الخادم الحفظ). البنود المحفوظة سابقاً في العرض تبقى بسعرها المثبّت (يقبله الخادم).
  const repricedDraft = useRef(false);
  useEffect(() => {
    if (!d0 || repricedDraft.current || !catalog.data || can('pos.price_override')) return;
    repricedDraft.current = true;
    const saved = new Set((full?.items ?? []).map((i) => `${i.variant_id}|${i.price_tier}`));
    setLines((ls) => ls.map((l) => (saved.has(`${l.variant_id}|${l.price_tier}`) ? l : { ...l, unit_price: priceFor(l.variant_id, l.price_tier, l.unit_price) })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog.data]);

  const lineTotal = (l: Line) => Math.max(0, roundMoney(l.unit_price * l.qty - l.discount, currency));
  const subtotal = roundMoney(lines.reduce((s, l) => s + lineTotal(l), 0), currency);
  const disc = Math.min(Math.max(discount, 0), subtotal);
  const total = roundMoney(subtotal - disc, currency);
  const pieces = lines.reduce((s, l) => s + l.qty, 0);

  const priceOf = (it: PosItem, t: PriceTier) => roundMoney((t === 'wholesale' ? it.wholesale_price ?? it.price : it.price) / r, currency);
  const priceFor = (variantId: string, t: PriceTier, fallback: number) => {
    const it = catalog.data?.find((x) => x.variant_id === variantId);
    return it ? priceOf(it, t) : fallback;
  };
  const upsertLine = (it: PosItem, qty: number, unit: number) => {
    setLines((ls) => {
      const i = ls.findIndex((l) => l.variant_id === it.variant_id);
      if (i >= 0) return ls.map((l, j) => (j === i ? { ...l, qty, unit_price: unit } : l));
      return [...ls, { variant_id: it.variant_id, name: it.name, variant_title: it.variant_title, image_key: it.image_key, qty, unit_price: unit, discount: 0, price_tier: tier }];
    });
    setDirty(true);
  };
  const setLine = (i: number, p: Partial<Line>) => { setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...p } : l))); setDirty(true); };
  const moveLine = (i: number, d: -1 | 1) => { setLines((ls) => { const a = [...ls]; const j = i + d; if (j < 0 || j >= a.length) return ls; [a[i], a[j]] = [a[j], a[i]]; return a; }); setDirty(true); };
  const removeLine = (i: number) => { setLines((ls) => ls.filter((_, j) => j !== i)); setDirty(true); };
  const retier = (t: PriceTier) => { setTier(t); setLines((ls) => ls.map((l) => ({ ...l, price_tier: t, unit_price: priceFor(l.variant_id, t, l.unit_price) }))); setDirty(true); };
  const recurrency = (c: CurrencyCode) => {
    if (c === currency) return;
    setLines((ls) => ls.map((l) => ({ ...l, unit_price: roundMoney(c === 'USD' ? l.unit_price / rate : l.unit_price * rate, c), discount: 0 })));
    setDiscount(0);
    setCurrency(c);
    setDirty(true);
  };

  // ---------------------------------------------------------------- التحقق والتنقل
  const customerName = customer?.name ?? freeName.trim();
  const customerPhone = customer?.phone ?? (freePhone.trim() || null);
  const infoError = !customerName ? 'اكتب اسم الزبون أو اختر زبوناً مسجّلاً.' : !wh ? 'اختر المخزن.' : null;
  const itemsError = !lines.length ? 'أضف منتجاً واحداً على الأقل للعرض.' : null;
  const go = (to: Step) => {
    const order = STEPS.map((s) => s.id);
    if (order.indexOf(to) > order.indexOf('info') && infoError) { setStep('info'); toast.error(infoError); return; }
    if (order.indexOf(to) > order.indexOf('items') && itemsError) { setStep('items'); toast.error(itemsError); return; }
    setStep(to);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const idx = STEPS.findIndex((s) => s.id === step);

  // ---------------------------------------------------------------- الحفظ والطباعة
  const payload = (status: QuotationStatus) => ({
    id: q0?.id, customer_id: customer?.id ?? null, customer_name: customer ? null : freeName.trim(), customer_phone: customer ? null : freePhone.trim() || null,
    title: title.trim() || null, features: features.map((x) => x.trim()).filter(Boolean),
    warehouse_id: wh, currency, exchange_rate: currency === 'USD' ? r : 1, valid_until: valid || null, discount: disc, note: note.trim() || null, status,
    items: lines.map((l) => ({ variant_id: l.variant_id, qty: l.qty, unit_price: l.unit_price, discount: l.discount, price_tier: l.price_tier })),
  });
  const save = useAction(async (status: QuotationStatus) => saveQuotation(payload(status)), { success: 'حُفظ العرض' });
  const saveAndStay = async (status: QuotationStatus) => {
    if (infoError || itemsError) { toast.error(infoError ?? itemsError!); return null; }
    const res = await save.run(status);
    if (res) { clearDraft(dKey); setDirty(false); if (!q0) nav(`/quotations/${res.id}`, { replace: true }); else await reload(); }
    return res;
  };
  const extras = useLoad(() => quotationItemExtras(lines.map((l) => l.variant_id)), [lines.map((l) => l.variant_id).join(',')]);
  // شريط الشركات أعلى الورقة: ما اختاره صاحب المتجر في الإعدادات، وإلا كل الشركات بترتيبها
  const headerBrands = useMemo(() => {
    const ids = invoiceCfg?.quote_brand_ids;
    const all = meta.brands.map((b) => ({ id: b.id, name: b.name, logo_key: b.logo_key }));
    return ids == null ? all : ids.map((id) => all.find((b) => b.id === id)).filter((b): b is (typeof all)[number] => !!b);
  }, [meta.brands, invoiceCfg?.quote_brand_ids]);
  const author = profile?.full_name?.replace(/\s*\(.*\)\s*$/, '') ?? null;
  const printSaved = async (id: string) => {
    const f = await getQuotation(id);
    const ex = await quotationItemExtras(f.items.map((i) => i.variant_id));
    await printDoc(buildQuotationA4({ quotation: f.quotation, items: f.items, customer: f.customer, store, invoice: invoiceCfg, extras: ex, author, headerBrands }));
  };
  const saveAndPrint = async () => {
    if (locked && q0) { await printSaved(q0.id); return; }
    const res = await saveAndStay(q0?.status && q0.status !== 'draft' ? q0.status : 'sent');
    if (res) await printSaved(res.id);
  };
  const convert = useAction(async (payments: PayLine[]) => convertQuotation(q0!.id, payments), { success: 'جُهّز العرض وأُنشئت فاتورة البيع' });
  const cancel = useAction(async () => { await setQuotationStatus(q0!.id, 'cancelled'); clearDraft(dKey); await reload(); }, { success: 'أُلغي العرض' });
  const accept = useAction(async () => { await setQuotationStatus(q0!.id, 'accepted'); await reload(); }, { success: 'سُجّل قبول الزبون' });

  // المعاينة: نفس قالب الطباعة من الحالة الحالية (قبل الحفظ يظهر الرقم «مسودة»)
  const previewQuotation: Quotation = {
    id: q0?.id ?? 'preview', number: q0?.number ?? 'مسودة', status: q0?.status ?? 'draft', customer_id: customer?.id ?? null,
    customer_name: customer ? null : freeName.trim() || null, customer_phone: customer ? null : freePhone.trim() || null,
    warehouse_id: wh, currency, exchange_rate: r, subtotal, discount: disc, total, valid_until: valid || null, note: note.trim() || null,
    title: title.trim() || null, features: features.map((x) => x.trim()).filter(Boolean), invoice_id: q0?.invoice_id ?? null,
    created_by: q0?.created_by ?? null, created_at: q0?.created_at ?? new Date().toISOString(),
  };
  const previewItems: QuotationItem[] = lines.map((l, n) => ({
    id: `${l.variant_id}-${n}`, quotation_id: previewQuotation.id, variant_id: l.variant_id, name: l.name, variant_title: l.variant_title,
    qty: l.qty, unit_price: l.unit_price, discount: l.discount, line_total: lineTotal(l), price_tier: l.price_tier, sort: n + 1,
  }));
  const previewDoc = useMemo(() => (step === 'review'
    ? previewSrcDoc(buildQuotationA4({ quotation: previewQuotation, items: previewItems, customer: customer ? { name: customer.name, phone: customer.phone } : null, store, invoice: invoiceCfg, extras: extras.data ?? {}, author, headerBrands }))
    : ''), [step, JSON.stringify(previewQuotation), JSON.stringify(previewItems), extras.data, invoiceCfg, store, author, customer, headerBrands]);

  const waText = [
    `${title.trim() || 'عرض سعر'}${q0 ? ` — ${q0.number}` : ''}`, `من ${store.name}`, '',
    ...lines.map((l) => `• ${l.name}${l.variant_title ? ` (${l.variant_title})` : ''} × ${fmt.qty(l.qty)} = ${m(lineTotal(l), currency)}`), '',
    ...(features.filter((x) => x.trim()).length ? ['المميزات:', ...features.filter((x) => x.trim()).map((x) => `✓ ${x.trim()}`), ''] : []),
    disc ? `الخصم: ${m(disc, currency)}` : '', `الإجمالي: ${m(total, currency)}`, valid ? `ساري حتى ${fmt.date(`${valid}T12:00:00Z`)}` : '',
  ].filter((x, i, a) => x || a[i - 1]).join('\n');
  const wa = whatsappLink(customerPhone, waText);
  const expired = !!valid && valid < isoDay() && !locked;

  return (
    <>
      <PageHeader
        title={q0 ? <span>{q0.title || 'عرض سعر'} <span className="ltr dim">{q0.number}</span></span> : 'عرض سعر جديد'}
        crumbs={[{ label: 'عروض الأسعار', to: '/quotations' }, { label: q0?.number ?? 'جديد' }]}
        description={q0 ? <><Badge tone={QUOTATION_STATUS[q0.status].tone}>{QUOTATION_STATUS[q0.status].label}</Badge> · {fmt.date(q0.created_at)}{dirty ? <> · <span className="sx-neg">تعديلات غير محفوظة</span></> : null}</> : 'جهّز عرضاً متكاملاً للزبون خطوة بخطوة، ثم اطبعه أو أرسله واتساب.'}
        actions={q0 && !locked ? <Button icon="xCircle" variant="ghost" loading={cancel.busy} onClick={async () => { if (await askConfirm({ title: 'إلغاء العرض؟', body: 'يبقى في السجل بحالة «ملغى» ولا يُحوَّل لفاتورة.', danger: true, confirm: 'إلغاء العرض' })) void cancel.run(); }}>إلغاء العرض</Button> : null} />
      {q0?.status === 'converted' && q0.invoice_id ? <Alert tone="success">حُوّل لفاتورة <Link className="ltr" to={`/invoices/${q0.invoice_id}`}>{full?.invoice_number ?? 'عرض'}</Link>.</Alert> : null}
      {d0 && dirty ? (
        <Alert tone="info">
          <span className="row" style={{ gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <span className="grow">استُرجعت مسودتك غير المحفوظة (آخر تعديل {fmt.date(d0.at, true)}). احفظ العرض حتى يدخل سجل العروض.</span>
            <Button size="sm" variant="ghost" icon="trash" onClick={() => void discardDraft()}>تجاهل المسودة</Button>
          </span>
        </Alert>
      ) : null}
      {expired ? <Alert tone="warning">انتهت صلاحية العرض. حدّث تاريخ «ساري حتى» قبل إرساله، وعند التحويل تُحتسب أسعار اليوم.</Alert> : null}

      {!locked ? (
        <nav className="qb-steps" aria-label="خطوات العرض">
          {STEPS.map((s, i) => (
            <button key={s.id} type="button" className={`qb-step ${s.id === step ? 'on' : ''} ${i < idx ? 'done' : ''}`} onClick={() => go(s.id)} aria-current={s.id === step ? 'step' : undefined}>
              <span className="qb-dot">{i < idx ? <Icon name="check" size={15} /> : fmt.num(i + 1)}</span>
              <span className="qb-lbl">{s.label}</span>
            </button>
          ))}
        </nav>
      ) : null}

      {step === 'info' && !locked ? (
        <div className="qb-narrow">
          <Card title="الزبون" icon="user">
            {customer ? (
              <div className="pos-cust"><Avatar name={customer.name} size={34} /><span className="grow"><b>{customer.name}</b>{customer.phone ? <div className="small dim ltr">{customer.phone}</div> : null}</span><Button size="sm" variant="ghost" onClick={() => { setCustomer(null); setDirty(true); }}>تغيير</Button></div>
            ) : (
              <div className="stack">
                <div className="form-grid">
                  <Field label="اسم الزبون" required><Input value={freeName} autoFocus onChange={(e) => { setFreeName(e.target.value); setDirty(true); }} placeholder="عبدالله جاسم" /></Field>
                  <Field label="رقم الهاتف"><Input dir="ltr" inputMode="tel" value={freePhone} onChange={(e) => { setFreePhone(e.target.value); setDirty(true); }} placeholder="07XX XXX XXXX" /></Field>
                </div>
                <div><Button size="sm" icon="users" onClick={() => setPicking(true)}>أو اختر زبوناً مسجّلاً</Button></div>
              </div>
            )}
          </Card>
          <Card title="العرض" icon="fileText">
            <div className="stack">
              <Field label="عنوان العرض" hint="يظهر كبيراً في رأس الورقة. مثال: منظومة طاقة شمسية ٥ ك.واط"><Input value={title} maxLength={160} onChange={(e) => { setTitle(e.target.value); setDirty(true); }} placeholder="منظومة طاقة شمسية متكاملة" /></Field>
              <div className="form-grid">
                <Field label="المخزن" required hint="الأسعار والكميات المتوفرة منه"><Select value={wh} onChange={(e) => { setWhId(e.target.value); setDirty(true); }} options={(sellableWh.length ? sellableWh : meta.warehouses).map((w) => ({ value: w.id, label: w.name }))} /></Field>
                <Field label="ساري حتى"><Input type="date" value={valid} onChange={(e) => { setValid(e.target.value); setDirty(true); }} /></Field>
              </div>
              <div className="form-grid">
                <Field label="نوع السعر"><Segmented value={tier} onChange={retier} options={[{ value: 'retail', label: 'مفرد' }, { value: 'wholesale', label: 'جملة' }]} /></Field>
                {usd ? <Field label="العملة" hint={currency === 'USD' ? `بسعر صرف ${m(r)}` : undefined}><Segmented value={currency} onChange={recurrency} options={[{ value: 'IQD', label: 'دينار' }, { value: 'USD', label: 'دولار' }]} /></Field> : null}
              </div>
            </div>
          </Card>
          <div className="qb-nav"><span className="grow" /><Button variant="primary" icon="arrowLeft" onClick={() => go('items')}>التالي: المكونات</Button></div>
        </div>
      ) : null}

      {step === 'items' && !locked ? <WarehouseHint warehouses={sellableWh} current={wh} onSwitch={(id) => { setWhId(id); setDirty(true); }} /> : null}
      {step === 'items' && !locked ? (
        <div className="qb-items">
          <ProductBrowser
            catalog={catalog.data} loading={catalog.loading} error={catalog.error} onRetry={catalog.reload}
            categories={meta.categories} brands={meta.brands} whName={whName}
            priceOf={(it) => priceOf(it, tier)} currency={currency} lines={lines} canPrice={can('pos.price_override')}
            onAdd={(it, qty, unit) => { upsertLine(it, qty, unit); toast.success(`أُضيف «${it.name}» للعرض`); }}
          />
          <div className="qb-cart">
            <Card title={<span>بنود العرض {lines.length ? <Badge>{fmt.num(lines.length)}</Badge> : null}</span>} icon="fileText" flush>
              {!lines.length ? <div style={{ padding: 18 }}><EmptyState icon="boxes" title="العرض فارغ" text="اختر قسماً أو شركة، ثم اضغط على المنتج لإضافته." /></div> : (
                <ul className="qb-lines">
                  {lines.map((l, i) => (
                    <li key={l.variant_id}>
                      <Thumb imageKey={l.image_key} size="sm" />
                      <div className="qb-lt">
                        <b>{l.name}</b>{l.variant_title ? <span className="small dim">، {l.variant_title}</span> : null}
                        <div className="qb-lrow">
                          <NumberInput value={l.qty} onChange={(v) => setLine(i, { qty: Math.max(1, v ?? 1) })} min={1} size_="sm" ariaLabel={`كمية ${l.name}`} />
                          <span className="small dim">× {m(l.unit_price, currency)}</span>
                          <b className="grow end">{m(lineTotal(l), currency)}</b>
                        </div>
                      </div>
                      <div className="qb-lact">
                        <IconButton icon="chevronUp" size="sm" label="للأعلى" disabled={i === 0} onClick={() => moveLine(i, -1)} />
                        <IconButton icon="chevronDown" size="sm" label="للأسفل" disabled={i === lines.length - 1} onClick={() => moveLine(i, 1)} />
                        <IconButton icon="trash" size="sm" label={`حذف ${l.name}`} onClick={() => removeLine(i)} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              <div className="qb-sum">
                <div><span>{lines.length ? <>{fmt.count(lines.length, nouns.line)}، {Number.isInteger(pieces) ? fmt.count(pieces, nouns.item) : `${fmt.qty(pieces)} قطعة`}</> : 'لا بنود بعد'}</span></div>
                <div className="qb-total"><span>المجموع</span><b>{m(subtotal, currency)}</b></div>
              </div>
            </Card>
            <div className="qb-nav">
              <Button icon="arrowRight" onClick={() => go('info')}>السابق</Button>
              <span className="grow" />
              <Button variant="primary" icon="arrowLeft" onClick={() => go('features')}>التالي: المميزات</Button>
            </div>
          </div>
        </div>
      ) : null}

      {step === 'features' && !locked ? (
        <div className="qb-narrow">
          <FeaturesEditor value={features} onChange={touch(setFeatures)} />
          <Card title="الشروط والملاحظات" icon="note">
            <Field hint="تُطبع أسفل العرض. الافتراضي من الإعدادات ← الفواتير والطباعة."><Textarea rows={5} value={note} onChange={(e) => { setNote(e.target.value); setDirty(true); }} placeholder={'طول كيبل AC المشمول ٢٠ متراً.\nالتنصيب خلال ٣ أيام من الدفع.'} /></Field>
          </Card>
          <div className="qb-nav">
            <Button icon="arrowRight" onClick={() => go('items')}>السابق</Button>
            <span className="grow" />
            <Button variant="primary" icon="arrowLeft" onClick={() => go('review')}>التالي: المراجعة</Button>
          </div>
        </div>
      ) : null}

      {step === 'review' || locked ? (
        <div className="qb-review">
          <div className="qb-paper">
            {extras.loading && !extras.data ? <Skeleton h={600} r={12} /> : <A4Preview srcDoc={previewDoc || (locked ? previewSrcDoc(buildQuotationA4({ quotation: previewQuotation, items: previewItems, customer: customer ? { name: customer.name, phone: customer.phone } : null, store, invoice: invoiceCfg, extras: extras.data ?? {}, author, headerBrands })) : '')} />}
          </div>
          <div className="sx-stack qb-side">
            <Card title="الإجمالي" icon="receipt">
              <div className="totals">
                <div><span>مجموع البنود</span><span>{m(subtotal, currency)}</span></div>
                {!locked ? <div><span>خصم خاص</span><span style={{ width: 150 }}><MoneyInput value={discount || null} onChange={(v) => { setDiscount(v ?? 0); setDirty(true); }} currency={currency} size_="sm" ariaLabel="خصم العرض" /></span></div> : disc ? <div><span>خصم خاص</span><span>− {m(disc, currency)}</span></div> : null}
                <div className="grand"><span>الإجمالي</span><span>{m(total, currency)}</span></div>
              </div>
            </Card>
            <Card>
              <div className="stack">
                <Button variant="primary" size="lg" icon="printer" loading={save.busy} onClick={() => void saveAndPrint()}>{locked ? 'طباعة' : dirty || !q0 ? 'حفظ وطباعة' : 'طباعة'}</Button>
                {!locked ? <Button icon="check" loading={save.busy} onClick={() => void saveAndStay(q0?.status ?? 'draft')}>{q0 ? 'حفظ التعديلات' : 'حفظ كمسودة'}</Button> : null}
                <Button icon="whatsapp" onClick={async () => {
                  if (!locked && (dirty || !q0)) { const res = await saveAndStay(q0?.status && q0.status !== 'draft' ? q0.status : 'sent'); if (!res) return; }
                  else if (q0?.status === 'draft') await setQuotationStatus(q0.id, 'sent');
                  if (wa) window.open(wa, '_blank', 'noopener'); else { void navigator.clipboard?.writeText(waText); toast.success('نُسخ نص العرض'); }
                }}>{wa ? 'إرسال واتساب' : 'نسخ نص العرض'}</Button>
                {q0 && q0.status === 'sent' ? <Button icon="checkCircle" loading={accept.busy} onClick={() => void accept.run()}>قبِله الزبون</Button> : null}
                {q0 && !locked ? (
                  <>
                    <Button icon="receipt" variant={q0.status === 'accepted' ? 'ink' : 'default'} onClick={() => {
                      if (dirty) { toast.error('احفظ التعديلات أولاً.'); return; }
                      // العرض المنتهي يُحوَّل بأسعار اليوم: نطلب تحديث الصلاحية حتى يُجهَّز بنفس سعر العرض
                      if (expired) { toast.error('انتهت صلاحية العرض. حدّث «ساري حتى» من خطوة البيانات واحفظ، ثم جهّزه بنفس الأسعار.'); return; }
                      setPaying(true);
                    }}>تجهيز العرض (فاتورة بيع)</Button>
                    <span className="small dim">العرض لا يمس المخزون. عند التجهيز تُنشأ فاتورة بيع بنفس المكونات والأسعار ويُخصم من المخزن.</span>
                  </>
                ) : null}
              </div>
            </Card>
            {!locked ? <div className="qb-nav"><Button icon="arrowRight" onClick={() => go('features')}>السابق</Button></div> : null}
          </div>
        </div>
      ) : null}

      <CustomerPicker open={picking} allowCash={false} onClose={() => setPicking(false)} onPick={(c) => { if (c) { setCustomer(c); setDirty(true); } }} />
      {q0 ? (
        <PaymentModal open={paying} onClose={() => setPaying(false)} title={`تجهيز العرض ${q0.number}`} total={q0.total} currency={q0.currency} rate={q0.currency === 'USD' ? q0.exchange_rate : rate} usdEnabled={usd}
          customer={customer ? { name: customer.name, credit_limit: customer.credit_limit, balance: customer.balance } : null} busy={convert.busy}
          onConfirm={async (p) => { const res = await convert.run(p); if (res) { setPaying(false); void printInvoice(res.invoice_id, store, 'A4').catch(() => undefined); nav(`/invoices/${res.invoice_id}`); } }} />
      ) : null}
    </>
  );
}

// ------------------------------------------------------------------ تصفّح المنتجات

function ProductBrowser({ catalog, loading, error, onRetry, categories, brands, whName, priceOf, currency, lines, canPrice, onAdd }: {
  catalog: PosItem[] | null | undefined; loading: boolean; error: string | null; onRetry: () => void;
  categories: Parameters<typeof categoryOptions>[0]; brands: { id: string; name: string }[]; whName: string;
  priceOf: (it: PosItem) => number; currency: CurrencyCode; lines: Line[]; canPrice: boolean;
  onAdd: (it: PosItem, qty: number, unit: number) => void;
}) {
  const fmt = useFmt();
  const m = useMoney();
  const [cat, setCat] = useState('');
  const [brand, setBrand] = useState('');
  const [q, setQ] = useState('');
  const [inStock, setInStock] = useState(false);
  const [limit, setLimit] = useState(60);
  const [open, setOpen] = useState<PosItem | null>(null);
  useEffect(() => setLimit(60), [cat, brand, q, inStock]);
  const catIds = useMemo(() => (cat ? new Set(categoryWithChildren(categories, cat)) : null), [cat, categories]);
  const nq = normalizeArabic(q.trim());
  const list = useMemo(() => (catalog ?? []).filter((it) =>
    (!catIds || (it.category_id && catIds.has(it.category_id)))
    && (!brand || it.brand_id === brand)
    && (!inStock || it.stock > 0)
    && (!nq || normalizeArabic(it.search).includes(nq) || it.sku.toLowerCase().includes(q.trim().toLowerCase()) || it.barcode === q.trim())),
  [catalog, catIds, brand, inStock, nq, q]);
  // الشركات الموجودة في القسم المختار فقط (حتى لا تظهر شركة بلا منتجات)
  const brandOpts = useMemo(() => {
    const present = new Set((catalog ?? []).filter((it) => !catIds || (it.category_id && catIds.has(it.category_id))).map((it) => it.brand_id));
    return brands.filter((b) => present.has(b.id)).map((b) => ({ value: b.id, label: b.name }));
  }, [catalog, catIds, brands]);
  useEffect(() => { if (brand && !brandOpts.some((b) => b.value === brand)) setBrand(''); }, [brandOpts, brand]);
  const inOffer = (id: string) => lines.find((l) => l.variant_id === id);

  return (
    <div className="qb-browser">
      <div className="qb-filters">
        <Field label="القسم"><Select value={cat} onChange={(e) => setCat(e.target.value)} options={[{ value: '', label: 'كل الأقسام' }, ...categoryOptions(categories)]} /></Field>
        <Field label="الشركة"><Select value={brand} onChange={(e) => setBrand(e.target.value)} options={[{ value: '', label: 'كل الشركات' }, ...brandOpts]} /></Field>
        <Field label="بحث"><SearchInput value={q} onChange={setQ} placeholder="اسم المنتج، الموديل، SKU، الباركود…" /></Field>
      </div>
      <div className="qb-browse-meta">
        <span className="small dim">{loading && !catalog ? 'جارٍ تحميل المنتجات…' : `${fmt.num(list.length)} منتج${whName ? ` · مخزن ${whName}` : ''}`}</span>
        <Checkbox label="المتوفر فقط" checked={inStock} onChange={setInStock} />
      </div>
      {error && !catalog ? <ErrorState message={error} onRetry={onRetry} /> : loading && !catalog ? (
        <div className="qb-grid">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} h={210} r={16} />)}</div>
      ) : !list.length ? <EmptyState icon="search" title="لا منتجات بهذا الاختيار" text="غيّر القسم أو الشركة، أو امسح البحث." /> : (
        <>
          <div className="qb-grid">
            {list.slice(0, limit).map((it) => {
              const added = inOffer(it.variant_id);
              return (
                <button key={it.variant_id} type="button" className={`qb-card ${added ? 'added' : ''}`} onClick={() => setOpen(it)}>
                  <span className="qb-img"><Thumb imageKey={it.image_key} size="lg" />{added ? <span className="qb-in"><Icon name="check" size={13} /> {fmt.qty(added.qty)} في العرض</span> : null}</span>
                  <span className="qb-brand">{brands.find((b) => b.id === it.brand_id)?.name ?? ' '}</span>
                  <b className="qb-name">{it.name}</b>
                  {it.variant_title ? <span className="qb-var">{it.variant_title}</span> : null}
                  <span className="qb-foot"><b>{m(priceOf(it), currency)}</b><span className={it.stock > 0 ? 'qb-stock' : 'qb-stock out'}>{it.stock > 0 ? `متوفر ${fmt.qty(it.stock)}` : it.stock_all > 0 ? 'في مخزن آخر' : 'غير متوفر'}</span></span>
                </button>
              );
            })}
          </div>
          {list.length > limit ? <div style={{ textAlign: 'center', marginTop: 12 }}><Button onClick={() => setLimit((l) => l + 60)}>عرض المزيد ({fmt.num(list.length - limit)})</Button></div> : null}
        </>
      )}
      {open ? <AddItemModal it={open} brand={brands.find((b) => b.id === open.brand_id)?.name ?? null} unit0={inOffer(open.variant_id)?.unit_price ?? priceOf(open)} qty0={inOffer(open.variant_id)?.qty ?? 1}
        exists={!!inOffer(open.variant_id)} currency={currency} canPrice={canPrice} onClose={() => setOpen(null)} onAdd={(qty, unit) => { onAdd(open, qty, unit); setOpen(null); }} /> : null}
    </div>
  );
}

function AddItemModal({ it, brand, unit0, qty0, exists, currency, canPrice, onClose, onAdd }: {
  it: PosItem; brand: string | null; unit0: number; qty0: number; exists: boolean; currency: CurrencyCode; canPrice: boolean;
  onClose: () => void; onAdd: (qty: number, unit: number) => void;
}) {
  const fmt = useFmt();
  const m = useMoney();
  const [qty, setQty] = useState<number>(qty0);
  const [unit, setUnit] = useState<number>(unit0);
  const total = roundMoney(unit * (qty || 0), currency);
  const ok = qty >= 1 && unit >= 0;
  const submit = () => { if (ok) onAdd(qty, unit); };
  return (
    <Modal open onClose={onClose} title={exists ? 'تعديل البند' : 'إضافة للعرض'} width={520}
      footer={<><Button onClick={onClose}>إلغاء</Button><span className="grow" /><Button variant="primary" icon="check" disabled={!ok} onClick={submit}>{exists ? 'تحديث البند' : 'أضف للعرض'}</Button></>}>
      <div className="qb-add">
        <div className="qb-add-head">
          <Thumb imageKey={it.image_key} size="lg" />
          <div>
            {brand ? <div className="small" style={{ color: 'var(--accent)', fontWeight: 700 }}>{brand}</div> : null}
            <b style={{ fontSize: 17 }}>{it.name}</b>
            {it.variant_title ? <div className="small dim">{it.variant_title}</div> : null}
            <div className="small dim ltr" style={{ textAlign: 'right' }}>{it.sku}</div>
            <div className={it.stock > 0 ? 'qb-stock' : 'qb-stock out'} style={{ marginTop: 4, display: 'inline-block' }}>{it.stock > 0 ? `متوفر في المخزن: ${fmt.qty(it.stock)}` : it.stock_all > 0 ? `غير متوفر في هذا المخزن، ومتوفر في مخزن آخر (${fmt.qty(it.stock_all)}). غيّر المخزن من خطوة «البيانات».` : 'غير متوفر حالياً في أي مخزن'}</div>
          </div>
        </div>
        <div className="form-grid">
          <Field label="العدد">
            <div className="qb-qty">
              <IconButton icon="minus" label="إنقاص" variant="default" disabled={qty <= 1} onClick={() => setQty((x) => Math.max(1, (x || 1) - 1))} />
              <NumberInput value={qty} onChange={(v) => setQty(Math.max(1, v ?? 1))} min={1} autoFocus onEnter={submit} ariaLabel="العدد" />
              <IconButton icon="plus" label="زيادة" variant="default" onClick={() => setQty((x) => (x || 0) + 1)} />
            </div>
          </Field>
          <Field label="سعر القطعة" hint={canPrice ? 'يمكنك تعديله لهذا العرض' : undefined}>
            {canPrice ? <MoneyInput value={unit} onChange={(v) => setUnit(v ?? 0)} currency={currency} onEnter={submit} ariaLabel="سعر القطعة" /> : <div className="qb-unit">{m(unit, currency)}</div>}
          </Field>
        </div>
        {qty > it.stock && it.stock >= 0 ? <Alert tone="warning">العدد أكبر من المتوفر ({fmt.qty(Math.max(0, it.stock))}). يمكنك إضافته للعرض، ويُتحقق من المخزون عند التحويل لفاتورة.</Alert> : null}
        <div className="qb-add-total"><span>{fmt.qty(qty || 0)} × {m(unit, currency)}</span><b>{m(total, currency)}</b></div>
      </div>
    </Modal>
  );
}

// ------------------------------------------------------------------ المميزات

function FeaturesEditor({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const suggestions = useLoad(() => recentQuotationFeatures(), []);
  const [draft, setDraft] = useState('');
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const add = (text: string) => {
    const t = text.trim();
    if (!t) return;
    if (value.length >= 40) { toast.error('٤٠ ميزة كحد أقصى.'); return; }
    if (value.some((x) => x.trim() === t)) { toast.error('هذه الميزة مضافة.'); return; }
    onChange([...value, t]);
  };
  const set = (i: number, t: string) => onChange(value.map((x, j) => (j === i ? t : x)));
  const move = (i: number, d: -1 | 1) => { const a = [...value]; const j = i + d; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; onChange(a); };
  const sugg = (suggestions.data ?? []).filter((s) => !value.some((x) => x.trim() === s));
  return (
    <Card title="مميزات العرض" icon="star">
      <p className="small dim" style={{ marginTop: 0 }}>نقاط تُطبع بارزة في أعلى العرض تحت «ماذا يقدّم لك هذا العرض». اكتب ما يهم الزبون: القدرة، التشغيل، الضمانات، التنصيب.</p>
      {value.length ? (
        <ol className="qb-feats">
          {value.map((f, i) => (
            <li key={i}>
              <span className="qb-fdot"><Icon name="check" size={13} /></span>
              <Input ref={(el) => { inputs.current[i] = el; }} value={f} maxLength={300} onChange={(e) => set(i, e.target.value)} aria-label={`الميزة ${i + 1}`} />
              <IconButton icon="chevronUp" size="sm" label="للأعلى" disabled={i === 0} onClick={() => move(i, -1)} />
              <IconButton icon="chevronDown" size="sm" label="للأسفل" disabled={i === value.length - 1} onClick={() => move(i, 1)} />
              <IconButton icon="trash" size="sm" label="حذف" onClick={() => onChange(value.filter((_, j) => j !== i))} />
            </li>
          ))}
        </ol>
      ) : null}
      <div className="qb-fadd">
        <Input value={draft} maxLength={300} onChange={(e) => setDraft(e.target.value)} placeholder="مثال: يجهزك بـ ١٠ أمبير نهاراً و٥ أمبير ليلاً"
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(draft); setDraft(''); } }} />
        <Button icon="plus" disabled={!draft.trim()} onClick={() => { add(draft); setDraft(''); }}>إضافة</Button>
      </div>
      {sugg.length ? (
        <div className="qb-sugg">
          <span className="small dim">من عروضك السابقة:</span>
          {sugg.map((s) => <button key={s} type="button" className="chip" onClick={() => add(s)}><Icon name="plus" size={13} /> {s}</button>)}
        </div>
      ) : null}
    </Card>
  );
}

// ------------------------------------------------------------------ معاينة A4

function A4Preview({ srcDoc }: { srcDoc: string }) {
  const wrap = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const [scale, setScale] = useState(1);
  const [height, setHeight] = useState(1123);
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setScale(Math.min(1, el.clientWidth / 794)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const measure = () => {
    const d = frame.current?.contentDocument;
    if (!d) return;
    const h = Math.max(1123, d.documentElement.scrollHeight);
    setHeight(h);
    // الصور تُحمّل بعد الحدث: نقيس مجدداً
    Array.from(d.images).forEach((im) => { if (!im.complete) im.onload = () => setHeight(Math.max(1123, d.documentElement.scrollHeight)); });
  };
  return (
    <div className="qb-a4" ref={wrap} style={{ height: height * scale }}>
      <iframe ref={frame} title="معاينة العرض" srcDoc={srcDoc} onLoad={measure} style={{ width: 794, height, transform: `scale(${scale})` }} />
    </div>
  );
}
