import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Badge, Button, DataTable, PageHeader, Pagination, SearchInput, Segmented, Select, Stat, StockBadge, Tabs, Thumb, type Column } from '../../ui';
import { useAuth } from '../../lib/auth';
import { useDebounced, useLoad } from '../../lib/hooks';
import { useFmt } from '../../lib/settings';
import { downloadText, toCsv } from '../../lib/csv';
import { useQueryState } from '../catalog/components/hooks';
import { listLowStock, listStagnant, listStock, listWarehouses, stockTotals, type StagnantRow, type StockRow } from './api';
import { AdjustModal, type AdjustTarget } from './components/AdjustModal';
import type { LowStockRow } from '@raqeem/shared';
import '../catalog/catalog.css';

const PAGE = 50;

export default function Inventory() {
  const nav = useNavigate();
  const fmt = useFmt();
  const { can } = useAuth();
  const withCost = can('costs.view');
  const [qs, setQs] = useQueryState({ tab: 'levels', wh: '', q: '', zero: '', page: '1', days: '60' });
  const [search, setSearch] = useState(qs.q);
  const dq = useDebounced(search, 250);
  const whs = useLoad(() => listWarehouses(), []);
  const totals = useLoad(() => stockTotals(qs.wh, withCost), [qs.wh, withCost]);
  const page = Number(qs.page) || 1;
  const stock = useLoad(() => (qs.tab === 'levels' ? listStock({ q: dq, warehouse_id: qs.wh, nonZero: qs.zero !== '1', page, pageSize: PAGE, withCost }) : Promise.resolve(null)), [qs.tab, dq, qs.wh, qs.zero, page, withCost]);
  const low = useLoad(() => (qs.tab === 'low' ? listLowStock() : Promise.resolve(null)), [qs.tab]);
  const stag = useLoad(() => (qs.tab === 'stagnant' ? listStagnant(Number(qs.days), withCost) : Promise.resolve(null)), [qs.tab, qs.days, withCost]);
  const [adj, setAdj] = useState<{ target: AdjustTarget | null; wh?: string } | null>(null);
  const t = totals.data;
  const whName = (id: string) => whs.data?.find((w) => w.id === id)?.name ?? '';
  const adjust = can('inventory.adjust');

  const levelCols: Column<StockRow>[] = [
    { key: 'p', header: 'المنتج', primary: true, cell: (r) => <div className="pcell"><Thumb imageKey={r.cover_key} size="sm" /><div className="meta"><Link to={`/products/${r.product_id}`} onClick={(e) => e.stopPropagation()}><b className="truncate">{r.name}</b></Link><span>{r.variant_title ?? ''} <span className="code">{r.sku}</span></span></div></div> },
    ...(!qs.wh ? [{ key: 'w', header: 'المخزن', hideOnMobile: true, cell: (r: StockRow) => whName(r.warehouse_id) }] : []),
    { key: 'q', header: 'الرصيد', end: true, cell: (r) => <StockBadge qty={r.qty} min={r.min_stock} label={fmt.qty(r.qty)} /> },
    { key: 'r', header: 'محجوز', end: true, hideOnMobile: true, cell: (r) => (r.reserved ? <span className="num">{fmt.qty(r.reserved)}</span> : <span className="faint">—</span>) },
    { key: 'a', header: 'متاح', end: true, cell: (r) => <span className="num">{fmt.qty(r.available)}</span> },
    ...(withCost ? [{ key: 'c', header: 'القيمة', end: true, hideOnMobile: true, cell: (r: StockRow) => <span className="money">{fmt.money(Math.max(0, r.qty) * (r.avg_cost ?? 0))}</span> }] : []),
    ...(adjust ? [{ key: 'x', header: '', shrink: true, cell: (r: StockRow) => <Button size="sm" variant="ghost" icon="adjust" onClick={(e) => { e.stopPropagation(); setAdj({ target: { variant_id: r.variant_id, name: r.name, title: r.variant_title, sku: r.sku, cover_key: r.cover_key }, wh: r.warehouse_id }); }}>تسوية</Button> }] : []),
  ];
  const lowCols: Column<LowStockRow>[] = [
    { key: 'p', header: 'المنتج', primary: true, cell: (r) => <div><Link to={`/products/${r.product_id}`}><b>{r.name}</b></Link>{r.variant_title ? <span className="dim"> — {r.variant_title}</span> : null} <span className="code faint">{r.sku}</span></div> },
    { key: 'q', header: 'المتوفر', end: true, cell: (r) => <StockBadge qty={r.qty} min={r.min_stock} label={fmt.qty(r.qty)} /> },
    { key: 'm', header: 'حد التنبيه', end: true, cell: (r) => <span className="num">{fmt.qty(r.min_stock)}</span> },
    { key: 'n', header: 'المقترح', end: true, cell: (r) => <b className="num">{fmt.qty(Math.max(r.min_stock * 2 - r.qty, 1))}</b> },
  ];
  const stagCols: Column<StagnantRow>[] = [
    { key: 'p', header: 'المنتج', primary: true, cell: (r) => <div><Link to={`/products/${r.product_id}`}><b>{r.name}</b></Link>{r.variant_title ? <span className="dim"> — {r.variant_title}</span> : null} <span className="code faint">{r.sku}</span></div> },
    { key: 'q', header: 'الرصيد', end: true, cell: (r) => <span className="num">{fmt.qty(r.qty)}</span> },
    { key: 'l', header: 'آخر بيع', cell: (r) => (r.last_sale_at ? fmt.ago(r.last_sale_at) : <Badge tone="warning">لم يُبع أبداً</Badge>) },
    ...(withCost ? [{ key: 'v', header: 'قيمة مجمّدة', end: true, cell: (r: StagnantRow) => <span className="money">{fmt.money(r.value ?? 0)}</span> }] : []),
  ];
  return (
    <>
      <PageHeader title="المخزون" description="الرصيد في كل مخزن، وما يحتاج طلباً، وما لا يتحرك."
        actions={<>
          {qs.tab === 'levels' && stock.data ? <Button icon="download" onClick={() => downloadText('stock.csv', toCsv(stock.data!.rows, [
            { key: 'sku', label: 'sku', value: (r) => r.sku }, { key: 'n', label: 'name', value: (r) => r.name }, { key: 'v', label: 'variant', value: (r) => r.variant_title }, { key: 'w', label: 'warehouse', value: (r) => whName(r.warehouse_id) },
            { key: 'q', label: 'qty', value: (r) => r.qty }, { key: 'r', label: 'reserved', value: (r) => r.reserved },
          ]))}>تصدير</Button> : null}
          {adjust ? <Button variant="primary" icon="adjust" onClick={() => setAdj({ target: null, wh: qs.wh || undefined })}>تسوية رصيد</Button> : null}
        </>} />
      <div className="stat-row" style={{ marginBottom: 16 }}>
        <Stat label="نسخ لها رصيد" icon="box" value={t ? fmt.num(t.items) : '…'} />
        <Stat label="إجمالي القطع" icon="layers" value={t ? fmt.qty(t.units) : '…'} />
        {withCost ? <Stat label="القيمة بالتكلفة" icon="coins" tone="hero" value={t ? fmt.money(t.cost_value ?? 0) : '…'} /> : null}
        <Stat label="القيمة بسعر البيع" icon="tag" value={t?.retail_value !== null && t ? fmt.money(t.retail_value) : '—'} />
      </div>
      <Tabs value={qs.tab as 'levels'} onChange={(v) => setQs({ tab: v, page: '1' })} items={[{ value: 'levels', label: 'الأرصدة' }, { value: 'low' as 'levels', label: 'النواقص' }, { value: 'stagnant' as 'levels', label: 'الراكد' }]} />
      <div style={{ marginTop: 14 }}>
        {qs.tab === 'levels' ? (
          <DataTable rows={stock.data?.rows} columns={levelCols} rowKey={(r) => `${r.variant_id}|${r.warehouse_id}`} loading={stock.loading} error={stock.error} onRetry={stock.reload}
            toolbar={<div className="filters" style={{ width: '100%' }}>
              <SearchInput value={search} onChange={(v) => { setSearch(v); setQs({ page: '1' }); }} placeholder="ابحث بالاسم أو SKU أو الباركود…" />
              <Select value={qs.wh} onChange={(e) => setQs({ wh: e.target.value, page: '1' })} placeholder="كل المخازن" options={(whs.data ?? []).map((w) => ({ value: w.id, label: w.name }))} aria-label="المخزن" />
              <Segmented value={qs.zero === '1' ? 'all' : 'nz'} onChange={(v) => setQs({ zero: v === 'all' ? '1' : '', page: '1' })} options={[{ value: 'nz', label: 'له رصيد' }, { value: 'all', label: 'مع الأصفار' }]} />
            </div>}
            empty={{ icon: 'layers', title: dq ? 'لا نتائج' : 'لا رصيد بعد', text: 'يزيد الرصيد بفاتورة شراء أو سند إدخال أو رصيد افتتاحي.' }}
            footer={stock.data ? <Pagination page={page} pageSize={PAGE} total={stock.data.total} onPage={(p) => setQs({ page: String(p) })} /> : null} />
        ) : qs.tab === 'low' ? (
          <DataTable rows={low.data ?? undefined} columns={lowCols} rowKey={(r) => r.variant_id} loading={low.loading} error={low.error} onRetry={low.reload}
            toolbar={low.data?.length && can('purchases.manage') ? <Button variant="primary" icon="stockIn" onClick={() => nav(`/purchases/new?variants=${low.data!.map((r) => r.variant_id).join(',')}`)}>فاتورة شراء للنواقص</Button> : undefined}
            empty={{ icon: 'checkCircle', title: 'لا نواقص', text: 'كل المنتجات فوق حد التنبيه.' }} />
        ) : (
          <DataTable rows={stag.data ?? undefined} columns={stagCols} rowKey={(r) => r.variant_id} loading={stag.loading} error={stag.error} onRetry={stag.reload}
            toolbar={<Segmented value={qs.days} onChange={(v) => setQs({ days: v })} options={[{ value: '30', label: '٣٠ يوماً' }, { value: '60', label: '٦٠ يوماً' }, { value: '90', label: '٩٠ يوماً' }, { value: '180', label: '٦ أشهر' }]} />}
            empty={{ icon: 'trendUp', title: 'لا راكد', text: 'كل ما له رصيد بِيع خلال هذه المدة.' }} />
        )}
      </div>
      {adj ? <AdjustModal open onClose={() => setAdj(null)} target={adj.target} warehouseId={adj.wh} onDone={() => { void stock.reload(); void totals.reload(); }} /> : null}
    </>
  );
}
