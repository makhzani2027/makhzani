import { useState } from 'react';
import { STOCK_VOUCHER_KIND } from '@raqeem/shared';
import { Badge, Button, DataTable, Field, Modal, NumberInput, PageHeader, Pagination, Segmented, Stat, Tabs, type Column } from '../../ui';
import { useAction, useLoad } from '../../lib/hooks';
import { useFmt } from '../../lib/settings';
import { useCounts } from '../../lib/counts';
import { listVouchers, outstandingSamples, postStockVoucher, type SampleOutstanding, type VoucherRow } from './api-extra';
import { VoucherEditor } from './components/VoucherEditor';
import { VoucherView } from './Vouchers';
import '../catalog/catalog.css';

/** العينات: من أخذ ماذا، وما الذي ما زال خارج المخزن */
export default function Samples() {
  const fmt = useFmt();
  const [tab, setTab] = useState<'out' | 'log'>('out');
  const [show, setShow] = useState<'open' | 'all'>('open');
  const list = useLoad(outstandingSamples, []);
  const [page, setPage] = useState(1);
  const log = useLoad(() => (tab === 'log' ? listVouchers(['sample_out', 'sample_return'], page, 25) : Promise.resolve(null)), [tab, page]);
  const [editor, setEditor] = useState(false);
  const [ret, setRet] = useState<SampleOutstanding | null>(null);
  const [view, setView] = useState<VoucherRow | null>(null);
  const rows = list.data?.filter((r) => show === 'all' || r.outstanding > 0);
  const out = (list.data ?? []).filter((r) => r.outstanding > 0);
  const columns: Column<SampleOutstanding>[] = [
    { key: 'c', header: 'الزبون', primary: true, cell: (r) => <b>{r.customer_name}</b> },
    { key: 'p', header: 'المنتج', cell: (r) => <span>{r.name}{r.variant_title ? <span className="dim"> — {r.variant_title}</span> : null} <span className="code faint">{r.sku}</span></span> },
    { key: 'w', header: 'من مخزن', hideOnMobile: true, cell: (r) => r.warehouse_name },
    { key: 'o', header: 'خرج', end: true, cell: (r) => <span className="num">{fmt.qty(r.out_qty)}</span> },
    { key: 'r', header: 'رجع', end: true, cell: (r) => <span className="num">{fmt.qty(r.returned_qty)}</span> },
    { key: 'x', header: 'ما زال عنده', end: true, cell: (r) => (r.outstanding > 0 ? <Badge tone="warning">{fmt.qty(r.outstanding)}</Badge> : <Badge tone="success">رجعت كلها</Badge>) },
    { key: 'd', header: 'آخر خروج', hideOnMobile: true, cell: (r) => <span className="dim">{fmt.ago(r.last_out_at)}</span> },
    { key: 'a', header: '', shrink: true, cell: (r) => (r.outstanding > 0 ? <Button size="sm" icon="return" onClick={(e) => { e.stopPropagation(); setRet(r); }}>تسجيل رجوع</Button> : null) },
  ];
  return (
    <>
      <PageHeader title="العينات" description="عينة تخرج لزبون أو معرض تُخصم من الرصيد، وتُضاف حين ترجع."
        actions={<Button variant="primary" icon="package" onClick={() => setEditor(true)}>إخراج عينة</Button>} />
      <div className="stat-row" style={{ marginBottom: 16 }}>
        <Stat label="عينات خارج المخزن" icon="package" value={fmt.qty(out.reduce((s, r) => s + r.outstanding, 0))} />
        <Stat label="زبائن لديهم عينات" icon="users" value={fmt.num(new Set(out.map((r) => r.customer_id)).size)} />
      </div>
      <Tabs value={tab} onChange={setTab} items={[{ value: 'out', label: 'عند الزبائن' }, { value: 'log', label: 'السجل' }]} />
      <div style={{ marginTop: 14 }}>
        {tab === 'out' ? (
          <DataTable rows={rows} columns={columns} rowKey={(r) => `${r.customer_id}|${r.variant_id}`} loading={list.loading} error={list.error} onRetry={list.reload}
            toolbar={<Segmented value={show} onChange={setShow} options={[{ value: 'open', label: 'لم ترجع' }, { value: 'all', label: 'الكل' }]} />}
            empty={{ icon: 'package', title: show === 'open' ? 'لا عينات خارج المخزن' : 'لا عينات بعد', action: <Button onClick={() => setEditor(true)}>إخراج عينة</Button> }} />
        ) : (
          <DataTable rows={log.data?.rows} rowKey={(v) => v.id} loading={log.loading} error={log.error} onRetry={log.reload} onRowClick={setView}
            columns={[
              { key: 'n', header: 'السند', primary: true, cell: (v) => <span><span className="code">{v.number}</span> <Badge tone={STOCK_VOUCHER_KIND[v.kind].tone}>{STOCK_VOUCHER_KIND[v.kind].label}</Badge></span> },
              { key: 'c', header: 'الزبون', cell: (v) => v.customer_name ?? '—' },
              { key: 'd', header: 'التاريخ', cell: (v) => fmt.date(v.created_at, true) },
              { key: 'u', header: 'القطع', end: true, cell: (v) => fmt.qty(v.units) },
              { key: 's', header: 'بواسطة', hideOnMobile: true, cell: (v) => <span className="dim">{v.staff_name ?? '—'}</span> },
            ]}
            empty={{ icon: 'history', title: 'لا سندات عينات بعد' }}
            footer={log.data ? <Pagination page={page} pageSize={25} total={log.data.total} onPage={setPage} /> : null} />
        )}
      </div>
      <VoucherEditor kind="sample_out" open={editor} onClose={() => setEditor(false)} onDone={() => { void list.reload(); void log.reload(); }} />
      {ret ? <ReturnModal row={ret} onClose={() => setRet(null)} onDone={() => { void list.reload(); void log.reload(); }} /> : null}
      {view ? <VoucherView v={view} onClose={() => setView(null)} /> : null}
    </>
  );
}

function ReturnModal({ row, onClose, onDone }: { row: SampleOutstanding; onClose: () => void; onDone: () => void }) {
  const fmt = useFmt();
  const counts = useCounts();
  const [qty, setQty] = useState<number | null>(row.outstanding);
  const save = useAction(postStockVoucher, { success: 'سُجّل رجوع العينة' });
  return (
    <Modal open onClose={onClose} title="رجوع عينة" subtitle={`${row.customer_name} — ${row.name}${row.variant_title ? ` (${row.variant_title})` : ''}`} width={440}
      footer={<><Button variant="primary" loading={save.busy} disabled={!qty || qty > row.outstanding} onClick={async () => {
        const r = await save.run({ kind: 'sample_return', warehouse_id: row.warehouse_id, customer_id: row.customer_id, reason: 'رجوع عينة', items: [{ variant_id: row.variant_id, qty: qty ?? 0 }] });
        if (r) { counts.refresh(); onDone(); onClose(); }
      }}>تسجيل الرجوع</Button><Button onClick={onClose}>إلغاء</Button></>}>
      <Field label="الكمية الراجعة" hint={`عنده ${fmt.qty(row.outstanding)} — تعود إلى ${row.warehouse_name}`}><NumberInput value={qty} onChange={setQty} min={0} max={row.outstanding} allowDecimal autoFocus /></Field>
    </Modal>
  );
}
