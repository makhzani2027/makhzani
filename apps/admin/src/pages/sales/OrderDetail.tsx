/** تفاصيل الطلب: البنود والعنوان والسجل، الحالة التالية، الإلغاء بسبب، ملاحظة داخلية، واتساب، قسيمة التوصيل */
import { Link, useParams } from 'react-router-dom';
import { FULFILLMENT, ORDER_PAYMENT_METHOD, ORDER_PAYMENT_STATUS, ORDER_STATUS, formatPhone, governorateName, nextStatuses, primaryNext, whatsappLink, type OrderItem, type OrderStatus } from '@raqeem/shared';
import { Alert, Badge, Button, Card, DataTable, ErrorState, Loading, Menu, PageHeader, Thumb, askConfirm, askText, type Column } from '../../ui';
import { useAuth } from '../../lib/auth';
import { useAction, useLoad } from '../../lib/hooks';
import { useFmt, useSettings } from '../../lib/settings';
import { useCounts } from '../../lib/counts';
import { getOrder, setOrderStatus } from './api';
import { useMoney } from './components/common';
import { printOrderSlip } from './printing';
import './sales.css';

export default function OrderDetail() {
  const { id = '' } = useParams();
  const fmt = useFmt();
  const m = useMoney();
  const { store } = useSettings();
  const { can } = useAuth();
  const counts = useCounts();
  const o = useLoad(() => getOrder(id), [id]);
  const move = useAction(async (to: OrderStatus | null, note: string | null) => {
    await setOrderStatus(id, to, note);
    await Promise.all([o.reload(), counts.refresh()]);
  }, { success: 'حُدّث الطلب' });

  if (o.error) return <ErrorState message={o.error} onRetry={o.reload} />;
  if (!o.data) return <Loading />;
  const { order, items, events, customer, invoice_number } = o.data;
  const next = primaryNext(order.status, order.fulfillment);
  const others = nextStatuses(order.status, order.fulfillment).filter((s) => s !== next);
  const manage = can('orders.manage');
  const phone = order.address?.phone ?? customer?.phone;
  const wa = whatsappLink(phone, `مرحباً ${order.address?.recipient_name ?? customer?.name ?? ''}، بخصوص طلبك ${order.number} من ${store.name}: ${ORDER_STATUS[order.status].label}.`);

  const go = async (to: OrderStatus) => {
    if (to === 'cancelled') {
      const reason = await askText({ title: `إلغاء الطلب ${order.number}`, label: 'سبب الإلغاء (يظهر للزبون)', required: true, placeholder: 'المنتج غير متوفر حالياً', confirm: 'إلغاء الطلب' });
      if (reason) void move.run('cancelled', reason);
      return;
    }
    if (to === 'returned' && !(await askConfirm({ title: 'تسجيل إرجاع الطلب؟', body: 'يُنشأ إرجاع للفاتورة ويعود المخزون.', danger: true, confirm: 'تسجيل الإرجاع' }))) return;
    void move.run(to, null);
  };

  const cols: Column<OrderItem>[] = [
    { key: 'n', header: 'المنتج', primary: true, cell: (it) => <div className="sx-row" style={{ flexWrap: 'nowrap' }}><Thumb imageKey={it.image_key} size="sm" /><div><b>{it.name}</b>{it.variant_title ? <span className="dim"> — {it.variant_title}</span> : null}<div className="small faint ltr" style={{ textAlign: 'start' }}>{it.sku}</div></div></div> },
    { key: 'q', header: 'الكمية', end: true, cell: (it) => fmt.qty(it.qty) },
    { key: 'p', header: 'السعر', end: true, cell: (it) => m(it.unit_price) },
    { key: 't', header: 'المجموع', end: true, cell: (it) => <b>{m(it.line_total)}</b> },
  ];

  return (
    <>
      <PageHeader title={<span>الطلب <span className="ltr">{order.number}</span></span>} crumbs={[{ label: 'الطلبات', to: '/orders' }, { label: order.number }]}
        description={<>{fmt.date(order.created_at, true)} · <Badge tone={ORDER_STATUS[order.status].tone}>{ORDER_STATUS[order.status].label}</Badge></>}
        actions={<>
          <Button icon="printer" onClick={() => void printOrderSlip(order.id, store)}>قسيمة التوصيل</Button>
          {wa ? <Button icon="whatsapp" onClick={() => window.open(wa, '_blank', 'noopener')}>واتساب</Button> : null}
          {manage ? <Button icon="note" onClick={async () => { const n = await askText({ title: 'ملاحظة داخلية', multiline: true, required: true, initial: order.staff_note ?? '' }); if (n) void move.run(null, n); }}>ملاحظة</Button> : null}
          {manage && others.length ? <Menu trigger={(open) => <Button icon="more" onClick={open}>حالة أخرى</Button>} items={others.map((s) => ({ label: ORDER_STATUS[s].staffAction ?? ORDER_STATUS[s].label, danger: s === 'cancelled' || s === 'returned', onClick: () => void go(s) }))} /> : null}
          {manage && next ? <Button variant="primary" icon="check" loading={move.busy} onClick={() => void go(next)}>{ORDER_STATUS[next].staffAction}</Button> : null}
        </>} />
      {order.status === 'cancelled' && order.cancel_reason ? <Alert tone="danger">سبب الإلغاء: {order.cancel_reason}</Alert> : null}
      {order.customer_note ? <Alert tone="info" icon="chat">ملاحظة الزبون: {order.customer_note}</Alert> : null}
      <div className="sx-split">
        <div className="sx-stack">
          <DataTable rows={items} columns={cols} rowKey={(x) => x.id} />
          <Card title="سجل الطلب" icon="history">
            <div className="timeline">
              {events.map((e, i) => (
                <div key={e.id} className={`step ${i === events.length - 1 ? 'current' : 'done'}`}>
                  <span className="dot" />
                  <div>
                    <b>{e.status ? ORDER_STATUS[e.status].label : 'ملاحظة'}</b>{e.note ? <span className="dim"> — {e.note}</span> : null}
                    <div className="sx-muted">{fmt.date(e.created_at, true)}{e.actor_name ? ` · ${e.actor_name}` : ''}{!e.is_customer_visible ? ' · داخلية' : ''}</div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
        <div className="sx-stack">
          <Card title="الزبون" icon="user">
            <div className="stack-sm">
              {customer ? <Link to={`/customers/${customer.id}`}><b>{customer.name}</b></Link> : null}
              {phone ? <a className="ltr dim" style={{ textAlign: 'start' }} href={`tel:${phone}`}>{formatPhone(phone)}</a> : null}
            </div>
          </Card>
          <Card title={FULFILLMENT[order.fulfillment].label} icon="truck">
            {order.address ? (
              <dl className="kv">
                <dt>المستلم</dt><dd>{order.address.recipient_name}</dd>
                <dt>المحافظة</dt><dd>{governorateName(order.address.governorate)}{order.address.city ? ` — ${order.address.city}` : ''}</dd>
                {order.address.area ? <><dt>المنطقة</dt><dd>{order.address.area}</dd></> : null}
                {order.address.street ? <><dt>الشارع</dt><dd>{order.address.street}</dd></> : null}
                {order.address.landmark ? <><dt>أقرب نقطة</dt><dd>{order.address.landmark}</dd></> : null}
              </dl>
            ) : <p className="sx-muted">يستلمه الزبون من المحل.</p>}
          </Card>
          <Card title="الحساب" icon="receipt">
            <div className="totals">
              <div><span>المجموع</span><span>{m(order.subtotal)}</span></div>
              {order.discount ? <div><span>الخصم{order.coupon_code ? <span className="ltr"> ({order.coupon_code})</span> : null}</span><span>− {m(order.discount)}</span></div> : null}
              <div><span>التوصيل</span><span>{order.delivery_fee ? m(order.delivery_fee) : 'مجاني'}</span></div>
              <div className="grand"><span>الإجمالي</span><span>{m(order.total)}</span></div>
              <div><span>الدفع</span><span>{ORDER_PAYMENT_METHOD[order.payment_method].label} · <Badge plain tone={ORDER_PAYMENT_STATUS[order.payment_status].tone}>{ORDER_PAYMENT_STATUS[order.payment_status].label}</Badge></span></div>
              {order.invoice_id ? <div><span>الفاتورة</span><Link to={`/invoices/${order.invoice_id}`} className="ltr">{invoice_number ?? 'عرض'}</Link></div> : null}
            </div>
          </Card>
          {order.staff_note ? <Card title="ملاحظة داخلية" icon="note"><p className="sx-pre">{order.staff_note}</p></Card> : null}
        </div>
      </div>
    </>
  );
}
