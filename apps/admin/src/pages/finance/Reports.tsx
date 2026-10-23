/** التقارير: المبيعات، الأرباح، المنتجات، تقييم المخزون، الزبائن، الموظفون، المصروفات — مع CSV وطباعة A4 */
import { useMemo, useState } from 'react';
import { BarChart, Button, Card, ErrorState, LineChart, PageHeader, Skeleton, Stat, Tabs, Alert } from '../../ui';
import { useAuth } from '../../lib/auth';
import { useLoad } from '../../lib/hooks';
import { useFmt, useSettings } from '../../lib/settings';
import { downloadText, toCsv } from '../../lib/csv';
import { buildReportA4, printDoc, type ReportTable } from '../../print';
import { dashboardSummary, salesSeries, topProducts, type Bucket } from '../sales/api';
import { staffNames } from '../sales/data/lookups';
import { RangePicker, useMoney, useRange } from '../sales/components/common';
import { customerNames, inventoryValuation, invoicesIn, iqdOf, listExpenses } from './api';
import '../sales/sales.css';

type Tab = 'sales' | 'profit' | 'products' | 'inventory' | 'customers' | 'staff' | 'expenses';
interface View { kpis: { label: string; value: string }[]; table: ReportTable; chart?: { labels: string[]; values: number[]; name: string; line?: boolean } }

export default function Reports() {
  const fmt = useFmt();
  const m = useMoney();
  const { store } = useSettings();
  const { can } = useAuth();
  const costs = can('costs.view');
  const [tab, setTab] = useState<Tab>('sales');
  const r = useRange('month');
  // «كل الفترات» = آخر ٣ سنوات (ثابتة حتى لا تتغير مع كل رسم)
  const range = useMemo(() => r.range ?? { from: new Date(Date.now() - 3 * 365 * 86_400_000).toISOString(), to: new Date(Date.now() + 86_400_000).toISOString() }, [r.range]);
  const days = (Date.parse(range.to) - Date.parse(range.from)) / 86_400_000;
  const bucket: Bucket = days > 120 ? 'month' : days > 45 ? 'week' : 'day';
  const mm = (n: number) => m(n, 'IQD', true);

  const view = useLoad<View>(async () => {
    if (tab === 'sales' || tab === 'profit') {
      const [sum, pts] = await Promise.all([dashboardSummary(range), salesSeries(range, bucket)]);
      const labels = pts.map((p) => fmt.date(p.bucket).split(' ').slice(0, bucket === 'month' ? 3 : 2).join(' '));
      if (tab === 'sales') return {
        kpis: [{ label: 'المبيعات', value: m(sum.sales_total) }, { label: 'المرتجعات', value: m(sum.returns_total) }, { label: 'الصافي', value: m(sum.sales_total - sum.returns_total) }, { label: 'عدد الفواتير', value: fmt.num(sum.sales_count) }],
        chart: { labels, values: pts.map((p) => p.sales - p.returns), name: 'صافي المبيعات' },
        table: { head: [{ label: 'الفترة' }, { label: 'الفواتير', end: true }, { label: 'المبيعات', end: true }, { label: 'المرتجعات', end: true }, { label: 'الصافي', end: true }], rows: pts.map((p, i) => [labels[i], fmt.num(p.invoices), mm(p.sales), mm(p.returns), mm(p.sales - p.returns)]) },
      };
      const gross = sum.profit ?? 0;
      return {
        kpis: [{ label: 'مجمل الربح', value: m(gross) }, { label: 'المصروفات', value: m(sum.expenses_total) }, { label: 'صافي الربح', value: m(gross - sum.expenses_total) }, { label: 'هامش الربح', value: sum.sales_total ? `${fmt.num(Math.round((gross / (sum.sales_total - sum.returns_total || 1)) * 1000) / 10)}٪` : '—' }],
        chart: { labels, values: pts.map((p) => p.profit ?? 0), name: 'مجمل الربح', line: true },
        table: { head: [{ label: 'الفترة' }, { label: 'الصافي', end: true }, { label: 'مجمل الربح', end: true }], rows: pts.map((p, i) => [labels[i], mm(p.sales - p.returns), mm(p.profit ?? 0)]) },
      };
    }
    if (tab === 'products') {
      const rows = await topProducts(range, 50);
      return {
        kpis: [{ label: 'منتجات بيعت', value: fmt.num(rows.length) }, { label: 'القطع', value: fmt.qty(rows.reduce((s, x) => s + x.qty, 0)) }, { label: 'الإيراد', value: m(rows.reduce((s, x) => s + x.revenue, 0)) }],
        table: { head: [{ label: 'المنتج' }, { label: 'الكمية', end: true }, { label: 'الإيراد', end: true }, ...(costs ? [{ label: 'الربح', end: true }] : [])], rows: rows.map((x) => [`${x.name}${x.variant_title ? ` — ${x.variant_title}` : ''}`, fmt.qty(x.qty), mm(x.revenue), ...(costs ? [mm(x.profit ?? 0)] : [])]) },
      };
    }
    if (tab === 'inventory') {
      const rows = await inventoryValuation();
      const cost = rows.reduce((s, x) => s + x.cost_value, 0); const retail = rows.reduce((s, x) => s + x.retail_value, 0);
      return {
        kpis: [{ label: 'القطع', value: fmt.qty(rows.reduce((s, x) => s + x.units, 0)) }, ...(costs ? [{ label: 'بسعر التكلفة', value: m(cost) }] : []), { label: 'بسعر البيع', value: m(retail) }, ...(costs ? [{ label: 'الربح المتوقع', value: m(retail - cost) }] : [])],
        table: { head: [{ label: 'المخزن' }, { label: 'الأصناف', end: true }, { label: 'القطع', end: true }, ...(costs ? [{ label: 'التكلفة', end: true }] : []), { label: 'قيمة البيع', end: true }], rows: rows.map((x) => [x.warehouse_name, fmt.num(x.items), fmt.qty(x.units), ...(costs ? [mm(x.cost_value)] : []), mm(x.retail_value)]) },
      };
    }
    if (tab === 'customers' || tab === 'staff') {
      const invs = await invoicesIn(range);
      const key = (i: (typeof invs)[number]) => (tab === 'customers' ? i.customer_id : i.created_by) ?? '—';
      const agg = new Map<string, { n: number; sales: number; returns: number; profit: number }>();
      for (const i of invs) {
        const a = agg.get(key(i)) ?? { n: 0, sales: 0, returns: 0, profit: 0 };
        const v = iqdOf(i);
        if (i.kind === 'sale') { a.n += 1; a.sales += v; a.profit += v - Number(i.cost_total); } else { a.returns += v; a.profit -= v - Number(i.cost_total); }
        agg.set(key(i), a);
      }
      const names = tab === 'customers' ? await customerNames([...agg.keys()]) : await staffNames();
      const rows = [...agg.entries()].map(([id, a]) => ({ name: names[id] ?? (tab === 'staff' ? 'التطبيق / النظام' : 'زبون نقدي'), ...a })).sort((x, y) => y.sales - y.returns - (x.sales - x.returns));
      return {
        kpis: [{ label: tab === 'customers' ? 'زبائن اشتروا' : 'موظفون باعوا', value: fmt.num(rows.length) }, { label: 'الفواتير', value: fmt.num(rows.reduce((s, x) => s + x.n, 0)) }, { label: 'الصافي', value: m(rows.reduce((s, x) => s + x.sales - x.returns, 0)) }],
        chart: { labels: rows.slice(0, 10).map((x) => x.name), values: rows.slice(0, 10).map((x) => x.sales - x.returns), name: 'الصافي' },
        table: { head: [{ label: tab === 'customers' ? 'الزبون' : 'الموظف' }, { label: 'الفواتير', end: true }, { label: 'المبيعات', end: true }, { label: 'المرتجعات', end: true }, { label: 'الصافي', end: true }, ...(costs ? [{ label: 'الربح', end: true }] : [])], rows: rows.map((x) => [x.name, fmt.num(x.n), mm(x.sales), mm(x.returns), mm(x.sales - x.returns), ...(costs ? [mm(x.profit)] : [])]) },
      };
    }
    const ex = await listExpenses(range);
    const agg = new Map<string, { n: number; v: number }>();
    for (const e of ex) { const a = agg.get(e.category) ?? { n: 0, v: 0 }; a.n += 1; a.v += e.amount * (e.currency === 'USD' ? e.exchange_rate : 1); agg.set(e.category, a); }
    const rows = [...agg.entries()].sort((a, b) => b[1].v - a[1].v);
    return {
      kpis: [{ label: 'المجموع', value: m(rows.reduce((s, [, a]) => s + a.v, 0)) }, { label: 'عدد المصروفات', value: fmt.num(ex.length) }],
      chart: { labels: rows.map(([c]) => c), values: rows.map(([, a]) => a.v), name: 'المصروفات' },
      table: { head: [{ label: 'النوع' }, { label: 'العدد', end: true }, { label: 'المبلغ', end: true }], rows: rows.map(([c, a]) => [c, fmt.num(a.n), mm(a.v)]) },
    };
  }, [tab, range.from, range.to, costs]);

  const tabs: { value: Tab; label: string }[] = useMemo(() => [
    { value: 'sales', label: 'المبيعات' }, ...(costs ? [{ value: 'profit' as Tab, label: 'الأرباح' }] : []), { value: 'products', label: 'المنتجات' },
    // inventory_valuation تشترط costs.view في الخادم — بدونها يفشل التبويب دائماً
    ...(costs ? [{ value: 'inventory' as Tab, label: 'تقييم المخزون' }] : []),
    { value: 'customers', label: 'الزبائن' }, { value: 'staff', label: 'الموظفون' }, { value: 'expenses', label: 'المصروفات' },
  ], [costs]);
  const title = tabs.find((t) => t.value === tab)?.label ?? '';
  const v = view.data;

  return (
    <>
      <PageHeader title="التقارير" description="أرقام عملك لأي فترة، جاهزة للطباعة والتصدير."
        actions={v ? <>
          <Button icon="download" onClick={() => downloadText(`report-${tab}.csv`, toCsv(v.table.rows, v.table.head.map((h, i) => ({ key: String(i), label: h.label, value: (row: string[]) => row[i] }))))}>CSV</Button>
          <Button variant="primary" icon="printer" onClick={() => void printDoc(buildReportA4({ title: `تقرير ${title}`, period: tab === 'inventory' ? `حتى ${fmt.date(Date.now())}` : r.label, kpis: v.kpis, tables: [v.table], store }))}>طباعة A4</Button>
        </> : null} />
      <Tabs value={tab} onChange={setTab} items={tabs} />
      {tab !== 'inventory' ? <div className="sx-filters"><RangePicker r={r} allowAll /></div> : null}
      {tab === 'profit' && !costs ? <Alert tone="warning">تحتاج صلاحية رؤية التكلفة والأرباح.</Alert> : null}
      {view.error ? <ErrorState message={view.error} onRetry={view.reload} /> : !v || view.loading ? <><Skeleton h={110} r={20} /><Skeleton h={260} r={20} /></> : (
        <>
          <div className="sx-stats">{v.kpis.map((k, i) => <Stat key={k.label} tone={i === 0 ? 'hero' : undefined} label={k.label} value={k.value} />)}</div>
          {v.chart && v.chart.values.length ? (
            <Card title={v.chart.name} icon="chartBar">
              {v.chart.line ? <LineChart height={240} labels={v.chart.labels} series={[{ name: v.chart.name, values: v.chart.values }]} format={mm} /> : <BarChart height={240} labels={v.chart.labels} series={[{ name: v.chart.name, values: v.chart.values }]} format={mm} />}
            </Card>
          ) : null}
          <Card flush>
            <div className="table-scroll">
              <table className="table">
                <thead><tr>{v.table.head.map((h) => <th key={h.label} className={h.end ? 'end' : ''}>{h.label}</th>)}</tr></thead>
                <tbody>{v.table.rows.length ? v.table.rows.map((row, i) => <tr key={i}>{row.map((c, j) => <td key={j} className={v.table.head[j]?.end ? 'end' : ''}>{c}</td>)}</tr>) : <tr><td colSpan={v.table.head.length} className="dim" style={{ textAlign: 'center', padding: 24 }}>لا بيانات في هذه الفترة</td></tr>}</tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </>
  );
}
