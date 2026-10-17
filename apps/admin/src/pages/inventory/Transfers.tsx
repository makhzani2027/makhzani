import { useEffect, useState } from 'react';
import { Alert, Button, DataTable, Field, Icon, IconButton, Input, Modal, NumberInput, PageHeader, Pagination, Select, Skeleton, Thumb, type Column } from '../../ui';
import { useAuth } from '../../lib/auth';
import { useAction, useLoad } from '../../lib/hooks';
import { useFmt } from '../../lib/settings';
import { escapeHtml, printHtml } from '../../lib/print';
import { VariantPicker } from '../catalog/components/VariantPicker';
import { levelsIn, listTransfers, listWarehouses, transferLines, transferStock, type TransferRow } from './api';
import { serialList, useLines } from './components/lines';
import '../catalog/catalog.css';

export default function Transfers() {
  const fmt = useFmt();
  const { can } = useAuth();
  const [page, setPage] = useState(1);
  const list = useLoad(() => listTransfers(page, 25), [page]);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<TransferRow | null>(null);
  const columns: Column<TransferRow>[] = [
    { key: 'n', header: 'السند', primary: true, cell: (t) => <span className="code">{t.number}</span> },
    { key: 'r', header: 'من ← إلى', cell: (t) => <span className="row nowrap" style={{ gap: 6 }}>{t.from_name}<Icon name="arrowLeft" size={14} />{t.to_name}</span> },
    { key: 'l', header: 'الأسطر', end: true, cell: (t) => fmt.num(t.lines) },
    { key: 'u', header: 'القطع', end: true, cell: (t) => fmt.qty(t.units) },
    { key: 'd', header: 'التاريخ', cell: (t) => fmt.date(t.created_at, true) },
    { key: 's', header: 'بواسطة', hideOnMobile: true, cell: (t) => <span className="dim">{t.staff_name ?? '—'}</span> },
  ];
  return (
    <>
      <PageHeader title="النقل بين المخازن" description="ينقص من المخزن المصدر ويزيد في الوجهة بسند واحد، والدفعات تنتقل بتواريخها."
        actions={can('inventory.transfer') ? <Button variant="primary" icon="transfer" onClick={() => setOpen(true)}>نقل جديد</Button> : null} />
      <DataTable rows={list.data?.rows} columns={columns} rowKey={(t) => t.id} loading={list.loading} error={list.error} onRetry={list.reload} onRowClick={setView}
        empty={{ icon: 'transfer', title: 'لا عمليات نقل بعد', action: <Button variant="primary" onClick={() => setOpen(true)}>نقل جديد</Button> }}
        footer={list.data ? <Pagination page={page} pageSize={25} total={list.data.total} onPage={setPage} /> : null} />
      {open ? <TransferModal onClose={() => setOpen(false)} onDone={() => { setPage(1); void list.reload(); }} /> : null}
      {view ? <TransferView t={view} onClose={() => setView(null)} /> : null}
    </>
  );
}

function TransferModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const fmt = useFmt();
  const whs = useLoad(() => listWarehouses(), []);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [note, setNote] = useState('');
  const L = useLines();
  const ids = L.lines.map((l) => l.variant_id).join(',');
  const levels = useLoad(() => (from && ids ? levelsIn(from, ids.split(',')) : Promise.resolve({})), [from, ids]);
  const save = useAction(transferStock, { success: 'تم النقل' });
  useEffect(() => {
    if (!whs.data?.length) return;
    if (!from) setFrom((whs.data.find((w) => w.is_default) ?? whs.data[0]).id);
    if (!to) setTo(whs.data.find((w) => !w.is_default)?.id ?? '');
  }, [whs.data, from, to]);
  const avail = (vid: string) => { const l = (levels.data as Record<string, { qty: number; reserved: number }> | undefined)?.[vid]; return l ? l.qty - l.reserved : 0; };
  const over = L.lines.some((l) => (l.qty ?? 0) > avail(l.variant_id));
  const badSerials = L.lines.some((l) => l.track_serials && serialList(l.serials).length !== (l.qty ?? 0));
  return (
    <Modal open onClose={onClose} title="نقل بين المخازن" width={860}
      footer={<><Button variant="primary" size="lg" loading={save.busy} disabled={!L.lines.length || !from || !to || from === to || over || badSerials} onClick={async () => {
        const r = await save.run({ from_warehouse_id: from, to_warehouse_id: to, note: note.trim() || null, items: L.lines.map((l) => ({ variant_id: l.variant_id, qty: l.qty ?? 0, ...(l.track_serials ? { serials: serialList(l.serials) } : {}) })) });
        if (r) { onDone(); onClose(); }
      }}>تنفيذ النقل ({fmt.qty(L.units)} قطعة)</Button><Button size="lg" onClick={onClose}>إلغاء</Button></>}>
      <div className="grid-3">
        <Field label="من مخزن"><Select value={from} onChange={(e) => setFrom(e.target.value)} options={(whs.data ?? []).map((w) => ({ value: w.id, label: w.name }))} /></Field>
        <Field label="إلى مخزن" error={from && from === to ? 'اختر مخزناً مختلفاً' : null}><Select value={to} onChange={(e) => setTo(e.target.value)} placeholder="اختر الوجهة" options={(whs.data ?? []).map((w) => ({ value: w.id, label: w.name }))} /></Field>
        <Field label="ملاحظة"><Input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
      </div>
      <div className="scan-box"><VariantPicker onPick={(h) => L.add(h)} autoFocus showStock={false} /></div>
      {over ? <Alert tone="warning">بعض الكميات أكبر من المتاح في المخزن المصدر.</Alert> : null}
      {L.lines.length ? (
        <div className="scroll-x" style={{ maxHeight: 360 }}>
          <table className="lines-table">
            <thead><tr><th>المنتج</th><th className="end">متاح في المصدر</th><th>الكمية</th>{L.lines.some((l) => l.track_serials) ? <th>الأرقام التسلسلية</th> : null}<th /></tr></thead>
            <tbody>{L.lines.map((l) => (
              <tr key={l.variant_id} className={Date.now() - l.added < 900 ? 'just-added' : ''}>
                <td className="line-main"><div className="pcell"><Thumb imageKey={l.cover_key} size="sm" /><div className="meta"><b className="truncate">{l.name}</b><span>{l.title} <span className="code">{l.sku}</span></span></div></div></td>
                <td data-label="المتاح" className={`end ${(l.qty ?? 0) > avail(l.variant_id) ? 'qty-neg' : 'num'}`}>{levels.loading ? '…' : fmt.qty(avail(l.variant_id))}</td>
                <td data-label="الكمية" style={{ width: 110 }}><NumberInput value={l.qty} onChange={(n) => L.update(l.variant_id, { qty: n })} allowDecimal min={0} ariaLabel="الكمية" /></td>
                {L.lines.some((x) => x.track_serials) ? <td data-label="الأرقام">{l.track_serials ? <Input value={l.serials} dir="ltr" data-scan-target="keep" onChange={(e) => L.update(l.variant_id, { serials: e.target.value })} placeholder={`${fmt.num(l.qty ?? 0)} رقم مفصولة بفاصلة`} aria-label="الأرقام التسلسلية" /> : null}</td> : null}
                <td><IconButton icon="trash" label="حذف" onClick={() => L.remove(l.variant_id)} /></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ) : <p className="dim small" style={{ textAlign: 'center', margin: '12px 0' }}>امسح المنتجات أو ابحث عنها لإضافتها.</p>}
    </Modal>
  );
}

function TransferView({ t, onClose }: { t: TransferRow; onClose: () => void }) {
  const fmt = useFmt();
  const lines = useLoad(() => transferLines(t.id), [t.id]);
  const print = () => void printHtml(`<h2>سند نقل ${escapeHtml(t.number)}</h2><p>من ${escapeHtml(t.from_name)} إلى ${escapeHtml(t.to_name)} — ${escapeHtml(fmt.date(t.created_at, true))}${t.note ? `<br>${escapeHtml(t.note)}` : ''}</p>
    <table><thead><tr><th>المنتج</th><th>SKU</th><th>الكمية</th></tr></thead><tbody>${(lines.data ?? []).map((l) => `<tr><td>${escapeHtml(l.name)}${l.variant_title ? ` — ${escapeHtml(l.variant_title)}` : ''}</td><td>${escapeHtml(l.sku)}</td><td>${escapeHtml(fmt.qty(l.qty))}</td></tr>`).join('')}</tbody></table>
    <p style="margin-top:40px">المُسلِّم: ____________ &nbsp;&nbsp; المُستلِم: ____________</p>`, { paper: 'A4', title: t.number, css: 'table{width:100%;border-collapse:collapse;font-size:12px}th,td{border:1px solid #bbb;padding:5px 6px;text-align:right}' });
  return (
    <Modal open onClose={onClose} title={`سند نقل ${t.number}`} subtitle={`${t.from_name} ← ${t.to_name} · ${fmt.date(t.created_at, true)}`} width={600}
      footer={<><Button icon="printer" onClick={print} disabled={!lines.data}>طباعة</Button><Button onClick={onClose}>إغلاق</Button></>}>
      {t.note ? <p className="dim">{t.note}</p> : null}
      {!lines.data ? <Skeleton h={80} /> : (
        <table className="table-plain"><thead><tr><th>المنتج</th><th className="end">الكمية</th></tr></thead>
          <tbody>{lines.data.map((l) => <tr key={l.variant_id}><td>{l.name}{l.variant_title ? <span className="dim"> — {l.variant_title}</span> : null} <span className="code faint">{l.sku}</span></td><td className="end num">{fmt.qty(l.qty)}</td></tr>)}</tbody></table>
      )}
    </Modal>
  );
}
