import { useEffect, useState } from 'react';
import { STOCK_VOUCHER_KIND, type StockVoucherKind } from '@raqeem/shared';
import { Alert, Button, Field, IconButton, Input, Modal, MoneyInput, NumberInput, Select, Textarea, Thumb } from '../../../ui';
import { useAuth } from '../../../lib/auth';
import { useAction, useDebounced, useLoad } from '../../../lib/hooks';
import { useFmt } from '../../../lib/settings';
import { useCounts } from '../../../lib/counts';
import { VariantPicker } from '../../catalog/components/VariantPicker';
import { listWarehouses } from '../api';
import { postStockVoucher, searchCustomers } from '../api-extra';
import { useLines } from './lines';

const REASONS: Record<StockVoucherKind, string[]> = {
  in: ['هدية من مورد', 'تصحيح رصيد', 'إنتاج داخلي', 'بضاعة أمانة'],
  out: ['استعمال داخلي', 'عرض في الواجهة', 'هدية لزبون', 'تصحيح رصيد'],
  damage: ['كسر', 'تلف بالرطوبة', 'منتهي الصلاحية', 'مفقود'],
  sample_out: ['عينة لزبون', 'عينة لمعرض', 'تجربة قبل الشراء'],
  sample_return: ['رجوع عينة'],
};

/**
 * سند مخزني ← post_stock_voucher {kind, warehouse_id, customer_id?, reason, note?, items:[{variant_id, qty, unit_cost?, lot_code?, expiry_date?}]}
 */
export function VoucherEditor({ kind, open, onClose, onDone, customer }: {
  kind: StockVoucherKind; open: boolean; onClose: () => void; onDone: (r: { voucher_id: string; number: string }) => void;
  customer?: { id: string; name: string } | null;
}) {
  const fmt = useFmt();
  const { can } = useAuth();
  const counts = useCounts();
  const whs = useLoad(() => listWarehouses(), []);
  const [wh, setWh] = useState('');
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [cust, setCust] = useState<{ id: string; name: string } | null>(customer ?? null);
  const [cq, setCq] = useState('');
  const dcq = useDebounced(cq, 200);
  const custs = useLoad(() => (kind.startsWith('sample') && !cust ? searchCustomers(dcq) : Promise.resolve([])), [dcq, kind, !!cust]);
  const L = useLines();
  const save = useAction(postStockVoucher, { success: `سُجّل ${STOCK_VOUCHER_KIND[kind].label}` });
  const incoming = kind === 'in' || kind === 'sample_return';
  const isSample = kind === 'sample_out' || kind === 'sample_return';

  useEffect(() => { if (open) { L.setLines([]); setReason(REASONS[kind][0] ?? ''); setNote(''); setCust(customer ?? null); } }, [open, kind]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!wh && whs.data?.length) setWh((whs.data.find((w) => w.is_default) ?? whs.data[0]).id); }, [wh, whs.data]);

  const missingExpiry = kind === 'in' && L.lines.some((l) => l.track_expiry && !l.expiry_date);
  const over = !incoming && L.lines.some((l) => (l.qty ?? 0) > l.available);
  const submit = async () => {
    const r = await save.run({
      kind, warehouse_id: wh, customer_id: cust?.id ?? null, reason, note: note.trim() || null,
      items: L.lines.map((l) => ({
        variant_id: l.variant_id, qty: l.qty ?? 0,
        ...(kind === 'in' && l.unit_cost !== null ? { unit_cost: l.unit_cost } : {}),
        ...(kind === 'in' && l.track_expiry ? { lot_code: l.lot_code.trim() || null, expiry_date: l.expiry_date || null } : {}),
      })),
    });
    if (r) { counts.refresh(); onDone(r); onClose(); }
  };
  return (
    <Modal open={open} onClose={onClose} title={STOCK_VOUCHER_KIND[kind].label} subtitle={incoming ? 'يزيد الرصيد في المخزن المختار.' : 'ينقص الرصيد من المخزن المختار.'} width={880}
      footer={<>
        <Button variant="primary" size="lg" loading={save.busy} disabled={!L.lines.length || !reason.trim() || (isSample && !cust)} onClick={submit}>حفظ السند ({fmt.qty(L.units)} قطعة)</Button>
        <Button size="lg" onClick={onClose}>إلغاء</Button>
      </>}>
      <div className="grid-3">
        <Field label="المخزن"><Select value={wh} onChange={(e) => setWh(e.target.value)} options={(whs.data ?? []).map((w) => ({ value: w.id, label: w.name }))} /></Field>
        <Field label="السبب" required><Input value={reason} onChange={(e) => setReason(e.target.value)} list={`reasons-${kind}`} /></Field>
        {isSample ? (
          <Field label="الزبون" required>
            {cust ? <div className="row nowrap" style={{ gap: 6 }}><b className="truncate grow">{cust.name}</b>{!customer ? <Button size="sm" variant="ghost" onClick={() => setCust(null)}>تغيير</Button> : null}</div>
              : <><Input value={cq} onChange={(e) => setCq(e.target.value)} placeholder="ابحث بالاسم أو الهاتف" list="voucher-custs" onBlur={() => { const c = custs.data?.find((x) => x.name === cq); if (c) setCust(c); }} />
                <datalist id="voucher-custs">{(custs.data ?? []).map((c) => <option key={c.id} value={c.name}>{c.phone ?? ''}</option>)}</datalist></>}
          </Field>
        ) : <Field label="ملاحظة"><Input value={note} onChange={(e) => setNote(e.target.value)} /></Field>}
      </div>
      <datalist id={`reasons-${kind}`}>{REASONS[kind].map((r) => <option key={r} value={r} />)}</datalist>
      <div className="scan-box"><VariantPicker onPick={(h) => L.add(h)} autoFocus /></div>
      {missingExpiry ? <Alert tone="warning">منتجات تتتبع الصلاحية: اكتب تاريخ انتهاء كل دفعة داخلة.</Alert> : null}
      {over ? <Alert tone="warning">بعض الكميات أكبر من المتاح في المخزن.</Alert> : null}
      {L.lines.length ? (
        <div className="scroll-x" style={{ maxHeight: 380 }}>
          <table className="lines-table">
            <thead><tr><th>المنتج</th><th>المتاح</th><th>الكمية</th>{kind === 'in' && can('costs.view') ? <th>تكلفة القطعة</th> : null}{kind === 'in' && L.lines.some((l) => l.track_expiry) ? <th>الدفعة والانتهاء</th> : null}<th /></tr></thead>
            <tbody>{L.lines.map((l) => (
              <tr key={l.variant_id} className={Date.now() - l.added < 900 ? 'just-added' : ''}>
                <td className="line-main"><div className="pcell"><Thumb imageKey={l.cover_key} size="sm" /><div className="meta"><b className="truncate">{l.name}</b><span>{l.title} <span className="code">{l.sku}</span></span></div></div></td>
                <td data-label="المتاح" className="num">{fmt.qty(l.available)}</td>
                <td data-label="الكمية" style={{ width: 110 }}><NumberInput value={l.qty} onChange={(n) => L.update(l.variant_id, { qty: n })} allowDecimal min={0} ariaLabel="الكمية" /></td>
                {kind === 'in' && can('costs.view') ? <td data-label="التكلفة" style={{ width: 140 }}><MoneyInput value={l.unit_cost} onChange={(n) => L.update(l.variant_id, { unit_cost: n })} placeholder="متوسط التكلفة" ariaLabel="التكلفة" /></td> : null}
                {kind === 'in' && L.lines.some((x) => x.track_expiry) ? <td data-label="الدفعة">{l.track_expiry ? <div className="row nowrap" style={{ gap: 4 }}><Input value={l.lot_code} onChange={(e) => L.update(l.variant_id, { lot_code: e.target.value })} placeholder="رقم الدفعة" aria-label="رقم الدفعة" /><Input type="date" value={l.expiry_date} onChange={(e) => L.update(l.variant_id, { expiry_date: e.target.value })} aria-label="الانتهاء" /></div> : <span className="faint">—</span>}</td> : null}
                <td><IconButton icon="trash" label="حذف السطر" onClick={() => L.remove(l.variant_id)} /></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ) : <p className="dim small" style={{ textAlign: 'center', margin: '12px 0' }}>امسح المنتجات أو ابحث عنها لإضافتها.</p>}
      {isSample ? <Field label="ملاحظة"><Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></Field> : null}
    </Modal>
  );
}
