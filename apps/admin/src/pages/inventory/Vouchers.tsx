import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { STOCK_VOUCHER_KIND, type StockVoucherKind } from '@raqeem/shared';
import { Badge, Button, DataTable, Modal, PageHeader, Pagination, Skeleton, type Column } from '../../ui';
import { useAuth } from '../../lib/auth';
import { useLoad } from '../../lib/hooks';
import { useFmt } from '../../lib/settings';
import { escapeHtml, printHtml } from '../../lib/print';
import { listVouchers, voucherLines, type VoucherRow } from './api-extra';
import { VoucherEditor } from './components/VoucherEditor';
import '../catalog/catalog.css';

const PAGES: Record<string, { kind: StockVoucherKind; title: string; text: string }> = {
  in: { kind: 'in', title: 'إدخال مخزني', text: 'إدخال بضاعة بلا فاتورة شراء: هدية، تصحيح، إنتاج داخلي.' },
  out: { kind: 'out', title: 'إخراج مخزني', text: 'إخراج للاستعمال الداخلي أو لسبب موثّق، بلا بيع.' },
  damage: { kind: 'damage', title: 'التالف', text: 'الكسر والتلف والمفقود ومنتهي الصلاحية، بسبب واضح.' },
};

/** سندات الإدخال/الإخراج/التالف — الصفحة نفسها لثلاثة مسارات */
export default function Vouchers() {
  const { pathname } = useLocation();
  const page = PAGES[pathname.split('/').pop() ?? 'in'] ?? PAGES.in;
  return <VoucherList key={page.kind} {...page} />;
}

function VoucherList({ kind, title, text }: { kind: StockVoucherKind; title: string; text: string }) {
  const fmt = useFmt();
  const { can } = useAuth();
  const [p, setP] = useState(1);
  const list = useLoad(() => listVouchers([kind], p, 25), [kind, p]);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<VoucherRow | null>(null);
  const columns: Column<VoucherRow>[] = [
    { key: 'n', header: 'السند', primary: true, cell: (v) => <span className="code">{v.number}</span> },
    { key: 'd', header: 'التاريخ', cell: (v) => fmt.date(v.created_at, true) },
    { key: 'w', header: 'المخزن', cell: (v) => v.warehouse_name },
    { key: 'r', header: 'السبب', cell: (v) => <span>{v.reason}{v.note ? <span className="faint"> — {v.note}</span> : null}</span> },
    { key: 'u', header: 'القطع', end: true, cell: (v) => <span className={kind === 'in' ? 'qty-pos' : 'qty-neg'}>{kind === 'in' ? '+' : '−'}{fmt.qty(v.units)}</span> },
    { key: 's', header: 'بواسطة', hideOnMobile: true, cell: (v) => <span className="dim">{v.staff_name ?? '—'}</span> },
  ];
  return (
    <>
      <PageHeader title={title} description={text} actions={can('inventory.adjust') ? <Button variant="primary" icon="plus" onClick={() => setOpen(true)}>سند جديد</Button> : null} />
      <DataTable rows={list.data?.rows} columns={columns} rowKey={(v) => v.id} loading={list.loading} error={list.error} onRetry={list.reload} onRowClick={setView}
        empty={{ icon: kind === 'in' ? 'stockIn' : kind === 'out' ? 'stockOut' : 'damaged', title: 'لا سندات بعد', action: <Button variant="primary" onClick={() => setOpen(true)}>سند جديد</Button> }}
        footer={list.data ? <Pagination page={p} pageSize={25} total={list.data.total} onPage={setP} /> : null} />
      <VoucherEditor kind={kind} open={open} onClose={() => setOpen(false)} onDone={() => { setP(1); void list.reload(); }} />
      {view ? <VoucherView v={view} onClose={() => setView(null)} /> : null}
    </>
  );
}

export function VoucherView({ v, onClose }: { v: VoucherRow; onClose: () => void }) {
  const fmt = useFmt();
  const lines = useLoad(() => voucherLines(v.id), [v.id]);
  const print = () => void printHtml(`<h2>${escapeHtml(STOCK_VOUCHER_KIND[v.kind].label)} ${escapeHtml(v.number)}</h2>
    <p>${escapeHtml(fmt.date(v.created_at, true))} — ${escapeHtml(v.warehouse_name)}${v.customer_name ? ` — ${escapeHtml(v.customer_name)}` : ''}<br>السبب: ${escapeHtml(v.reason)}${v.note ? ` — ${escapeHtml(v.note)}` : ''}</p>
    <table><thead><tr><th>المنتج</th><th>SKU</th><th>الدفعة</th><th>الكمية</th></tr></thead><tbody>${(lines.data ?? []).map((l) => `<tr><td>${escapeHtml(l.name)}${l.variant_title ? ` — ${escapeHtml(l.variant_title)}` : ''}</td><td>${escapeHtml(l.sku)}</td><td>${escapeHtml(l.lot_code ?? '')} ${l.expiry_date ? escapeHtml(fmt.date(l.expiry_date)) : ''}</td><td>${escapeHtml(fmt.qty(l.qty))}</td></tr>`).join('')}</tbody></table>
    <p style="margin-top:40px">توقيع المستلم: ____________ &nbsp;&nbsp; توقيع أمين المخزن: ____________</p>`,
  { paper: 'A4', title: v.number, css: 'table{width:100%;border-collapse:collapse;font-size:12px}th,td{border:1px solid #bbb;padding:5px 6px;text-align:right}' });
  return (
    <Modal open onClose={onClose} title={`${STOCK_VOUCHER_KIND[v.kind].label} ${v.number}`} subtitle={`${fmt.date(v.created_at, true)} · ${v.warehouse_name}${v.staff_name ? ` · ${v.staff_name}` : ''}`} width={640}
      footer={<><Button icon="printer" onClick={print} disabled={!lines.data}>طباعة A4</Button><Button onClick={onClose}>إغلاق</Button></>}>
      <div className="row" style={{ gap: 6 }}><Badge tone={STOCK_VOUCHER_KIND[v.kind].tone}>{v.reason}</Badge>{v.customer_name ? <Badge tone="info">{v.customer_name}</Badge> : null}</div>
      {v.note ? <p className="dim">{v.note}</p> : null}
      {!lines.data ? <Skeleton h={80} /> : (
        <table className="table-plain">
          <thead><tr><th>المنتج</th><th>الدفعة</th><th className="end">الكمية</th></tr></thead>
          <tbody>{lines.data.map((l) => <tr key={l.variant_id}><td>{l.name}{l.variant_title ? <span className="dim"> — {l.variant_title}</span> : null} <span className="code faint">{l.sku}</span></td><td>{l.lot_code ?? '—'} {l.expiry_date ? fmt.date(l.expiry_date) : ''}</td><td className="end num">{fmt.qty(l.qty)}</td></tr>)}</tbody>
        </table>
      )}
    </Modal>
  );
}
