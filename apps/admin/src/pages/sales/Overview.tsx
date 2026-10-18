/** الرئيسية: ابدأ العملية مباشرة، ثم المؤشرات بفروقها، المبيعات، الأكثر مبيعاً، أحدث الطلبات، والتنبيهات */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatPercent, ORDER_STATUS, type IconName } from '@raqeem/shared';
import { Badge, BarChart, Button, Card, EmptyState, ErrorState, Icon, PageHeader, Segmented, Skeleton, Stat } from '../../ui';
import { useAuth } from '../../lib/auth';
import { useLoad } from '../../lib/hooks';
import { useFmt } from '../../lib/settings';
import { dashboardSummary, listOrders, lowStock, openSessions, salesSeries, topProducts, type Bucket } from './api';
import { useSetting } from './data/app-settings';
import { previousRange, rangeOf, useMoney, VoucherModal, type RangeKey } from './components/common';
import './sales.css';

export default function Overview() {
  const nav = useNavigate();
  const fmt = useFmt();
  const m = useMoney();
  const { can, profile } = useAuth();
  const pos = useSetting('pos');
  const [rk, setRk] = useState<RangeKey>('7d');
  const range = rangeOf(rk)!;
  const bucket: Bucket = rk === 'year' ? 'month' : 'day';
  const sum = useLoad(() => Promise.all([dashboardSummary(range), dashboardSummary(previousRange(range))]), [rk]);
  const series = useLoad(() => salesSeries(range, bucket), [rk]);
  const top = useLoad(() => topProducts(range, 6), [rk]);
  const orders = useLoad(() => (can('orders.view') ? listOrders({ status: 'all', q: '', range: null, page: 1, pageSize: 6 }) : Promise.resolve({ rows: [], total: 0 })), []);
  const low = useLoad(() => lowStock(6), []);
  const sessions = useLoad(openSessions, []);
  const [receipt, setReceipt] = useState(false);

  const [cur, prev] = sum.data ?? [];
  const delta = (a?: number | null, b?: number | null, invert = false) => {
    if (a == null || b == null || !b) return null;
    const r = (a - b) / Math.abs(b);
    return { value: formatPercent(Math.abs(r), fmt.digits), up: invert ? r < 0 : r >= 0 };
  };
  const late = (orders.data?.rows ?? []).filter((o) => o.status === 'pending' && Date.now() - Date.parse(o.created_at) > pos.late_order_minutes * 60_000);

  const quick: { icon: IconName; label: string; hint: string; run: () => void; perm: boolean; hero?: boolean }[] = [
    { icon: 'pos', label: 'بيع', hint: 'نقطة البيع', run: () => nav('/pos'), perm: can('pos.sell'), hero: true },
    { icon: 'stockIn', label: 'شراء', hint: 'فاتورة شراء جديدة', run: () => nav('/purchases/new'), perm: can('purchases.manage') },
    { icon: 'fileText', label: 'عرض سعر', hint: 'للزبون قبل البيع', run: () => nav('/quotations/new'), perm: can('quotations.manage') },
    { icon: 'wallet', label: 'سند قبض', hint: 'دفعة من زبون', run: () => setReceipt(true), perm: can('finance.manage') },
    { icon: 'stockOut', label: 'سند إخراج', hint: 'إخراج من المخزن', run: () => nav('/vouchers/out'), perm: can('inventory.adjust') },
  ];

  return (
    <>
      <PageHeader title={`أهلاً ${profile?.full_name?.split(' ')[0] ?? ''}`} description={`ملخص ${fmt.date(Date.now())}`}
        actions={<Segmented value={rk} onChange={setRk} options={[{ value: 'today', label: 'اليوم' }, { value: '7d', label: '٧ أيام' }, { value: '30d', label: '٣٠ يوماً' }, { value: 'year', label: 'السنة' }]} />} />

      <section aria-label="ابدأ العملية مباشرة">
        <h2 className="section-title" style={{ margin: '0 0 10px' }}>ابدأ العملية مباشرة</h2>
        <div className="sx-quick">
          {quick.filter((q) => q.perm).map((q) => (
            <button key={q.label} type="button" className={q.hero ? 'hero' : ''} onClick={q.run}>
              <span className="ic"><Icon name={q.icon} size={22} /></span>
              <span><b>{q.label}</b><br /><small>{q.hint}</small></span>
            </button>
          ))}
        </div>
      </section>

      {sum.error ? <ErrorState message={sum.error} onRetry={sum.reload} /> : (
        <div className="sx-stats kpis" style={{ marginBottom: 0 }}>
          {!cur ? Array.from({ length: 6 }, (_, i) => <Skeleton key={i} h={112} r={20} />) : (
            <>
              <Stat tone="hero" label="المبيعات" icon="chartLine" value={m(cur.sales_total - cur.returns_total)} delta={delta(cur.sales_total - cur.returns_total, prev ? prev.sales_total - prev.returns_total : null)} foot={`${fmt.num(cur.sales_count)} فاتورة`} />
              {can('purchases.manage') ? <Stat label="المشتريات" icon="stockIn" value={m(cur.purchases_total)} delta={delta(cur.purchases_total, prev?.purchases_total, true)} /> : null}
              {can('finance.view') ? <Stat label="رصيد الصناديق" icon="wallet" value={m(cur.cash_balance)} foot={`داخل ${m(cur.cash_in)}`} /> : null}
              {can('finance.view') ? <Stat label="لنا عند الزبائن" icon="debt" value={m(cur.receivables)} foot={<button type="button" className="sx-link" onClick={() => nav('/debts')}>الديون</button>} /> : null}
              {can('finance.view') ? <Stat label="علينا للموردين" icon="supplier" value={m(cur.payables)} /> : null}
              {cur.profit !== null && can('costs.view') ? <Stat tone="accent" label="صافي الربح" icon="trendUp" value={m(cur.profit - cur.expenses_total)} delta={delta(cur.profit - cur.expenses_total, prev && prev.profit !== null ? prev.profit - prev.expenses_total : null)} foot={`المصروفات ${m(cur.expenses_total)}`} /> : null}
            </>
          )}
        </div>
      )}

      <div className="sx-split">
        <div className="sx-stack">
          <Card title="المبيعات" icon="chartBar" actions={<Button size="sm" variant="ghost" onClick={() => nav('/reports')}>التقارير</Button>}>
            {series.loading && !series.data ? <Skeleton h={220} /> : series.error ? <ErrorState message={series.error} onRetry={series.reload} /> : (
              <BarChart height={230} labels={(series.data ?? []).map((p) => (bucket === 'month' ? fmt.date(p.bucket).split(' ').slice(1).join(' ') : fmt.date(p.bucket).split(' ').slice(0, 2).join(' ')))}
                series={[{ name: 'المبيعات', values: (series.data ?? []).map((p) => p.sales - p.returns) }, ...(can('costs.view') ? [{ name: 'الربح', values: (series.data ?? []).map((p) => p.profit ?? 0) }] : [])]}
                format={(v) => m(v, 'IQD', true)} />
            )}
          </Card>
          {can('orders.view') ? (
            <Card title="أحدث الطلبات" icon="bag" actions={<Button size="sm" variant="ghost" onClick={() => nav('/orders')}>كل الطلبات</Button>} flush>
              {orders.loading && !orders.data ? <div style={{ padding: 16 }}><Skeleton h={160} /></div> : !(orders.data?.rows.length) ? <EmptyState icon="bag" title="لا طلبات بعد" text="طلبات تطبيق المتجر تظهر هنا فور وصولها." /> : (
                <div className="list" style={{ padding: '0 16px' }}>
                  {orders.data.rows.map((o) => (
                    <button key={o.id} type="button" className="list-item sx-alert-row" style={{ background: 'transparent', borderRadius: 0 }} onClick={() => nav(`/orders/${o.id}`)}>
                      <span className="grow" style={{ minWidth: 0 }}><b className="ltr">{o.number}</b> · {o.customer_name}<div className="meta">{fmt.ago(o.created_at)} · {fmt.num(o.items_count)} منتج</div></span>
                      <span className="sx-order-end">
                        <Badge tone={ORDER_STATUS[o.status].tone}>{ORDER_STATUS[o.status].label}</Badge>
                        <b className="sx-mono">{m(o.total)}</b>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </Card>
          ) : null}
        </div>
        <div className="sx-stack">
          <Card title="تنبيهات" icon="bell">
            <div className="sx-alerts">
              {late.length ? <Alertish icon="clock" tone="danger" text={`${fmt.num(late.length)} طلب ينتظر التأكيد منذ أكثر من ${fmt.num(pos.late_order_minutes)} دقيقة`} go={() => nav('/orders?status=pending')} /> : null}
              {cur && cur.orders_new ? <Alertish icon="bag" tone="accent" text={`${fmt.num(cur.orders_new)} طلب جديد`} go={() => nav('/orders?status=pending')} /> : null}
              {cur && cur.requests_new ? <Alertish icon="request" tone="info" text={`${fmt.num(cur.requests_new)} طلب توفير جديد`} go={() => nav('/requests')} /> : null}
              {cur && cur.out_of_stock_count ? <Alertish icon="alert" tone="danger" text={`${fmt.num(cur.out_of_stock_count)} منتج نفد من المخزون`} go={() => nav('/inventory')} /> : null}
              {cur && cur.low_stock_count ? <Alertish icon="layers" tone="warning" text={`${fmt.num(cur.low_stock_count)} منتج قارب على النفاد`} go={() => nav('/inventory')} /> : null}
              {(sessions.data ?? []).map((s) => <Alertish key={s.id} icon="cash" tone="neutral" text={`جلسة صندوق مفتوحة — ${s.opened_by_name ?? 'موظف'} منذ ${fmt.ago(s.opened_at)}`} go={() => nav('/cash')} />)}
              {cur && !late.length && !cur.orders_new && !cur.requests_new && !cur.low_stock_count && !cur.out_of_stock_count && !(sessions.data ?? []).length ? <p className="sx-muted">كل شيء على ما يرام.</p> : null}
            </div>
          </Card>
          <Card title="الأكثر مبيعاً" icon="trendUp">
            {top.loading && !top.data ? <Skeleton h={180} /> : !(top.data ?? []).length ? <p className="sx-muted">لا مبيعات في هذه الفترة.</p> : (
              <div className="list">
                {(top.data ?? []).map((t, i) => (
                  <div key={t.variant_id} className="list-item">
                    <b className="sx-mono" style={{ width: 20, color: 'var(--ink3)' }}>{fmt.num(i + 1)}</b>
                    <span className="grow" style={{ minWidth: 0 }}><b className="truncate" style={{ display: 'block' }}>{t.name}</b><span className="meta">{t.variant_title ? `${t.variant_title} · ` : ''}{fmt.qty(t.qty)} قطعة</span></span>
                    <b className="sx-mono">{m(t.revenue)}</b>
                  </div>
                ))}
              </div>
            )}
          </Card>
          {(low.data ?? []).length ? (
            <Card title="قارب على النفاد" icon="layers" actions={<Button size="sm" variant="ghost" onClick={() => nav('/inventory')}>المخزون</Button>}>
              <div className="list">
                {(low.data ?? []).map((l) => (
                  <div key={l.variant_id} className="list-item"><span className="grow truncate">{l.name}{l.variant_title ? ` — ${l.variant_title}` : ''}</span><Badge tone={l.qty <= 0 ? 'danger' : 'warning'}>{fmt.qty(l.qty)} / {fmt.qty(l.min_stock)}</Badge></div>
                ))}
              </div>
            </Card>
          ) : null}
        </div>
      </div>
      <VoucherModal open={receipt} onClose={() => setReceipt(false)} preset={{ direction: 'in' }} onDone={() => void sum.reload()} />
    </>
  );
}

function Alertish({ icon, text, go, tone }: { icon: IconName; text: string; go: () => void; tone: 'danger' | 'warning' | 'info' | 'accent' | 'neutral' }) {
  return (
    <button type="button" className="sx-alert-row" onClick={go}>
      <span style={{ color: `var(--${tone === 'accent' ? 'accent' : tone === 'neutral' ? 'ink2' : tone})` }}><Icon name={icon} size={18} /></span>
      <span className="grow">{text}</span>
      <Icon name="chevronLeft" size={16} />
    </button>
  );
}
