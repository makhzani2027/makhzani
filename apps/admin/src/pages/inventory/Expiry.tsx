import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Button, DataTable, PageHeader, Segmented, Stat, askConfirm, type Column } from '../../ui';
import { useAuth } from '../../lib/auth';
import { useAction, useLoad } from '../../lib/hooks';
import { useFmt } from '../../lib/settings';
import { useCounts } from '../../lib/counts';
import { listWarehouses } from './api';
import { nearExpiry, postStockVoucher, type LotRow } from './api-extra';
import '../catalog/catalog.css';

/** الصلاحية ← near_expiry(days): المنتهي أولاً ثم الأقرب، مع إخراج الدفعة كتالف بضغطة */
export default function Expiry() {
  const fmt = useFmt();
  const { can } = useAuth();
  const counts = useCounts();
  const withCost = can('costs.view');
  const [days, setDays] = useState('30');
  const list = useLoad(() => nearExpiry(Number(days), withCost), [days, withCost]);
  const whs = useLoad(() => listWarehouses(true), []);
  const dmg = useAction(postStockVoucher, { success: 'أُخرجت الدفعة كتالف' });
  const whName = (r: LotRow) => r.warehouse_name || whs.data?.find((w) => w.id === r.warehouse_id)?.name || '';
  const rows = list.data;
  const expired = (rows ?? []).filter((r) => (r.days_left ?? 0) < 0);
  const value = (rs: LotRow[]) => rs.reduce((s, r) => s + r.qty * (r.unit_cost ?? 0), 0);
  const columns: Column<LotRow>[] = [
    { key: 'p', header: 'المنتج', primary: true, cell: (r) => <div><Link to={`/products/${r.product_id}`}><b>{r.name}</b></Link>{r.variant_title ? <span className="dim"> — {r.variant_title}</span> : null}<div className="small faint code">{r.sku}</div></div> },
    { key: 'l', header: 'الدفعة', cell: (r) => <span className="code">{r.lot_code}</span> },
    { key: 'w', header: 'المخزن', hideOnMobile: true, cell: (r) => whName(r) },
    { key: 'e', header: 'الانتهاء', cell: (r) => (r.expiry_date ? fmt.date(r.expiry_date) : '—') },
    { key: 'd', header: 'المتبقي', cell: (r) => { const d = r.days_left ?? 0; return d < 0 ? <Badge tone="danger">منتهية منذ {fmt.count(-d, { one: 'يوم', two: 'يومين', few: 'أيام', many: 'يوماً' })}</Badge> : d === 0 ? <Badge tone="danger">تنتهي اليوم</Badge> : <Badge tone={d <= 7 ? 'warning' : 'neutral'}>{fmt.count(d, { one: 'يوم واحد', two: 'يومان', few: 'أيام', many: 'يوماً' })}</Badge>; } },
    { key: 'q', header: 'الكمية', end: true, cell: (r) => <span className="num">{fmt.qty(r.qty)}</span> },
    ...(withCost ? [{ key: 'v', header: 'القيمة', end: true, hideOnMobile: true, cell: (r: LotRow) => <span className="money">{fmt.money(r.qty * (r.unit_cost ?? 0))}</span> }] : []),
    ...(can('inventory.adjust') ? [{
      key: 'x', header: '', shrink: true, cell: (r: LotRow) => <Button size="sm" variant="danger" icon="damaged" loading={dmg.busy} onClick={async (e) => {
        e.stopPropagation();
        if (!(await askConfirm({ title: 'إخراج الدفعة كتالف؟', body: `${r.name} — الدفعة ${r.lot_code}: ${fmt.qty(r.qty)} قطعة من ${whName(r)}.`, danger: true, confirm: 'إخراج كتالف' }))) return;
        const ok = await dmg.run({ kind: 'damage', warehouse_id: r.warehouse_id, reason: 'منتهي الصلاحية', note: `دفعة ${r.lot_code}`, items: [{ variant_id: r.variant_id, qty: r.qty, lot_code: r.lot_code }] });
        if (ok) { counts.refresh(); void list.reload(); }
      }}>تالف</Button>,
    }] : []),
  ];
  return (
    <>
      <PageHeader title="الصلاحية" description="الدفعات المنتهية والقريبة من الانتهاء. البيع يأخذ الأقرب انتهاءً أولاً تلقائياً." />
      <div className="stat-row" style={{ marginBottom: 16 }}>
        <Stat label="دفعات منتهية" icon="alert" tone={expired.length ? 'hero' : undefined} value={fmt.num(expired.length)} foot={withCost ? fmt.money(value(expired)) : undefined} />
        <Stat label={`تنتهي خلال ${fmt.num(Number(days))} يوماً`} icon="clock" value={fmt.num((rows ?? []).length - expired.length)} foot={withCost ? fmt.money(value((rows ?? []).filter((r) => (r.days_left ?? 0) >= 0))) : undefined} />
      </div>
      <DataTable rows={rows} columns={columns} rowKey={(r) => r.id} loading={list.loading} error={list.error} onRetry={list.reload}
        toolbar={<Segmented value={days} onChange={setDays} options={[{ value: '7', label: 'أسبوع' }, { value: '30', label: '٣٠ يوماً' }, { value: '60', label: '٦٠ يوماً' }, { value: '90', label: '٩٠ يوماً' }]} />}
        empty={{ icon: 'checkCircle', title: 'لا دفعات قريبة من الانتهاء', text: 'تظهر هنا دفعات المنتجات التي تتتبع الصلاحية.' }} />
    </>
  );
}
