import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { slugify, type Category } from '@raqeem/shared';
import {
  Alert, Badge, Button, DataTable, Field, Icon, IconButton, Menu, Modal, NumberInput, PageHeader, Pagination, SearchInput, Segmented, Select, StockBadge, Thumb, askConfirm, toast,
  type Column,
} from '../../ui';
import { useAuth } from '../../lib/auth';
import { useAction, useDebounced, useLoad, useStored } from '../../lib/hooks';
import { useFmt } from '../../lib/settings';
import { useSetting } from '../sales/data/app-settings';
import { downloadText, parseCsv, toCsv } from '../../lib/csv';
import { imgUrl } from '../../lib/media';
import { errorMessage } from '../../lib/supabase';
import {
  applyPrices, archiveProduct, findVariantByCode, getProduct, listAllProducts, listProducts, priceRange, productStockKey, setPublished, upsertProduct,
  type ProductListItem, type ProductQuery, type ProductSort, type StockFilter, type UpsertProductPayload,
} from './api';
import { categoryOptions, useCatalogMeta, useQueryState } from './components/hooks';
import { LabelPrintModal } from './components/LabelPrintModal';
import type { LabelItem } from './labels';
import './catalog.css';

const PAGE = 24;

export default function Products() {
  const nav = useNavigate();
  const fmt = useFmt();
  const { can } = useAuth();
  const meta = useCatalogMeta();
  const [qs, setQs] = useQueryState({ q: '', cat: '', brand: '', stock: '', pub: '', arch: '', sort: 'newest', page: '1' });
  const [view, setView] = useStored<'table' | 'grid'>('products.view', 'table');
  const [search, setSearch] = useState(qs.q);
  const dq = useDebounced(search, 250);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (dq !== qs.q) setQs({ q: dq, page: '1' }); }, [dq]);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [labels, setLabels] = useState<LabelItem[] | null>(null);
  const [priceOpen, setPriceOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const write = can('products.write');

  const query: ProductQuery = {
    q: qs.q, category_id: qs.cat, brand_id: qs.brand, stock: qs.stock as StockFilter, published: qs.pub as ProductQuery['published'],
    archived: qs.arch === '1', sort: qs.sort as ProductSort, page: Number(qs.page) || 1, pageSize: PAGE,
  };
  const lowDefault = Number(useSetting('inventory').low_stock_default) || 0;
  const list = useLoad(() => listProducts(query, meta.categories), [JSON.stringify(query), meta.categories.length]);
  const rows = list.data?.rows;
  const selRows = (rows ?? []).filter((r) => sel.has(r.id));
  const catName = (id: string | null) => meta.categories.find((c) => c.id === id)?.name ?? '—';

  const bulk = useAction(async (fn: () => Promise<void>) => { await fn(); setSel(new Set()); await list.reload(); });

  const exportCsv = async () => {
    try {
      const all = await listAllProducts(query, meta.categories);
      const flat = all.flatMap((p) => p.variants.map((v) => ({ p, v })));
      downloadText(`products-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(flat, [
        { key: 'name', label: 'name', value: (r) => r.p.name },
        { key: 'variant', label: 'variant', value: (r) => (r.v.title === 'افتراضي' ? '' : r.v.title) },
        { key: 'sku', label: 'sku', value: (r) => r.v.sku },
        { key: 'barcode', label: 'barcode', value: (r) => r.v.barcode },
        { key: 'price', label: 'price', value: (r) => r.v.price },
        { key: 'compare_at_price', label: 'compare_at_price', value: (r) => r.v.compare_at_price },
        { key: 'wholesale_price', label: 'wholesale_price', value: (r) => r.v.wholesale_price },
        { key: 'min_stock', label: 'min_stock', value: (r) => r.v.min_stock },
        { key: 'available', label: 'available', value: (r) => r.v.available_qty },
        { key: 'category', label: 'category', value: (r) => catName(r.p.category_id) },
        { key: 'brand', label: 'brand', value: (r) => meta.brands.find((b) => b.id === r.p.brand_id)?.name ?? '' },
        { key: 'published', label: 'published', value: (r) => (r.p.is_published ? 1 : 0) },
      ]));
      toast.success(`صُدّر ${fmt.count(flat.length, { one: 'سطر', two: 'سطران', few: 'أسطر', many: 'سطراً' })}`);
    } catch (e) { toast.error(errorMessage(e)); }
  };

  const labelItems = (ps: ProductListItem[]): LabelItem[] => ps.flatMap((p) => p.variants.filter((v) => v.is_active).map((v) => ({
    name: p.name, variant: v.title === 'افتراضي' ? null : v.title, price: v.price, code: v.barcode ?? v.sku, copies: 1,
  })));

  const columns: Column<ProductListItem>[] = [
    {
      key: 'name', header: 'المنتج', primary: true, cell: (p) => (
        <div className="pcell">
          <Thumb imageKey={p.cover_key} />
          <div className="meta">
            <b className="truncate">{p.name}</b>
            <span className="truncate">{p.variants.length > 1 ? `${fmt.num(p.variants.length)} نسخ · ` : ''}<span className="code">{p.variants[0]?.sku}</span></span>
          </div>
        </div>
      ),
    },
    { key: 'cat', header: 'القسم', hideOnMobile: true, cell: (p) => <span className="dim">{catName(p.category_id)}</span> },
    {
      key: 'price', header: 'السعر', end: true, cell: (p) => {
        const r = priceRange(p.variants);
        return (
          <div className="price-cell">
            <span className="money">{r.min === r.max ? fmt.money(r.min) : `${fmt.money(r.min, true)} – ${fmt.money(r.max)}`}</span>
            {r.compare ? <span className="strike faint">{fmt.money(r.compare)}</span> : null}
          </div>
        );
      },
    },
    { key: 'stock', header: 'المتوفر', end: true, cell: (p) => { const r = priceRange(p.variants); return <StockBadge qty={r.available} min={r.minStock} label={fmt.qty(r.available)} />; } },
    {
      key: 'state', header: 'الحالة', hideOnMobile: true, cell: (p) => (
        <span className="row" style={{ gap: 4 }}>
          {p.archived_at ? <Badge tone="neutral">مؤرشف</Badge> : p.is_published ? <Badge tone="success">منشور</Badge> : <Badge tone="neutral">مخفي</Badge>}
          {p.is_featured ? <Badge tone="accent">مميز</Badge> : null}
        </span>
      ),
    },
    { key: 'sold', header: 'المبيع', end: true, hideOnMobile: true, cell: (p) => <span className="num">{fmt.num(p.sold_count)}</span> },
  ];

  const filters = (
    <div className="filters" style={{ width: '100%' }}>
      <SearchInput value={search} onChange={setSearch} placeholder="ابحث بالاسم أو SKU أو الباركود…" />
      <Select value={qs.cat} onChange={(e) => setQs({ cat: e.target.value, page: '1' })} placeholder="كل الأقسام" options={categoryOptions(meta.categories)} aria-label="القسم" />
      <Select value={qs.brand} onChange={(e) => setQs({ brand: e.target.value, page: '1' })} placeholder="كل العلامات" options={meta.brands.map((b) => ({ value: b.id, label: b.name }))} aria-label="العلامة" />
      <Select value={qs.stock} onChange={(e) => setQs({ stock: e.target.value, page: '1' })} aria-label="المخزون" options={[{ value: '', label: 'كل المخزون' }, { value: 'ok', label: 'متوفر' }, { value: 'low', label: 'قليل' }, { value: 'out', label: 'نافد' }]} />
      <Select value={qs.pub} onChange={(e) => setQs({ pub: e.target.value, page: '1' })} aria-label="النشر" options={[{ value: '', label: 'منشور ومخفي' }, { value: 'yes', label: 'منشور' }, { value: 'no', label: 'مخفي' }]} />
      <Select value={qs.sort} onChange={(e) => setQs({ sort: e.target.value })} aria-label="الترتيب" options={[{ value: 'newest', label: 'الأحدث' }, { value: 'updated', label: 'آخر تعديل' }, { value: 'sold', label: 'الأكثر مبيعاً' }, { value: 'name', label: 'الاسم' }, { value: 'oldest', label: 'الأقدم' }]} />
      <Segmented value={qs.arch === '1' ? 'arch' : 'live'} onChange={(v) => setQs({ arch: v === 'arch' ? '1' : '', page: '1' })} label="الأرشيف" options={[{ value: 'live', label: 'النشطة' }, { value: 'arch', label: 'المؤرشفة' }]} />
      <Segmented value={view} onChange={setView} label="العرض" options={[{ value: 'table', label: <Icon name="list" size={17} /> }, { value: 'grid', label: <Icon name="grid" size={17} /> }]} />
    </div>
  );

  const bulkBar = sel.size ? (
    <div className="bulk-bar">
      <span>{fmt.count(sel.size, { one: 'منتج محدد', two: 'منتجان محددان', few: 'منتجات محددة', many: 'منتجاً محدداً' })}</span>
      {write ? <>
        <Button size="sm" icon="eye" loading={bulk.busy} onClick={() => bulk.run(() => setPublished([...sel], true))}>نشر</Button>
        <Button size="sm" icon="eyeOff" loading={bulk.busy} onClick={() => bulk.run(() => setPublished([...sel], false))}>إخفاء</Button>
        <Button size="sm" icon="percent" onClick={() => setPriceOpen(true)}>تعديل السعر</Button>
      </> : null}
      <Button size="sm" icon="printer" onClick={() => setLabels(labelItems(selRows))}>ملصقات</Button>
      {write ? (
        <Button size="sm" icon="trash" variant="danger" loading={bulk.busy} onClick={async () => {
          const arch = qs.arch !== '1';
          if (!(await askConfirm({ title: arch ? 'أرشفة المنتجات المحددة؟' : 'استرجاع المنتجات المحددة؟', body: arch ? 'تختفي من المتجر ونقطة البيع، وتبقى حركاتها وفواتيرها.' : undefined, danger: arch, confirm: arch ? 'أرشفة' : 'استرجاع' }))) return;
          await bulk.run(async () => { for (const id of sel) await archiveProduct(id, arch); });
        }}>{qs.arch === '1' ? 'استرجاع' : 'أرشفة'}</Button>
      ) : null}
      <Button size="sm" variant="ghost" onClick={() => setSel(new Set())}>إلغاء التحديد</Button>
    </div>
  ) : null;

  return (
    <>
      <PageHeader
        title="المنتجات"
        description={list.data ? fmt.count(list.data.total, { one: 'منتج', two: 'منتجان', few: 'منتجات', many: 'منتجاً' }) : 'كل ما تبيعه في المحل والتطبيق.'}
        actions={<>
          <Menu trigger={(open) => <Button icon="more" onClick={open}>المزيد</Button>} items={[
            { label: 'تصدير CSV', icon: 'download', onClick: exportCsv },
            ...(write ? [{ label: 'استيراد من CSV', icon: 'upload' as const, onClick: () => setImportOpen(true) }] : []),
            { label: 'طباعة ملصقات هذه الصفحة', icon: 'printer', onClick: () => setLabels(labelItems(rows ?? [])) },
          ]} />
          {write ? <Button variant="primary" icon="plus" onClick={() => nav('/products/new')}>منتج جديد</Button> : null}
        </>}
      />
      {view === 'table' ? (
        <DataTable
          rows={rows} columns={columns} rowKey={(p) => p.id} loading={list.loading} error={list.error} onRetry={list.reload}
          onRowClick={(p) => nav(`/products/${p.id}`)} selected={sel} onSelect={setSel}
          toolbar={<>{filters}</>}
          empty={qs.q || qs.cat || qs.brand || qs.stock || qs.pub
            ? { icon: 'search', title: 'لا منتجات تطابق البحث', text: 'جرّب كلمة أخرى أو امسح الفلاتر.', action: <Button onClick={() => { setSearch(''); setQs({ q: '', cat: '', brand: '', stock: '', pub: '', page: '1' }); }}>مسح الفلاتر</Button> }
            : { icon: 'box', title: 'لا منتجات بعد', text: 'أضف أول منتج، أو استورد قائمتك من ملف CSV.', action: write ? <Button variant="primary" icon="plus" onClick={() => nav('/products/new')}>منتج جديد</Button> : undefined }}
          footer={<>{bulkBar}{list.data ? <Pagination page={query.page} pageSize={PAGE} total={list.data.total} onPage={(p) => setQs({ page: String(p) })} /> : null}</>}
        />
      ) : (
        <div className="table-wrap">
          <div className="table-toolbar">{filters}</div>
          {bulkBar}
          {list.error && !rows ? <Alert tone="danger">{list.error}</Alert> : null}
          {rows && !rows.length ? <div style={{ padding: 30, textAlign: 'center' }} className="dim">لا منتجات هنا.</div> : null}
          <div className="pgrid">
            {(rows ?? []).map((p) => {
              const r = priceRange(p.variants);
              const st = productStockKey(p.variants, lowDefault);
              const url = imgUrl(p.cover_key, 'md');
              return (
                <div key={p.id} className={`pcard ${sel.has(p.id) ? 'selected' : ''}`} onClick={() => nav(`/products/${p.id}`)}>
                  <input type="checkbox" className="pick" aria-label={`تحديد ${p.name}`} checked={sel.has(p.id)} onClick={(e) => e.stopPropagation()}
                    onChange={() => { const n = new Set(sel); if (n.has(p.id)) n.delete(p.id); else n.add(p.id); setSel(n); }} />
                  <div className="tags">
                    {!p.is_published ? <Badge tone="neutral">مخفي</Badge> : null}
                    {st === 'out' ? <Badge tone="danger">نافد</Badge> : st === 'low' ? <Badge tone="warning">قليل</Badge> : null}
                  </div>
                  <div className="img">{url ? <img src={url} alt="" loading="lazy" /> : <Icon name="box" size={36} />}</div>
                  <div className="body">
                    <span className="name">{p.name}</span>
                    <span className="row between"><b className="money">{fmt.money(r.min)}</b><span className="small faint">{fmt.qty(r.available)} متاح</span></span>
                  </div>
                </div>
              );
            })}
          </div>
          {list.data ? <Pagination page={query.page} pageSize={PAGE} total={list.data.total} onPage={(p) => setQs({ page: String(p) })} /> : null}
        </div>
      )}
      {labels ? <LabelPrintModal open onClose={() => setLabels(null)} items={labels} /> : null}
      <PriceModal open={priceOpen} onClose={() => setPriceOpen(false)} products={selRows} onDone={() => { setSel(new Set()); void list.reload(); }} />
      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} categories={meta.categories} onDone={() => void list.reload()} />
    </>
  );
}

/** رفع/خفض أسعار المحدد بنسبة مئوية مع تقريب، ومعاينة قبل الحفظ */
function PriceModal({ open, onClose, products, onDone }: { open: boolean; onClose: () => void; products: ProductListItem[]; onDone: () => void }) {
  const fmt = useFmt();
  const [pct, setPct] = useState<number | null>(10);
  const [dir, setDir] = useState<'up' | 'down'>('up');
  const [round, setRound] = useState('250');
  const [keepCompare, setKeepCompare] = useState<'keep' | 'old'>('keep');
  const save = useAction(applyPrices, { success: 'تم تعديل الأسعار' });
  const changes = useMemo(() => {
    const f = 1 + ((dir === 'up' ? 1 : -1) * (pct ?? 0)) / 100;
    const step = Number(round) || 1;
    return products.flatMap((p) => p.variants.map((v) => {
      const price = Math.max(0, Math.round((v.price * f) / step) * step);
      return { variant_id: v.id, product_id: p.id, sku: v.sku, title: v.title, price, compare_at_price: keepCompare === 'old' && dir === 'down' ? v.price : v.compare_at_price, old: v.price, name: p.name };
    }));
  }, [products, pct, dir, round, keepCompare]);
  return (
    <Modal open={open} onClose={onClose} title="تعديل الأسعار بنسبة" subtitle={fmt.count(changes.length, { one: 'نسخة', two: 'نسختان', few: 'نسخ', many: 'نسخة' })} width={620}
      footer={<><Button variant="primary" loading={save.busy} disabled={!pct} onClick={async () => { if ((await save.run(changes)) !== undefined) { onDone(); onClose(); } }}>تطبيق الأسعار</Button><Button onClick={onClose}>إلغاء</Button></>}>
      <div className="grid-2">
        <Field label="الاتجاه"><Segmented value={dir} onChange={setDir} options={[{ value: 'up', label: 'رفع' }, { value: 'down', label: 'خفض' }]} /></Field>
        <Field label="النسبة"><NumberInput value={pct} onChange={setPct} allowDecimal min={0} max={95} suffix="%" /></Field>
        <Field label="التقريب لأقرب"><Select value={round} onChange={(e) => setRound(e.target.value)} options={[{ value: '1', label: 'بلا تقريب' }, { value: '250', label: '٢٥٠ د.ع' }, { value: '500', label: '٥٠٠ د.ع' }, { value: '1000', label: '١٠٠٠ د.ع' }]} /></Field>
        {dir === 'down' ? <Field label="السعر قبل الخصم"><Segmented value={keepCompare} onChange={setKeepCompare} options={[{ value: 'keep', label: 'كما هو' }, { value: 'old', label: 'السعر القديم مشطوباً' }]} /></Field> : null}
      </div>
      <div className="scroll-x" style={{ maxHeight: 280 }}>
        <table className="table-plain">
          <thead><tr><th>المنتج</th><th className="end">الحالي</th><th className="end">الجديد</th></tr></thead>
          <tbody>{changes.slice(0, 60).map((c) => <tr key={c.variant_id}><td className="truncate" style={{ maxWidth: 260 }}>{c.name}{c.title !== 'افتراضي' ? ` — ${c.title}` : ''}</td><td className="end">{fmt.money(c.old)}</td><td className="end"><b>{fmt.money(c.price)}</b></td></tr>)}</tbody>
        </table>
      </div>
    </Modal>
  );
}

interface ImportRow { line: number; name: string; sku: string; barcode: string; price: number; compare: number | null; wholesale: number | null; cost: number | null; min: number; category: string; existing: string | null; error: string | null }

/** استيراد CSV: معاينة كل سطر (جديد/تحديث بالـSKU/خطأ) ثم حفظ كل سطر عبر upsert_product */
function ImportModal({ open, onClose, categories, onDone }: { open: boolean; onClose: () => void; categories: Category[]; onDone: () => void }) {
  const fmt = useFmt();
  const { can } = useAuth();
  const file = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<ImportRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(0);
  const n = (v: string | undefined) => (v && v.trim() !== '' && !Number.isNaN(Number(v.replace(/,/g, ''))) ? Number(v.replace(/,/g, '')) : null);

  const read = async (f: File) => {
    const parsed = parseCsv(await f.text());
    const out: ImportRow[] = [];
    const seen = new Set<string>();
    for (const [i, r] of parsed.entries()) {
      const g = (k: string, ar: string) => (r[k] ?? r[ar] ?? '').trim();
      const name = g('name', 'الاسم');
      const sku = g('sku', 'الرمز') || `IMP-${slugify(name).slice(0, 8).toUpperCase()}-${i + 1}`;
      const price = n(g('price', 'السعر'));
      let error: string | null = !name ? 'الاسم فارغ' : price === null ? 'السعر غير صالح' : seen.has(sku.toLowerCase()) ? 'SKU مكرر في الملف' : null;
      seen.add(sku.toLowerCase());
      let existing: string | null = null;
      if (!error) { try { existing = (await findVariantByCode(sku))?.product_id ?? null; } catch { /* نكمل كجديد */ } }
      if (!error && g('barcode', 'الباركود') && !/^[\w-]{3,}$/.test(g('barcode', 'الباركود'))) error = 'باركود غير صالح';
      out.push({ line: i + 2, name, sku, barcode: g('barcode', 'الباركود'), price: price ?? 0, compare: n(g('compare_at_price', 'قبل الخصم')), wholesale: n(g('wholesale_price', 'الجملة')), cost: n(g('cost', 'التكلفة')), min: n(g('min_stock', 'حد التنبيه')) ?? 0, category: g('category', 'القسم'), existing, error });
    }
    setRows(out);
    setDone(0);
  };

  const run = async () => {
    if (!rows) return;
    setBusy(true);
    let ok = 0;
    const next = [...rows];
    for (const [i, r] of next.entries()) {
      if (r.error) continue;
      try {
        const cat = categories.find((c) => c.name === r.category)?.id ?? null;
        if (r.existing) {
          const full = await getProduct(r.existing, can('costs.view'));
          const p: UpsertProductPayload = {
            ...full.product, images: full.images.map((im) => ({ key: im.key, alt: im.alt, sort: im.sort })),
            variants: full.variants.map((v) => ({
              id: v.id, title: v.title, options: v.options, sku: v.sku, barcode: v.barcode, is_active: v.is_active, sort: v.sort, min_stock: v.min_stock,
              price: v.sku.toLowerCase() === r.sku.toLowerCase() ? r.price : v.price,
              compare_at_price: v.sku.toLowerCase() === r.sku.toLowerCase() ? r.compare : v.compare_at_price,
              wholesale_price: v.sku.toLowerCase() === r.sku.toLowerCase() ? r.wholesale : v.wholesale_price,
              ...(can('costs.view') && v.sku.toLowerCase() === r.sku.toLowerCase() && r.cost !== null ? { cost: r.cost } : {}),
              units: full.units.filter((u) => u.variant_id === v.id).map((u) => ({ id: u.id, unit_name: u.unit_name, factor: u.factor, barcode: u.barcode, price: u.price })),
            })),
          };
          await upsertProduct(p);
        } else {
          await upsertProduct({
            name: r.name, description: null, category_id: cat, brand_id: null, unit: 'قطعة', tags: [], specs: [], warranty: null, option_names: [], has_variants: false,
            track_serials: false, track_expiry: false, is_published: false, is_featured: false, allow_request: true, images: [],
            variants: [{ title: 'افتراضي', options: {}, sku: r.sku, barcode: r.barcode || null, price: r.price, compare_at_price: r.compare, wholesale_price: r.wholesale, ...(can('costs.view') && r.cost !== null ? { cost: r.cost } : {}), min_stock: r.min, is_active: true, sort: 0, units: [] }],
          });
        }
        ok += 1;
      } catch (e) { next[i] = { ...r, error: errorMessage(e) }; }
      setDone(i + 1);
    }
    setRows(next);
    setBusy(false);
    toast.success(`حُفظ ${fmt.count(ok, { one: 'منتج', two: 'منتجان', few: 'منتجات', many: 'منتجاً' })}`);
    onDone();
  };

  const valid = rows?.filter((r) => !r.error).length ?? 0;
  return (
    <Modal open={open} onClose={() => { if (!busy) { setRows(null); onClose(); } }} title="استيراد المنتجات من CSV" width={820}
      footer={<>
        <Button variant="primary" disabled={!valid} loading={busy} onClick={run}>{busy ? `جارٍ الحفظ ${fmt.num(done)}/${fmt.num(rows?.length ?? 0)}` : `استيراد ${fmt.num(valid)} سطر`}</Button>
        <Button onClick={() => file.current?.click()} icon="upload" disabled={busy}>اختيار ملف</Button>
        <Button variant="ghost" disabled={busy} onClick={() => downloadText('products-template.csv', 'name,sku,barcode,price,compare_at_price,wholesale_price,cost,min_stock,category\nسماعة بلوتوث,AUD-001,,25000,30000,22000,18000,3,إلكترونيات\n')}>تنزيل قالب</Button>
      </>}>
      <input ref={file} type="file" accept=".csv,text/csv" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void read(f); e.target.value = ''; }} />
      {!rows ? (
        <Alert tone="info">الأعمدة: name, sku, barcode, price, compare_at_price, wholesale_price, cost, min_stock, category. السطر الذي يطابق SKU موجوداً يُحدّث سعره، والباقي يُضاف منتجاً جديداً مخفياً.</Alert>
      ) : (
        <div className="scroll-x" style={{ maxHeight: 420 }}>
          <table className="table-plain">
            <thead><tr><th>#</th><th>الاسم</th><th>SKU</th><th className="end">السعر</th><th>القسم</th><th>النتيجة</th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.line}>
                <td className="faint">{fmt.num(r.line)}</td><td className="truncate" style={{ maxWidth: 240 }}>{r.name}</td><td className="code">{r.sku}</td>
                <td className="end">{fmt.money(r.price)}</td><td>{r.category || '—'}</td>
                <td>{r.error ? <Badge tone="danger">{r.error}</Badge> : r.existing ? <Badge tone="info">تحديث</Badge> : <Badge tone="success">جديد</Badge>}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
      {rows ? <IconButton icon="close" label="ملف آخر" onClick={() => setRows(null)} /> : null}
    </Modal>
  );
}
