import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { marginRatio, MOVEMENT_KIND, SERIAL_STATUS, type SerialStatus } from '@raqeem/shared';
import {
  Alert, Badge, Barcode, Button, Card, EmptyState, ErrorState, Field, Icon, IconButton, Input, Menu, MoneyInput, NumberInput, PageHeader, QrCode, Select, Skeleton, Switch,
  Tabs, Textarea, askConfirm, toast,
} from '../../ui';
import { useAuth } from '../../lib/auth';
import { IS_DEMO } from '../../lib/env';
import { useAction, useLoad } from '../../lib/hooks';
import { useFmt } from '../../lib/settings';
import { imgUrl, uploadImage } from '../../lib/media';
import { errorMessage } from '../../lib/supabase';
import { addSerials, archiveProduct, getProduct, listSerials, nextBarcode, setSerialStatus, skuPrefix, skuSeqStart, suggestSku, upsertProduct } from './api';
import { categoryOptions, useCatalogMeta, useUnsavedGuard } from './components/hooks';
import { LabelPrintModal } from './components/LabelPrintModal';
import {
  emptyDraft, hasErrors, localKey, rebuildVariants, toDraft, toPayload, validate, DEFAULT_TITLE,
  type DraftErrors, type ProductDraft, type TabKey, type VariantDraft,
} from './components/productDraft';
import type { LabelItem } from './labels';
import { productStock } from '../inventory/api';
import { productLots } from '../inventory/api-extra';
import { AdjustModal, type AdjustTarget } from '../inventory/components/AdjustModal';
import './catalog.css';

type Setter = (fn: (d: ProductDraft) => ProductDraft) => void;
interface TabProps { d: ProductDraft; set: Setter; errors: DraftErrors; tried: boolean; withCosts: boolean; readOnly: boolean }

export default function ProductForm() {
  const { id } = useParams();
  const fmt = useFmt();
  const isNew = !id || id === 'new';
  const nav = useNavigate();
  const { can } = useAuth();
  const withCosts = can('costs.view');
  const readOnly = !can('products.write');
  const loaded = useLoad(() => (isNew ? Promise.resolve(null) : getProduct(id!, withCosts)), [id, withCosts]);
  const [d, setD] = useState<ProductDraft>(emptyDraft);
  const [initial, setInitial] = useState('');
  const [tab, setTab] = useState<TabKey>('basic');
  const [tried, setTried] = useState(false);
  const save = useAction(upsertProduct);

  useEffect(() => {
    if (isNew) { const e = emptyDraft(); setD(e); setInitial(JSON.stringify(e)); return; }
    if (loaded.data) { const x = toDraft(loaded.data); setD(x); setInitial(JSON.stringify(x)); }
  }, [loaded.data, isNew]);

  const set: Setter = (fn) => setD((cur) => fn(cur));
  const dirty = initial !== '' && JSON.stringify(d) !== initial;
  const guard = useUnsavedGuard(dirty && !readOnly);
  const errors = useMemo(() => validate(d), [d]);

  const submit = async () => {
    setTried(true);
    if (hasErrors(errors)) {
      const first = (Object.keys(errors.byTab) as TabKey[])[0];
      if (first) setTab(first);
      toast.error('راجع الحقول المعلَّمة بالأحمر قبل الحفظ.');
      return;
    }
    const newId = await save.run(toPayload(d, withCosts));
    if (!newId) return;
    toast.success(isNew ? 'أُضيف المنتج' : 'حُفظ المنتج');
    setInitial(JSON.stringify(d));
    if (isNew) { setTimeout(() => nav(`/products/${newId}`, { replace: true }), 0); }
    else void loaded.reload();
  };

  if (!isNew && loaded.error) return <ErrorState message={loaded.error} onRetry={loaded.reload} />;
  if (!isNew && !loaded.data) return <div className="stack"><Skeleton h={42} w={280} /><Skeleton h={320} /></div>;

  const p: TabProps = { d, set, errors, tried, withCosts, readOnly };
  const tabs: { value: TabKey; label: ReactNode; icon?: Parameters<typeof Tabs>[0]['items'][number]['icon'] }[] = [
    { value: 'basic', label: 'الأساسي' },
    { value: 'images', label: 'الصور' },
    { value: 'pricing', label: 'الأسعار والخيارات' },
    { value: 'stock', label: 'المخزون' },
    { value: 'specs', label: 'المواصفات' },
    ...(d.track_serials ? [{ value: 'serials' as const, label: 'الأرقام التسلسلية' }] : []),
    { value: 'store', label: 'المتجر' },
    { value: 'codes', label: 'الباركود و QR' },
  ];

  return (
    <>
      <PageHeader
        crumbs={[{ label: 'المنتجات', to: '/products' }, { label: isNew ? 'منتج جديد' : d.name || 'المنتج' }]}
        title={isNew ? 'منتج جديد' : loaded.data?.product.name ?? ''}
        description={!isNew && loaded.data?.product.archived_at ? <Badge tone="neutral">مؤرشف — لا يظهر في المتجر ولا نقطة البيع</Badge> : undefined}
        actions={!isNew && !readOnly ? (
          <Menu trigger={(open) => <Button icon="more" onClick={open}>المزيد</Button>} items={[
            { label: 'نسخ كمنتج جديد', icon: 'copy', onClick: () => { const c: ProductDraft = { ...d, id: undefined, name: `${d.name} (نسخة)`, slug: '', variants: d.variants.map((v) => ({ ...v, id: undefined, k: localKey(), sku: `${v.sku}-C`, barcode: '', units: v.units.map((u) => ({ ...u, id: undefined, barcode: null })), opening: {} })) }; nav('/products/new'); setTimeout(() => setD(c), 50); } },
            {
              label: loaded.data?.product.archived_at ? 'استرجاع من الأرشيف' : 'أرشفة المنتج', icon: 'trash', danger: !loaded.data?.product.archived_at,
              onClick: async () => {
                const arch = !loaded.data?.product.archived_at;
                if (arch && !(await askConfirm({ title: 'أرشفة المنتج؟', body: 'يختفي من المتجر ونقطة البيع، وتبقى حركاته وفواتيره.', danger: true, confirm: 'أرشفة' }))) return;
                try { await archiveProduct(id!, arch); toast.success(arch ? 'أُرشف المنتج' : 'استُرجع المنتج'); void loaded.reload(); } catch (e) { toast.error(errorMessage(e)); }
              },
            },
          ]} />
        ) : undefined}
      />
      {readOnly ? <Alert tone="info">تعرض المنتج للقراءة فقط. التعديل يحتاج صلاحية «تعديل المنتجات».</Alert> : null}
      <Tabs value={tab} onChange={setTab} items={tabs.map((t) => ({ ...t, label: <>{t.label}{tried && errors.byTab[t.value] ? <span className="tab-err">{fmt.num(errors.byTab[t.value]!)}</span> : null}</> }))} />
      <div className="form-layout" style={{ marginTop: 16 }}>
        <div className="stack">
          {tab === 'basic' ? <BasicTab {...p} /> : null}
          {tab === 'images' ? <ImagesTab {...p} /> : null}
          {tab === 'pricing' ? <PricingTab {...p} /> : null}
          {tab === 'stock' ? <StockTab {...p} isNew={isNew} /> : null}
          {tab === 'specs' ? <SpecsTab {...p} /> : null}
          {tab === 'serials' ? <SerialsTab {...p} /> : null}
          {tab === 'store' ? <StoreTab {...p} /> : null}
          {tab === 'codes' ? <CodesTab {...p} /> : null}
        </div>
        <aside className="aside">
          <SummaryCard d={d} />
        </aside>
      </div>
      {!readOnly ? (
        <div className="save-bar">
          <Button variant="primary" size="lg" icon="check" loading={save.busy} onClick={submit} kbd="Ctrl+S">{isNew ? 'إضافة المنتج' : 'حفظ المنتج'}</Button>
          <Button size="lg" onClick={async () => { if (await guard()) nav('/products'); }}>إلغاء</Button>
          {dirty ? <span className="dirty"><Icon name="info" size={15} />تغييرات لم تُحفظ</span> : null}
        </div>
      ) : null}
      <SaveHotkey onSave={submit} enabled={!readOnly} />
    </>
  );
}

function SaveHotkey({ onSave, enabled }: { onSave: () => void; enabled: boolean }) {
  const ref = useRef(onSave);
  ref.current = onSave;
  useEffect(() => {
    if (!enabled) return;
    const h = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); ref.current(); } };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [enabled]);
  return null;
}

// ------------------------------------------------------------------ الأساسي

function BasicTab({ d, set, errors, tried, readOnly }: TabProps) {
  const meta = useCatalogMeta();
  const [tag, setTag] = useState('');
  const addTag = () => { const t = tag.trim(); if (t && !d.tags.includes(t)) set((x) => ({ ...x, tags: [...x.tags, t] })); setTag(''); };
  return (
    <Card>
      <fieldset disabled={readOnly} className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
        <Field label="اسم المنتج" required error={tried ? errors.name : null}>
          <Input value={d.name} autoFocus={!d.id} onChange={(e) => { const v = e.target.value; set((x) => ({ ...x, name: v })); }} placeholder="مثلاً: سماعة بلوتوث JBL Tune 510" />
        </Field>
        <div className="grid-2">
          <Field label="القسم">
            <Select value={d.category_id} onChange={(e) => { const v = e.target.value; set((x) => ({ ...x, category_id: v })); }} placeholder="بلا قسم" options={categoryOptions(meta.categories)} />
          </Field>
          <Field label="العلامة التجارية">
            <Select value={d.brand_id} onChange={(e) => { const v = e.target.value; set((x) => ({ ...x, brand_id: v })); }} placeholder="بلا علامة" options={meta.brands.map((b) => ({ value: b.id, label: b.name }))} />
          </Field>
          <Field label="وحدة البيع" hint="قطعة، علبة، كيلو، متر…">
            <Input value={d.unit} onChange={(e) => { const v = e.target.value; set((x) => ({ ...x, unit: v })); }} />
          </Field>
          <Field label="الرابط في المتجر" hint="اتركه فارغاً ليُولَّد من الاسم">
            <Input value={d.slug} dir="ltr" onChange={(e) => { const v = e.target.value; set((x) => ({ ...x, slug: v })); }} placeholder="jbl-tune-510" />
          </Field>
        </div>
        <Field label="الوصف" hint="يظهر في صفحة المنتج بالتطبيق. سطر فارغ يبدأ فقرة جديدة.">
          <Textarea rows={5} value={d.description} onChange={(e) => { const v = e.target.value; set((x) => ({ ...x, description: v })); }} />
        </Field>
        <Field label="الوسوم" hint="كلمات تساعد البحث: «لاسلكي»، «هدية»… اضغط Enter بعد كل وسم">
          <div className="tag-input">
            {d.tags.map((t) => <span key={t} className="tag-chip">{t}<button type="button" aria-label={`حذف ${t}`} onClick={() => set((x) => ({ ...x, tags: x.tags.filter((y) => y !== t) }))}><Icon name="close" size={13} /></button></span>)}
            <input value={tag} onChange={(e) => setTag(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTag(); } else if (e.key === 'Backspace' && !tag && d.tags.length) set((x) => ({ ...x, tags: x.tags.slice(0, -1) })); }} onBlur={addTag} placeholder="أضف وسماً…" />
          </div>
        </Field>
        <div className="grid-2">
          <Switch label="تتبع الصلاحية" hint="دفعات بتواريخ انتهاء، ويُباع الأقرب انتهاءً أولاً" checked={d.track_expiry} onChange={(v) => set((x) => ({ ...x, track_expiry: v }))} />
          <Switch label="تتبع الأرقام التسلسلية" hint="للأجهزة: رقم لكل قطعة عند الشراء والبيع" checked={d.track_serials} onChange={(v) => set((x) => ({ ...x, track_serials: v }))} />
        </div>
      </fieldset>
    </Card>
  );
}

// ------------------------------------------------------------------ الصور

function ImagesTab({ d, set, readOnly }: TabProps) {
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(0);
  const [drag, setDrag] = useState<number | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const owner = useMemo(() => d.id ?? (crypto.randomUUID?.() ?? localKey()), [d.id]);
  const add = async (files: FileList | null) => {
    if (!files?.length) return;
    const list = [...files].filter((f) => f.type.startsWith('image/'));
    setBusy((b) => b + list.length);
    for (const f of list) {
      try { const key = await uploadImage(f, 'products', owner); set((x) => ({ ...x, images: [...x.images, { key, alt: x.name || null }] })); }
      catch (e) { toast.error(errorMessage(e)); }
      finally { setBusy((b) => b - 1); }
    }
  };
  const move = (from: number, to: number) => set((x) => { const a = [...x.images]; const [m] = a.splice(from, 1); a.splice(to, 0, m); return { ...x, images: a }; });
  return (
    <Card title="صور المنتج" actions={!readOnly ? <Button size="sm" icon="upload" onClick={() => file.current?.click()}>رفع صور</Button> : null}>
      <input ref={file} type="file" accept="image/*" multiple hidden onChange={(e) => { void add(e.target.files); e.target.value = ''; }} />
      <p className="small dim" style={{ marginTop: 0 }}>الصورة الأولى هي الغلاف في المتجر. اسحب الصور لترتيبها. تُضغط تلقائياً قبل الرفع.</p>
      {!d.images.length && !busy ? (
        <div className="dropzone" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); if (!readOnly) void add(e.dataTransfer.files); }} onClick={() => !readOnly && file.current?.click()} role="button" tabIndex={0}>
          <EmptyState icon="image" title="لا صور بعد" text="اسحب الصور هنا أو اضغط للاختيار. يُفضَّل خلفية فاتحة ومقاس مربع." />
        </div>
      ) : (
        <div className="img-grid" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { if (e.dataTransfer.files.length && !readOnly) { e.preventDefault(); void add(e.dataTransfer.files); } }}>
          {d.images.map((im, i) => (
            <div key={im.key} className={`img-tile ${drag === i ? 'dragging' : ''} ${over === i ? 'over' : ''}`} draggable={!readOnly}
              onDragStart={() => setDrag(i)} onDragEnter={() => setOver(i)} onDragEnd={() => { setDrag(null); setOver(null); }}
              onDrop={(e) => { e.preventDefault(); if (drag !== null && drag !== i) move(drag, i); setDrag(null); setOver(null); }}>
              <img src={imgUrl(im.key, 'sm') ?? ''} alt={im.alt ?? ''} />
              {i === 0 ? <span className="cover"><Badge tone="accent">الغلاف</Badge></span> : null}
              {!readOnly ? (
                <span className="tools">
                  {i > 0 ? <IconButton size="sm" icon="star" label="اجعلها الغلاف" onClick={() => move(i, 0)} /> : null}
                  <IconButton size="sm" icon="trash" label="حذف الصورة" onClick={() => set((x) => ({ ...x, images: x.images.filter((_, j) => j !== i) }))} />
                </span>
              ) : null}
            </div>
          ))}
          {Array.from({ length: busy }, (_, i) => <div key={`b${i}`} className="img-tile busy"><span className="spinner" /></div>)}
        </div>
      )}
    </Card>
  );
}

// ------------------------------------------------------------------ الأسعار والخيارات

function PricingTab({ d, set, errors, tried, withCosts, readOnly }: TabProps) {
  const fmt = useFmt();
  const meta = useCatalogMeta();
  const [val, setVal] = useState<Record<number, string>>({});
  const setOptions = (fn: (o: ProductDraft['options']) => ProductDraft['options']) => set((x) => { const n = { ...x, options: fn(x.options) }; return { ...n, variants: rebuildVariants(n) }; });
  const upd = (k: string, patch: Partial<VariantDraft>) => set((x) => ({ ...x, variants: x.variants.map((v) => (v.k === k ? { ...v, ...patch } : v)) }));
  const fillSkus = async () => {
    let n = await skuSeqStart();
    const prefix = skuPrefix(meta.categories.find((c) => c.id === d.category_id));
    set((x) => ({ ...x, variants: x.variants.map((v) => (v.sku.trim() ? v : { ...v, sku: suggestSku(prefix, n++) })) }));
  };
  const genBarcodes = async () => {
    try {
      const need = d.variants.filter((v) => !v.barcode.trim());
      const codes: string[] = [];
      for (let i = 0; i < need.length; i++) codes.push(await nextBarcode());
      set((x) => { let i = 0; return { ...x, variants: x.variants.map((v) => (v.barcode.trim() ? v : { ...v, barcode: codes[i++] ?? '' })) }; });
    } catch (e) { toast.error(errorMessage(e)); }
  };
  const applyAll = (field: 'price' | 'compare_at_price' | 'wholesale_price' | 'cost' | 'min_stock') => {
    const first = d.variants[0]?.[field] ?? null;
    set((x) => ({ ...x, variants: x.variants.map((v) => ({ ...v, [field]: first })) }));
  };
  const multi = d.variants.length > 1;
  return (
    <>
      <Card title="الخيارات" icon="sliders" actions={!readOnly && d.options.length < 3 ? <Button size="sm" icon="plus" onClick={() => setOptions((o) => [...o, { name: o.length ? 'المقاس' : 'اللون', values: [] }])}>إضافة خيار</Button> : null}>
        {!d.options.length ? <p className="dim small" style={{ margin: 0 }}>منتج بسيط بسعر واحد. أضف خياراً (اللون، المقاس، السعة…) إن كان له نسخ.</p> : null}
        <div className="stack-sm">
          {d.options.map((o, i) => (
            <div key={i} className="opt-row">
              <Input value={o.name} disabled={readOnly} aria-label="اسم الخيار" onChange={(e) => { const v = e.target.value; setOptions((all) => all.map((x, j) => (j === i ? { ...x, name: v } : x))); }} />
              <div className="tag-input">
                {o.values.map((v) => <span key={v} className="tag-chip">{v}{!readOnly ? <button type="button" aria-label={`حذف ${v}`} onClick={() => setOptions((all) => all.map((x, j) => (j === i ? { ...x, values: x.values.filter((y) => y !== v) } : x)))}><Icon name="close" size={13} /></button> : null}</span>)}
                {!readOnly ? <input value={val[i] ?? ''} placeholder="اكتب قيمة ثم Enter" onChange={(e) => setVal({ ...val, [i]: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key !== 'Enter' && e.key !== ',') return;
                    e.preventDefault();
                    const v = (val[i] ?? '').trim();
                    if (v && !o.values.includes(v)) setOptions((all) => all.map((x, j) => (j === i ? { ...x, values: [...x.values, v] } : x)));
                    setVal({ ...val, [i]: '' });
                  }} /> : null}
              </div>
              {!readOnly ? <IconButton icon="trash" label="حذف الخيار" onClick={() => setOptions((all) => all.filter((_, j) => j !== i))} /> : null}
            </div>
          ))}
        </div>
        {tried && errors.options ? <div className="small" style={{ color: 'var(--danger)', fontWeight: 700, marginTop: 8 }}>{errors.options}</div> : null}
      </Card>
      <Card title={multi ? `النسخ (${fmt.num(d.variants.length)})` : 'السعر والرمز'} icon="tag" actions={!readOnly ? <>
        <Button size="sm" onClick={fillSkus}>توليد SKU</Button>
        <Button size="sm" icon="barcode" onClick={genBarcodes}>توليد باركود</Button>
      </> : null}>
        <div className="vtable-scroll">
          <table className="vtable">
            <thead>
              <tr>
                {multi ? <th>النسخة</th> : null}
                <th>SKU</th><th>الباركود</th>
                <th>السعر {multi && !readOnly ? <button type="button" className="link-btn small" style={{ marginInlineStart: 6 }} onClick={() => applyAll('price')}>نسخ للكل</button> : null}</th>
                <th>قبل الخصم</th><th>الجملة</th>
                {withCosts ? <th>التكلفة</th> : null}
                <th>حد التنبيه</th>
                {multi ? <th>فعّالة</th> : null}
              </tr>
            </thead>
            <tbody>
              {d.variants.map((v) => {
                const e = tried ? errors.variants[v.k] : undefined;
                const m = withCosts && v.cost !== null && v.price ? marginRatio(v.price, v.cost) : null;
                return (
                  <tr key={v.k} className={v.is_active ? '' : 'inactive'}>
                    {multi ? <td style={{ minWidth: 110 }}><b>{v.title}</b>{!v.is_active && v.id && !Object.keys(v.options).every((n) => d.options.some((o) => o.name === n)) ? <div className="small faint">خارج الخيارات</div> : null}</td> : null}
                    <td className="w-sku"><Input value={v.sku} disabled={readOnly} dir="ltr" onChange={(ev) => upd(v.k, { sku: ev.target.value })} aria-label="SKU" />{e?.sku ? <div className="err">{e.sku}</div> : null}</td>
                    <td className="w-bar"><Input value={v.barcode} disabled={readOnly} dir="ltr" data-scan-target="keep" onChange={(ev) => upd(v.k, { barcode: ev.target.value })} placeholder="امسح أو اكتب" aria-label="الباركود" />{e?.barcode ? <div className="err">{e.barcode}</div> : null}</td>
                    <td className="w-money"><MoneyInput value={v.price} disabled={readOnly} onChange={(n) => upd(v.k, { price: n })} ariaLabel="السعر" />{e?.price ? <div className="err">{e.price}</div> : null}</td>
                    <td className="w-money"><MoneyInput value={v.compare_at_price} disabled={readOnly} onChange={(n) => upd(v.k, { compare_at_price: n })} ariaLabel="السعر قبل الخصم" /></td>
                    <td className="w-money"><MoneyInput value={v.wholesale_price} disabled={readOnly} onChange={(n) => upd(v.k, { wholesale_price: n })} ariaLabel="سعر الجملة" /></td>
                    {withCosts ? (
                      <td className="w-money"><MoneyInput value={v.cost} disabled={readOnly} onChange={(n) => upd(v.k, { cost: n })} ariaLabel="التكلفة" />
                        {m !== null ? <div className="margin" style={{ color: m < 0 ? 'var(--danger)' : m < 0.1 ? 'var(--warning)' : 'var(--success)' }}>هامش {fmt.num(Math.round(m * 100))}٪</div> : null}</td>
                    ) : null}
                    <td className="w-qty"><NumberInput value={v.min_stock} disabled={readOnly} onChange={(n) => upd(v.k, { min_stock: n })} min={0} ariaLabel="حد التنبيه" /></td>
                    {multi ? <td><Switch checked={v.is_active} disabled={readOnly} onChange={(b) => upd(v.k, { is_active: b })} /></td> : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}

// ------------------------------------------------------------------ المخزون

function StockTab({ d, set, isNew, readOnly }: TabProps & { isNew: boolean }) {
  const fmt = useFmt();
  const meta = useCatalogMeta();
  const { can } = useAuth();
  const ids = d.variants.filter((v) => v.id).map((v) => v.id!);
  const stock = useLoad(() => (ids.length ? productStock(ids) : Promise.resolve({ levels: [], movements: [] })), [ids.join(',')]);
  const lots = useLoad(() => (d.track_expiry && ids.length ? productLots(ids) : Promise.resolve([])), [ids.join(','), d.track_expiry]);
  const [adj, setAdj] = useState<{ target: AdjustTarget; wh: string } | null>(null);
  const newVariants = d.variants.filter((v) => !v.id);
  const setOpen = (k: string, wh: string, patch: Partial<VariantDraft['opening'][string]>) => set((x) => ({
    ...x, variants: x.variants.map((v) => (v.k === k ? { ...v, opening: { ...v.opening, [wh]: { ...{ qty: null, lot_code: '', expiry_date: '' }, ...v.opening[wh], ...patch } } } : v)),
  }));
  const vt = (v: VariantDraft) => (v.title === DEFAULT_TITLE ? d.name || 'المنتج' : v.title);
  return (
    <>
      {newVariants.length && !readOnly ? (
        <Card title={isNew ? 'الرصيد الافتتاحي' : 'رصيد افتتاحي للنسخ الجديدة'} icon="stockIn">
          <p className="small dim" style={{ marginTop: 0 }}>الكمية الموجودة الآن في كل مخزن. تُسجَّل حركة «رصيد افتتاحي»{can('costs.view') ? ' بالتكلفة المكتوبة في تبويب الأسعار' : ''}.</p>
          <div className="scroll-x">
            <table className="table-plain">
              <thead><tr><th>النسخة</th>{meta.warehouses.map((w) => <th key={w.id}>{w.name}</th>)}</tr></thead>
              <tbody>
                {newVariants.map((v) => (
                  <tr key={v.k}>
                    <td><b>{vt(v)}</b></td>
                    {meta.warehouses.map((w) => (
                      <td key={w.id} style={{ minWidth: d.track_expiry ? 220 : 100 }}>
                        <NumberInput value={v.opening[w.id]?.qty ?? null} onChange={(n) => setOpen(v.k, w.id, { qty: n })} allowDecimal min={0} ariaLabel={`الكمية في ${w.name}`} />
                        {d.track_expiry && (v.opening[w.id]?.qty ?? 0) > 0 ? (
                          <div className="row" style={{ gap: 4, marginTop: 4 }}>
                            <Input value={v.opening[w.id]?.lot_code ?? ''} onChange={(e) => setOpen(v.k, w.id, { lot_code: e.target.value })} placeholder="رقم الدفعة" aria-label="رقم الدفعة" />
                            <Input type="date" value={v.opening[w.id]?.expiry_date ?? ''} onChange={(e) => setOpen(v.k, w.id, { expiry_date: e.target.value })} aria-label="تاريخ الانتهاء" />
                          </div>
                        ) : null}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}
      {ids.length ? (
        <Card title="الرصيد في المخازن" icon="warehouse">
          {stock.error ? <ErrorState message={stock.error} onRetry={stock.reload} /> : !stock.data ? <Skeleton h={120} /> : (
            <div className="scroll-x">
              <table className="table-plain">
                <thead><tr><th>النسخة</th>{meta.warehouses.map((w) => <th key={w.id} className="end">{w.name}</th>)}</tr></thead>
                <tbody>
                  {d.variants.filter((v) => v.id).map((v) => (
                    <tr key={v.k}>
                      <td><b>{vt(v)}</b> <span className="code faint">{v.sku}</span></td>
                      {meta.warehouses.map((w) => {
                        const l = stock.data!.levels.find((x) => x.variant_id === v.id && x.warehouse_id === w.id);
                        return (
                          <td key={w.id} className="end">
                            <span className={(l?.qty ?? 0) <= 0 ? 'qty-neg' : 'num'}>{fmt.qty(l?.qty ?? 0)}</span>
                            {l?.reserved ? <span className="small faint"> ({fmt.qty(l.reserved)} محجوز)</span> : null}
                            {can('inventory.adjust') ? <IconButton size="sm" icon="adjust" label="تعديل الرصيد" onClick={() => setAdj({ target: { variant_id: v.id!, name: d.name, title: v.title === DEFAULT_TITLE ? null : v.title, sku: v.sku, cover_key: d.images[0]?.key }, wh: w.id })} /> : null}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : null}
      {d.track_expiry && ids.length ? (
        <Card title="الدفعات والصلاحية" icon="clock">
          {!lots.data ? <Skeleton h={60} /> : !lots.data.length ? <p className="dim small" style={{ margin: 0 }}>لا دفعات برصيد. تُنشأ الدفعات عند الشراء أو الإدخال برقم دفعة وتاريخ.</p> : (
            <table className="table-plain">
              <thead><tr><th>الدفعة</th><th>المخزن</th><th>الانتهاء</th><th className="end">الكمية</th></tr></thead>
              <tbody>{lots.data.map((l) => (
                <tr key={l.id}><td className="code">{l.lot_code}</td><td>{l.warehouse_name}</td>
                  <td>{l.expiry_date ? <>{fmt.date(l.expiry_date)} {l.days_left !== null && l.days_left < 0 ? <Badge tone="danger">منتهية</Badge> : l.days_left !== null && l.days_left <= 30 ? <Badge tone="warning">{fmt.count(l.days_left, { one: 'يوم', two: 'يومان', few: 'أيام', many: 'يوماً', zero: 'اليوم' })}</Badge> : null}</> : '—'}</td>
                  <td className="end num">{fmt.qty(l.qty)}</td></tr>
              ))}</tbody>
            </table>
          )}
        </Card>
      ) : null}
      {ids.length ? (
        <Card title="آخر الحركات" icon="activity">
          {!stock.data ? <Skeleton h={80} /> : !stock.data.movements.length ? <p className="dim small" style={{ margin: 0 }}>لا حركات بعد.</p> : (
            <div className="scroll-x">
              <table className="table-plain">
                <thead><tr><th>الوقت</th><th>النوع</th><th>المخزن</th><th className="end">الكمية</th><th className="end">الرصيد بعدها</th><th>بواسطة</th></tr></thead>
                <tbody>{stock.data.movements.slice(0, 15).map((m) => (
                  <tr key={m.id}><td>{fmt.date(m.created_at, true)}</td><td><Badge tone={MOVEMENT_KIND[m.kind].tone}>{MOVEMENT_KIND[m.kind].label}</Badge></td><td>{m.warehouse_name}</td>
                    <td className={`end ${m.qty > 0 ? 'qty-pos' : 'qty-neg'}`}>{m.qty > 0 ? '+' : ''}{fmt.qty(m.qty)}</td><td className="end num">{fmt.qty(m.balance_after)}</td><td className="dim">{m.staff_name ?? '—'}</td></tr>
                ))}</tbody>
              </table>
            </div>
          )}
        </Card>
      ) : !newVariants.length ? <EmptyState icon="layers" title="لا نسخ محفوظة" /> : null}
      {adj ? <AdjustModal open onClose={() => setAdj(null)} target={adj.target} warehouseId={adj.wh} onDone={() => void stock.reload()} /> : null}
    </>
  );
}

// ------------------------------------------------------------------ المواصفات

function SpecsTab({ d, set, readOnly }: TabProps) {
  const upd = (i: number, patch: Partial<ProductDraft['specs'][number]>) => set((x) => ({ ...x, specs: x.specs.map((s, j) => (j === i ? { ...s, ...patch } : s)) }));
  const SUGGEST = ['الموديل', 'اللون', 'المادة', 'الأبعاد', 'الوزن', 'السعة', 'البطارية', 'بلد المنشأ'];
  return (
    <Card title="المواصفات" icon="list" actions={!readOnly ? <Button size="sm" icon="plus" onClick={() => set((x) => ({ ...x, specs: [...x.specs, { label: '', value: '' }] }))}>إضافة سطر</Button> : null}>
      <fieldset disabled={readOnly} className="stack-sm" style={{ border: 0, padding: 0, margin: 0 }}>
        {!d.specs.length ? <p className="dim small" style={{ margin: 0 }}>جدول يظهر في صفحة المنتج: «الموديل: Tune 510»، «البطارية: ٤٠ ساعة»…</p> : null}
        {d.specs.map((s, i) => (
          <div key={i} className="row nowrap" style={{ gap: 8 }}>
            <Input value={s.label} onChange={(e) => upd(i, { label: e.target.value })} placeholder="الخاصية" aria-label="الخاصية" style={{ maxWidth: 200 }} list="spec-labels" />
            <Input value={s.value} onChange={(e) => upd(i, { value: e.target.value })} placeholder="القيمة" aria-label="القيمة" />
            <IconButton icon="trash" label="حذف" onClick={() => set((x) => ({ ...x, specs: x.specs.filter((_, j) => j !== i) }))} />
          </div>
        ))}
        <datalist id="spec-labels">{SUGGEST.map((s) => <option key={s} value={s} />)}</datalist>
        <Field label="الضمان" hint="مثلاً: سنة من الوكيل">
          <Input value={d.warranty} onChange={(e) => { const v = e.target.value; set((x) => ({ ...x, warranty: v })); }} />
        </Field>
      </fieldset>
    </Card>
  );
}

// ------------------------------------------------------------------ الأرقام التسلسلية

function SerialsTab({ d, readOnly: ro }: TabProps) {
  // لا توجد دالة خادم لإضافة/تعديل السريالات يدوياً بعد (الجدول للقراءة فقط عبر RLS): تُسجَّل مع فاتورة الشراء
  const readOnly = ro || !IS_DEMO;
  const fmt = useFmt();
  const meta = useCatalogMeta();
  const ids = d.variants.filter((v) => v.id).map((v) => v.id!);
  const list = useLoad(() => (ids.length ? listSerials(ids) : Promise.resolve([])), [ids.join(',')]);
  const [variant, setVariant] = useState(ids[0] ?? '');
  const [wh, setWh] = useState('');
  const [text, setText] = useState('');
  const add = useAction(addSerials);
  if (!ids.length) return <Card><EmptyState icon="serial" title="لا أرقام بعد" text="تُسجَّل الأرقام التسلسلية مع فاتورة الشراء: رقم لكل قطعة." /></Card>;
  const serials = text.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
  return (
    <>
      {!readOnly ? (
        <Card title="إضافة أرقام" icon="serial">
          <div className="grid-2">
            <Field label="النسخة"><Select value={variant} onChange={(e) => setVariant(e.target.value)} options={d.variants.filter((v) => v.id).map((v) => ({ value: v.id!, label: v.title === DEFAULT_TITLE ? v.sku : v.title }))} /></Field>
            <Field label="المخزن"><Select value={wh || meta.warehouses[0]?.id || ''} onChange={(e) => setWh(e.target.value)} options={meta.warehouses.map((w) => ({ value: w.id, label: w.name }))} /></Field>
          </div>
          <Field label="الأرقام" hint="للقطع الموجودة فعلاً في المخزن (لا يتغير الرصيد). امسحها بالقارئ أو الصقها مفصولة بسطر أو فاصلة.">
            <Textarea rows={4} dir="ltr" value={text} onChange={(e) => setText(e.target.value)} data-scan-target="keep" />
          </Field>
          <Button variant="primary" disabled={!serials.length} loading={add.busy} onClick={async () => {
            const n = await add.run(variant, wh || meta.warehouses[0]?.id, serials);
            if (n !== undefined) { toast.success(`أُضيف ${fmt.num(n)} رقم`); setText(''); void list.reload(); }
          }}>إضافة {fmt.num(serials.length)} رقم</Button>
        </Card>
      ) : null}
      <Card title="الأرقام المسجلة" flush>
        {!list.data ? <div style={{ padding: 16 }}><Skeleton h={60} /></div> : !list.data.length ? <EmptyState icon="serial" title="لا أرقام بعد" /> : (
          <div className="scroll-x">
            <table className="table-plain">
              <thead><tr><th>الرقم</th><th>النسخة</th><th>المخزن</th><th>الحالة</th><th /></tr></thead>
              <tbody>{list.data.map((s) => (
                <tr key={s.id}>
                  <td className="code">{s.serial}</td><td>{s.variant_title || s.sku}</td><td>{s.warehouse_name ?? '—'}</td>
                  <td><Badge tone={SERIAL_STATUS[s.status].tone}>{SERIAL_STATUS[s.status].label}</Badge></td>
                  <td>{!readOnly && (s.status === 'in_stock' || s.status === 'defective') ? (
                    <Button size="sm" variant="ghost" onClick={async () => {
                      const next: SerialStatus = s.status === 'in_stock' ? 'defective' : 'in_stock';
                      try { await setSerialStatus(s.id, next); void list.reload(); } catch (e) { toast.error(errorMessage(e)); }
                    }}>{s.status === 'in_stock' ? 'تعليم كمعيب' : 'إرجاع للمخزن'}</Button>
                  ) : null}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}

// ------------------------------------------------------------------ المتجر

function StoreTab({ d, set, readOnly }: TabProps) {
  const fmt = useFmt();
  const v = d.variants.find((x) => x.is_active) ?? d.variants[0];
  const img = imgUrl(d.images[0]?.key, 'md');
  return (
    <div className="grid-2" style={{ alignItems: 'start' }}>
      <Card title="الظهور في التطبيق" icon="store">
        <fieldset disabled={readOnly} className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
          <Switch label="منشور في المتجر" hint="يظهر للزبائن في التطبيق ويمكن طلبه" checked={d.is_published} onChange={(b) => set((x) => ({ ...x, is_published: b }))} />
          <Switch label="منتج مميز" hint="يظهر في قسم «مختارات» بالصفحة الرئيسية" checked={d.is_featured} onChange={(b) => set((x) => ({ ...x, is_featured: b }))} />
          <Switch label="«اطلب توفيره» عند النفاد" hint="يترك الزبون طلباً ويصله إشعار حين يتوفر" checked={d.allow_request} onChange={(b) => set((x) => ({ ...x, allow_request: b }))} />
        </fieldset>
      </Card>
      <div className="phone" aria-label="معاينة في التطبيق">
        <div className="screen">
          <div className="notch"><i /></div>
          <div className="scroll">
            <div className="hero-img">{img ? <img src={img} alt="" /> : <Icon name="image" size={48} />}{d.images.length > 1 ? <span className="dots">{d.images.slice(0, 5).map((_, i) => <i key={i} className={i === 0 ? 'on' : ''} />)}</span> : null}</div>
            <div className="pbody">
              <div className="pname">{d.name || 'اسم المنتج'}</div>
              <div className="price-row">
                <span className="price-big">{fmt.money(v?.price ?? 0)}</span>
                {v?.compare_at_price ? <span className="strike faint">{fmt.money(v.compare_at_price)}</span> : null}
              </div>
              {d.options.filter((o) => o.values.length).map((o) => (
                <div key={o.name}><div className="small faint" style={{ marginBottom: 4 }}>{o.name}</div>
                  <div className="opt-chips">{o.values.map((x, i) => <span key={x} className={i === 0 ? 'on' : ''}>{x}</span>)}</div></div>
              ))}
              {d.description ? <div className="desc">{d.description.slice(0, 260)}</div> : null}
            </div>
          </div>
          <div className="cta"><span className="primary">{d.is_published ? 'أضف إلى السلة' : 'مخفي عن الزبائن'}</span><span className="soft" style={{ flex: '0 0 42px' }}><Icon name="heart" size={18} /></span></div>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ الباركود ووحدات التعبئة

function CodesTab({ d, set, errors, tried, readOnly }: TabProps) {
  const fmt = useFmt();
  const [labels, setLabels] = useState<LabelItem[] | null>(null);
  const upd = (k: string, fn: (v: VariantDraft) => VariantDraft) => set((x) => ({ ...x, variants: x.variants.map((v) => (v.k === k ? fn(v) : v)) }));
  const name = (v: VariantDraft) => (v.title === DEFAULT_TITLE ? null : v.title);
  return (
    <>
      <Card title="الباركود والملصقات" icon="barcode" actions={<Button size="sm" icon="printer" onClick={() => setLabels(d.variants.filter((v) => v.is_active).map((v) => ({ name: d.name, variant: name(v), price: v.price, code: v.barcode || v.sku, copies: 1 })))}>طباعة ملصقات</Button>}>
        <div className="stack">
          {d.variants.map((v) => (
            <div key={v.k} className="row" style={{ gap: 16, alignItems: 'center', flexWrap: 'wrap', paddingBottom: 12, borderBottom: '1px solid var(--line)' }}>
              <div style={{ minWidth: 150 }}><b>{name(v) ?? d.name ?? '—'}</b><div className="code faint small">{v.sku || '—'}</div></div>
              <div className="label-preview" style={{ padding: 8, margin: 0 }}>{v.barcode ? <Barcode value={v.barcode} height={44} /> : <span className="small" style={{ color: '#666' }}>بلا باركود</span>}</div>
              <div className="label-preview" style={{ padding: 6, margin: 0 }}><QrCode value={v.barcode || v.sku || 'raqeem'} size={72} /></div>
              {!readOnly && !v.barcode ? <Button size="sm" icon="barcode" onClick={async () => { try { const c = await nextBarcode(); upd(v.k, (x) => ({ ...x, barcode: c })); } catch (e) { toast.error(errorMessage(e)); } }}>توليد باركود داخلي</Button> : null}
              {tried && errors.variants[v.k]?.barcode ? <span className="small" style={{ color: 'var(--danger)', fontWeight: 700 }}>{errors.variants[v.k]?.barcode}</span> : null}
            </div>
          ))}
        </div>
      </Card>
      <Card title="وحدات التعبئة" icon="boxes">
        <p className="small dim" style={{ marginTop: 0 }}>كرتونة أو درزن بباركود خاص: مسحها في البيع أو الشراء أو الجرد يضيف عدد قطعها دفعة واحدة. السعر الفارغ = عدد القطع × سعر القطعة.</p>
        <div className="stack">
          {d.variants.map((v) => (
            <div key={v.k}>
              {d.variants.length > 1 ? <div className="small" style={{ fontWeight: 700, marginBottom: 6 }}>{v.title}</div> : null}
              {v.units.map((u, i) => (
                <div key={u.id ?? i} className="row nowrap" style={{ gap: 8, marginBottom: 6 }}>
                  <Input value={u.unit_name} disabled={readOnly} onChange={(e) => { const s = e.target.value; upd(v.k, (x) => ({ ...x, units: x.units.map((y, j) => (j === i ? { ...y, unit_name: s } : y)) })); }} placeholder="كرتونة" aria-label="اسم الوحدة" style={{ maxWidth: 140 }} />
                  <NumberInput value={u.factor} disabled={readOnly} onChange={(n) => upd(v.k, (x) => ({ ...x, units: x.units.map((y, j) => (j === i ? { ...y, factor: n ?? 0 } : y)) }))} min={2} suffix="قطعة" ariaLabel="عدد القطع" />
                  <Input value={u.barcode ?? ''} disabled={readOnly} dir="ltr" data-scan-target="keep" onChange={(e) => { const s = e.target.value; upd(v.k, (x) => ({ ...x, units: x.units.map((y, j) => (j === i ? { ...y, barcode: s || null } : y)) })); }} placeholder="باركود الوحدة" aria-label="باركود الوحدة" />
                  <MoneyInput value={u.price} disabled={readOnly} onChange={(n) => upd(v.k, (x) => ({ ...x, units: x.units.map((y, j) => (j === i ? { ...y, price: n } : y)) }))} placeholder={v.price ? fmt.num(v.price * (u.factor || 1)) : ''} ariaLabel="سعر الوحدة" />
                  {!readOnly ? <IconButton icon="barcode" label="توليد باركود" onClick={async () => { try { const c = await nextBarcode(); upd(v.k, (x) => ({ ...x, units: x.units.map((y, j) => (j === i ? { ...y, barcode: c } : y)) })); } catch (e) { toast.error(errorMessage(e)); } }} /> : null}
                  {!readOnly ? <IconButton icon="trash" label="حذف الوحدة" onClick={() => upd(v.k, (x) => ({ ...x, units: x.units.filter((_, j) => j !== i) }))} /> : null}
                </div>
              ))}
              {tried && errors.variants[v.k]?.units ? <div className="small" style={{ color: 'var(--danger)', fontWeight: 700 }}>{errors.variants[v.k]?.units}</div> : null}
              {!readOnly ? <Button size="sm" icon="plus" variant="ghost" onClick={() => upd(v.k, (x) => ({ ...x, units: [...x.units, { unit_name: x.units.length ? 'درزن' : 'كرتونة', factor: 12, barcode: null, price: null }] }))}>إضافة وحدة</Button> : null}
            </div>
          ))}
        </div>
      </Card>
      {labels ? <LabelPrintModal open onClose={() => setLabels(null)} items={labels} /> : null}
    </>
  );
}

// ------------------------------------------------------------------ الملخص الجانبي

function SummaryCard({ d }: { d: ProductDraft }) {
  const fmt = useFmt();
  const active = d.variants.filter((v) => v.is_active);
  const prices = active.map((v) => v.price ?? 0);
  const img = imgUrl(d.images[0]?.key, 'sm');
  return (
    <Card>
      <div className="row nowrap" style={{ gap: 12 }}>
        <div className="thumb" style={{ width: 64, height: 64 }}>{img ? <img src={img} alt="" /> : <Icon name="box" size={26} />}</div>
        <div className="grow" style={{ minWidth: 0 }}>
          <b className="truncate" style={{ display: 'block' }}>{d.name || 'منتج بلا اسم'}</b>
          <span className="money">{prices.length ? (Math.min(...prices) === Math.max(...prices) ? fmt.money(prices[0]) : `${fmt.money(Math.min(...prices), true)} – ${fmt.money(Math.max(...prices))}`) : '—'}</span>
        </div>
      </div>
      <div className="kv-list" style={{ marginTop: 14 }}>
        <div><span>النسخ</span><span>{fmt.num(active.length)}{d.variants.length > active.length ? ` (+${fmt.num(d.variants.length - active.length)} معطلة)` : ''}</span></div>
        <div><span>الصور</span><span>{fmt.num(d.images.length)}</span></div>
        <div><span>المتجر</span><span>{d.is_published ? <Badge tone="success">منشور</Badge> : <Badge tone="neutral">مخفي</Badge>}</span></div>
        <div><span>الباركود</span><span>{fmt.num(d.variants.filter((v) => v.barcode).length)} / {fmt.num(d.variants.length)}</span></div>
        {d.track_expiry ? <div><span>الصلاحية</span><span>متتبعة</span></div> : null}
        {d.track_serials ? <div><span>الأرقام التسلسلية</span><span>متتبعة</span></div> : null}
      </div>
    </Card>
  );
}

