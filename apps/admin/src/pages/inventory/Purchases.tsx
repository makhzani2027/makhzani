import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Badge, Button, DataTable, Drawer, PageHeader, Pagination, SearchInput, Segmented, Select, Skeleton, type Column } from '../../ui';
import { useDebounced, useLoad } from '../../lib/hooks';
import { useFmt, useSettings } from '../../lib/settings';
import { useMoneyIn, useQueryState } from '../catalog/components/hooks';
import { getInvoiceItems, getPurchase, listPurchases, listSuppliers, type PurchaseRow } from './api';
import { printPurchase } from './components/purchasePrint';
import '../catalog/catalog.css';

const PAGE = 25;

export default function Purchases() {
  const nav = useNavigate();
  const fmt = useFmt();
  const m = useMoneyIn();
  const [qs, setQs] = useQueryState({ q: '', supplier: '', status: '', page: '1', open: '' });
  const [search, setSearch] = useState(qs.q);
  const dq = useDebounced(search, 250);
  const sups = useLoad(listSuppliers, []);
  const page = Number(qs.page) || 1;
  const list = useLoad(() => listPurchases({ q: dq, supplier_id: qs.supplier, status: qs.status as '' | 'due' | 'paid', page, pageSize: PAGE }), [dq, qs.supplier, qs.status, page]);
  // الرابط ?open= (من صفحة المورد) قد يشير لفاتورة ليست في هذه الصفحة من القائمة
  const one = useLoad(() => (qs.open ? getPurchase(qs.open) : Promise.resolve(null)), [qs.open]);
  const open = list.data?.rows.find((r) => r.id === qs.open) ?? (qs.open && one.data?.id === qs.open ? one.data : null);
  const columns: Column<PurchaseRow>[] = [
    { key: 'n', header: 'الفاتورة', primary: true, cell: (i) => <span><span className="code">{i.number}</span> {i.kind === 'purchase_return' ? <Badge tone="warning">إرجاع</Badge> : null}{i.status === 'void' ? <Badge tone="danger">ملغاة</Badge> : null}</span> },
    { key: 's', header: 'المورد', cell: (i) => <Link to={`/suppliers/${i.supplier_id}`} onClick={(e) => e.stopPropagation()}>{i.supplier_name}</Link> },
    { key: 'd', header: 'التاريخ', cell: (i) => fmt.date(i.created_at) },
    { key: 'w', header: 'المخزن', hideOnMobile: true, cell: (i) => i.warehouse_name },
    { key: 'l', header: 'البنود', end: true, hideOnMobile: true, cell: (i) => fmt.num(i.lines) },
    { key: 't', header: 'الإجمالي', end: true, cell: (i) => <b className="money">{m(i.total, i.currency)}</b> },
    { key: 'due', header: 'المتبقي', end: true, cell: (i) => (i.due > 0 ? <span className="qty-neg">{m(i.due, i.currency)}</span> : <Badge tone="success">مسددة</Badge>) },
  ];
  return (
    <>
      <PageHeader title="المشتريات" description="فواتير الشراء بالدينار أو الدولار. كل فاتورة تزيد المخزون وتحدّث متوسط الكلفة."
        actions={<Button variant="primary" icon="plus" onClick={() => nav('/purchases/new')}>فاتورة شراء</Button>} />
      <DataTable rows={list.data?.rows} columns={columns} rowKey={(i) => i.id} loading={list.loading} error={list.error} onRetry={list.reload} onRowClick={(i) => setQs({ open: i.id })}
        toolbar={<div className="filters" style={{ width: '100%' }}>
          <SearchInput value={search} onChange={(v) => { setSearch(v); setQs({ q: v, page: '1' }); }} placeholder="ابحث برقم الفاتورة…" />
          <Select value={qs.supplier} onChange={(e) => setQs({ supplier: e.target.value, page: '1' })} placeholder="كل الموردين" options={(sups.data ?? []).map((s) => ({ value: s.id, label: s.name }))} aria-label="المورد" />
          <Segmented value={qs.status || 'all'} onChange={(v) => setQs({ status: v === 'all' ? '' : v, page: '1' })} options={[{ value: 'all', label: 'الكل' }, { value: 'due', label: 'عليها متبقٍ' }, { value: 'paid', label: 'مسددة' }]} />
        </div>}
        empty={{ icon: 'invoice', title: 'لا فواتير شراء', text: 'سجّل البضاعة الواصلة من المورد بفاتورة: يزيد المخزون ويُحسب ما عليك.', action: <Button variant="primary" onClick={() => nav('/purchases/new')}>فاتورة شراء</Button> }}
        footer={list.data ? <Pagination page={page} pageSize={PAGE} total={list.data.total} onPage={(p) => setQs({ page: String(p) })} /> : null} />
      {open ? <PurchaseDrawer inv={open} onClose={() => setQs({ open: '' })} /> : null}
    </>
  );
}

function PurchaseDrawer({ inv, onClose }: { inv: PurchaseRow; onClose: () => void }) {
  const fmt = useFmt();
  const m = useMoneyIn();
  const { store } = useSettings();
  const items = useLoad(() => getInvoiceItems(inv.id), [inv.id]);
  const print = () => void printPurchase({
    number: inv.number, created_at: inv.created_at, supplier: inv.supplier_name, warehouse: inv.warehouse_name, currency: inv.currency, exchange_rate: inv.exchange_rate,
    subtotal: inv.subtotal, discount: inv.discount, total: inv.total, paid: inv.paid, note: inv.note,
    lines: (items.data ?? []).map((i) => ({ name: i.name, variant_title: i.variant_title, sku: i.sku, qty: i.qty, unit_cost: i.unit_price, line_total: i.line_total, lot_code: i.lot_code, expiry_date: i.expiry_date, serials: i.serials })),
  }, store, fmt.digits);
  return (
    <Drawer open onClose={onClose} title={`فاتورة شراء ${inv.number}`} width={560}
      footer={<><Button variant="primary" icon="printer" onClick={print} disabled={!items.data}>طباعة A4</Button>{inv.due > 0 ? <Link className="btn" to={`/suppliers/${inv.supplier_id}`}>تسديد للمورد</Link> : null}<Button onClick={onClose}>إغلاق</Button></>}>
      <div className="kv-list">
        <div><span>المورد</span><span>{inv.supplier_name}</span></div>
        <div><span>التاريخ</span><span>{fmt.date(inv.created_at, true)}</span></div>
        <div><span>المخزن</span><span>{inv.warehouse_name}</span></div>
        <div><span>العملة</span><span>{inv.currency === 'USD' ? `دولار — ${fmt.num(inv.exchange_rate)} د.ع` : 'دينار'}</span></div>
      </div>
      <div style={{ marginTop: 14 }}>
        {!items.data ? <Skeleton h={100} /> : (
          <table className="table-plain">
            <thead><tr><th>المادة</th><th className="end">الكمية</th><th className="end">الكلفة</th><th className="end">المجموع</th></tr></thead>
            <tbody>{items.data.map((i) => (
              <tr key={i.id}><td style={{ whiteSpace: 'normal' }}>{i.name}{i.variant_title ? <span className="dim"> — {i.variant_title}</span> : null}{i.lot_code || i.expiry_date ? <div className="small faint">دفعة {i.lot_code ?? '—'} {i.expiry_date ? `· ${fmt.date(i.expiry_date)}` : ''}</div> : null}{i.serials.length ? <div className="small faint code">{i.serials.join('، ')}</div> : null}</td>
                <td className="end num">{fmt.qty(i.qty)}</td><td className="end">{m(i.unit_price, inv.currency)}</td><td className="end">{m(i.line_total, inv.currency)}</td></tr>
            ))}</tbody>
          </table>
        )}
      </div>
      <div className="kv-list" style={{ marginTop: 14 }}>
        {inv.discount ? <div><span>الخصم</span><span>{m(inv.discount, inv.currency)}</span></div> : null}
        <div><span>الإجمالي</span><b>{m(inv.total, inv.currency)}</b></div>
        <div><span>المدفوع</span><span>{m(inv.paid, inv.currency)}</span></div>
        <div><span>المتبقي</span><b className={inv.due > 0 ? 'qty-neg' : ''}>{m(inv.due, inv.currency)}</b></div>
      </div>
      {inv.note ? <p className="dim">{inv.note}</p> : null}
    </Drawer>
  );
}
