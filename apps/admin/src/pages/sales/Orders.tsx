/** طلبات التطبيق: تبويبات بالحالة مع عدّاداتها، بحث، وانتقال سريع للحالة التالية */
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ORDER_PAYMENT_METHOD, ORDER_PAYMENT_STATUS, ORDER_STATUS, FULFILLMENT, formatPhone, governorateName, primaryNext, type OrderStatus } from '@raqeem/shared';
import { Badge, Button, DataTable, PageHeader, Pagination, SearchInput, Tabs, type Column } from '../../ui';
import { useAuth } from '../../lib/auth';
import { useAction, useDebounced, useLoad } from '../../lib/hooks';
import { useFmt } from '../../lib/settings';
import { useCounts } from '../../lib/counts';
import { ORDER_TABS, listOrders, orderCounts, setOrderStatus } from './api';
import type { OrderRow } from './data/types';
import { RangePicker, useMoney, useRange } from './components/common';
import './sales.css';

export default function Orders() {
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const fmt = useFmt();
  const m = useMoney();
  const { can } = useAuth();
  const counts = useCounts();
  const status = (sp.get('status') as OrderStatus | 'all' | null) ?? 'all';
  const r = useRange('all');
  const [q, setQ] = useState('');
  const dq = useDebounced(q, 250);
  const [page, setPage] = useState(1);
  const pageSize = 25;
  // تغيير الفترة يعيد للصفحة الأولى
  useEffect(() => setPage(1), [r.range]);
  const list = useLoad(() => listOrders({ status, q: dq, range: r.range, page, pageSize }), [status, dq, r.range, page]);
  const cnt = useLoad(orderCounts, []);
  const advance = useAction(async (o: OrderRow, to: OrderStatus) => {
    await setOrderStatus(o.id, to, null);
    await Promise.all([list.reload(), cnt.reload(), counts.refresh()]);
  }, { success: 'حُدّثت حالة الطلب' });

  const columns: Column<OrderRow>[] = [
    { key: 'n', header: 'الطلب', primary: true, cell: (o) => <div><b className="ltr">{o.number}</b><div className="small faint">{fmt.ago(o.created_at)}</div></div> },
    { key: 'c', header: 'الزبون', cell: (o) => <div>{o.customer_name}<div className="small faint ltr" style={{ textAlign: 'start' }}>{o.customer_phone ? formatPhone(o.customer_phone) : ''}</div></div> },
    { key: 'g', header: 'التوصيل', hideOnMobile: true, cell: (o) => <span className="dim">{o.fulfillment === 'pickup' ? FULFILLMENT.pickup.label : governorateName(o.address?.governorate)}</span> },
    { key: 's', header: 'الحالة', cell: (o) => <Badge tone={ORDER_STATUS[o.status].tone}>{ORDER_STATUS[o.status].label}</Badge> },
    { key: 'p', header: 'الدفع', hideOnMobile: true, cell: (o) => <span className="small">{ORDER_PAYMENT_METHOD[o.payment_method].label} · <Badge plain tone={ORDER_PAYMENT_STATUS[o.payment_status].tone}>{ORDER_PAYMENT_STATUS[o.payment_status].label}</Badge></span> },
    { key: 't', header: 'الإجمالي', end: true, cell: (o) => <b>{m(o.total)}</b> },
    ...(can('orders.manage') ? [{ key: 'a', header: '', shrink: true, cell: (o: OrderRow) => {
      const next = primaryNext(o.status, o.fulfillment);
      return next ? <Button size="sm" variant={o.status === 'pending' ? 'primary' : 'default'} loading={advance.busy} onClick={(e) => { e.stopPropagation(); void advance.run(o, next); }}>{ORDER_STATUS[next].staffAction}</Button> : null;
    } }] : []),
  ];

  return (
    <>
      <PageHeader title="الطلبات" description="طلبات تطبيق المتجر من الاستلام حتى التسليم." />
      <Tabs value={status} onChange={(v) => { setSp(v === 'all' ? {} : { status: v }); setPage(1); }}
        items={[{ value: 'all' as const, label: 'الكل', count: cnt.data?.all }, ...ORDER_TABS.map((s) => ({ value: s, label: s === 'pending' ? 'جديدة' : ORDER_STATUS[s].label, count: cnt.data?.[s] ?? null }))]} />
      <DataTable rows={list.data?.rows} columns={columns} rowKey={(o) => o.id} loading={list.loading} error={list.error} onRetry={list.reload} onRowClick={(o) => nav(`/orders/${o.id}`)}
        toolbar={<div className="sx-filters"><div className="grow"><SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="رقم الطلب أو اسم الزبون أو هاتفه…" /></div><RangePicker r={r} allowAll /></div>}
        footer={<Pagination page={page} pageSize={pageSize} total={list.data?.total ?? 0} onPage={setPage} />}
        empty={q ? { icon: 'search', title: 'لا نتائج' } : { icon: 'bag', title: status === 'pending' ? 'لا طلبات جديدة' : 'لا طلبات هنا', text: 'تصل الطلبات من تطبيق المتجر وتظهر هنا فوراً.' }} />
    </>
  );
}
