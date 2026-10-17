/** تفاصيل الفاتورة: البنود والدفعات والمرتجعات، طباعة حرارية/A4، إرجاع، إلغاء، تسجيل دفعة، واتساب */
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { INVOICE_CHANNEL, INVOICE_KIND, PAYMENT_METHOD, PRICE_TIER, formatPhone, roundMoney, whatsappLink, type PaymentMethod } from '@raqeem/shared';
import { Alert, Badge, Button, Card, DataTable, ErrorState, Field, Input, Loading, Modal, MoneyInput, NumberInput, PageHeader, Select, askConfirm, askText, type Column } from '../../ui';
import { useAuth } from '../../lib/auth';
import { useAction, useLoad } from '../../lib/hooks';
import { useFmt, useSettings } from '../../lib/settings';
import { getInvoice, postReturn, voidInvoice } from './api';
import type { InvoiceFull } from './data/types';
import type { InvoiceItem } from '@raqeem/shared';
import { AccountSelect, METHODS_ALL, VoucherModal, useAccounts, useMoney } from './components/common';
import { printInvoice } from './printing';
import { defaultAccountFor } from '../finance/api';
import './sales.css';

export default function InvoiceDetail() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const [sp, setSp] = useSearchParams();
  const fmt = useFmt();
  const m = useMoney();
  const { store } = useSettings();
  const { can } = useAuth();
  const inv = useLoad(() => getInvoice(id), [id]);
  const [ret, setRet] = useState(false);
  const [pay, setPay] = useState(false);
  useEffect(() => { if (sp.get('return') && inv.data) { setRet(true); setSp({}, { replace: true }); } }, [sp, inv.data, setSp]);

  const doVoid = useAction(async () => {
    const ok = await askConfirm({ title: `إلغاء الفاتورة ${inv.data?.invoice.number}؟`, body: 'يُعاد المخزون وتُلغى دفعاتها. لا يمكن التراجع.', danger: true, confirm: 'إلغاء الفاتورة', typeToConfirm: 'إلغاء' });
    if (!ok) return false;
    const reason = await askText({ title: 'سبب الإلغاء', required: true, placeholder: 'خطأ في الإدخال' });
    if (!reason) return false;
    await voidInvoice(id, reason);
    await inv.reload();
    return true;
  }, { success: 'أُلغيت الفاتورة' });

  if (inv.error) return <ErrorState message={inv.error} onRetry={inv.reload} />;
  if (!inv.data) return <Loading />;
  const { invoice: i, items, payments, customer, supplier, returns, original, cashier } = inv.data;
  const cur = i.currency;
  const isSale = i.kind === 'sale';
  const posted = i.status === 'posted';
  const party = customer ?? supplier;
  const canReturn = isSale && posted && can('invoices.void') && items.some((it) => it.qty - (inv.data!.returned[it.id] ?? 0) > 0);
  const wa = whatsappLink(party?.phone, `مرحباً ${party?.name ?? ''}،\nفاتورتكم ${i.number} من ${store.name}\nالإجمالي: ${m(i.total, cur)}\nالمدفوع: ${m(i.paid, cur)}${i.due > 0 ? `\nالمتبقي: ${m(i.due, cur)}` : ''}\nشكراً لتعاملكم معنا.`);

  const cols: Column<InvoiceItem>[] = [
    { key: 'n', header: 'المنتج', primary: true, cell: (it) => <div><b>{it.name}</b>{it.variant_title ? <span className="dim"> — {it.variant_title}</span> : null}<div className="small faint ltr" style={{ textAlign: 'start' }}>{it.sku}{it.serials.length ? ` · ${it.serials.join('، ')}` : ''}</div></div> },
    { key: 'q', header: 'الكمية', end: true, cell: (it) => <span>{fmt.qty(it.qty)}{it.unit_name ? <span className="faint"> ({it.unit_name})</span> : null}{inv.data!.returned[it.id] ? <div className="small sx-neg">أُرجع {fmt.qty(inv.data!.returned[it.id])}</div> : null}</span> },
    { key: 'p', header: 'السعر', end: true, cell: (it) => <span>{m(it.unit_price, cur)}{it.price_tier === 'wholesale' ? <div className="small faint">{PRICE_TIER.wholesale.label}</div> : null}</span> },
    { key: 'd', header: 'الخصم', end: true, hideOnMobile: true, cell: (it) => (it.discount ? m(it.discount, cur) : '—') },
    { key: 't', header: 'المجموع', end: true, cell: (it) => <b>{m(it.line_total, cur)}</b> },
  ];

  return (
    <>
      <PageHeader title={<span>{INVOICE_KIND[i.kind].label} <span className="ltr">{i.number}</span></span>} crumbs={[{ label: i.kind === 'sale_return' ? 'المرتجعات' : 'الفواتير', to: i.kind === 'sale_return' ? '/returns' : '/invoices' }, { label: i.number }]}
        description={`${fmt.date(i.created_at, true)} · ${INVOICE_CHANNEL[i.channel].label}${cashier ? ` · ${cashier}` : ''}`}
        actions={<>
          <Button icon="printer" onClick={() => void printInvoice(i.id, store, 'thermal')}>إيصال</Button>
          <Button icon="fileText" onClick={() => void printInvoice(i.id, store, 'A4')}>A4</Button>
          {wa ? <Button icon="whatsapp" onClick={() => window.open(wa, '_blank', 'noopener')}>واتساب</Button> : null}
          {canReturn ? <Button icon="return" onClick={() => setRet(true)}>إرجاع</Button> : null}
          {posted && i.due > 0.004 && can('finance.manage') ? <Button variant="primary" icon="wallet" onClick={() => setPay(true)}>تسجيل دفعة</Button> : null}
          {posted && can('invoices.void') ? <Button variant="danger" icon="xCircle" loading={doVoid.busy} onClick={() => void doVoid.run()}>إلغاء</Button> : null}
        </>} />
      {i.status === 'void' ? <Alert tone="danger">ملغاة {i.voided_at ? fmt.date(i.voided_at, true) : ''} — السبب: {i.void_reason ?? '—'}</Alert> : null}
      {original ? <Alert tone="info">إرجاع من الفاتورة <Link to={`/invoices/${original.id}`} className="ltr">{original.number}</Link>{i.note ? ` — ${i.note}` : ''}</Alert> : null}
      <div className="sx-split">
        <div className="sx-stack">
          <DataTable rows={items} columns={cols} rowKey={(x) => x.id} />
          {payments.length ? (
            <Card title="الدفعات" icon="wallet" flush>
              <div className="list" style={{ padding: '0 16px' }}>
                {payments.map((p) => (
                  <div key={p.id} className="list-item">
                    <span className="grow"><b className="ltr">{p.number}</b> · {PAYMENT_METHOD[p.method].label}{p.reference ? <span className="faint ltr"> {p.reference}</span> : null}<div className="meta">{fmt.date(p.created_at, true)}{p.voided_at ? ' · ملغاة' : ''}</div></span>
                    <Badge tone={p.direction === 'in' ? 'success' : 'warning'}>{p.direction === 'in' ? 'قبض' : 'صرف'}</Badge>
                    <b className={p.voided_at ? 'strike' : ''}>{m(p.amount, p.currency)}</b>
                  </div>
                ))}
              </div>
            </Card>
          ) : null}
          {returns.length ? (
            <Card title="المرتجعات" icon="return">
              {returns.map((r) => <div key={r.id} className="list-item"><Link to={`/invoices/${r.id}`} className="ltr grow">{r.number}</Link><span className="dim">{fmt.date(r.created_at)}</span><b>{m(r.total, r.currency)}</b></div>)}
            </Card>
          ) : null}
        </div>
        <div className="sx-stack">
          <Card title={supplier ? 'المورد' : 'الزبون'} icon="user">
            {party ? (
              <div className="stack-sm">
                {customer && !customer.is_cash_customer ? <Link to={`/customers/${customer.id}`}><b>{party.name}</b></Link> : <b>{party.name}</b>}
                {party.phone ? <span className="ltr dim" style={{ textAlign: 'start' }}>{formatPhone(party.phone)}</span> : null}
              </div>
            ) : <span className="dim">زبون نقدي</span>}
          </Card>
          <Card title="الحساب" icon="receipt">
            <div className="totals">
              <div><span>المجموع</span><span>{m(i.subtotal, cur)}</span></div>
              {i.discount ? <div><span>الخصم</span><span>− {m(i.discount, cur)}</span></div> : null}
              {i.delivery_fee ? <div><span>التوصيل</span><span>{m(i.delivery_fee, cur)}</span></div> : null}
              <div className="grand"><span>الإجمالي</span><span>{m(i.total, cur)}</span></div>
              {cur === 'USD' ? <div className="dim"><span>بسعر صرف</span><span>{m(i.exchange_rate, 'IQD', true)}</span></div> : null}
              <div><span>المدفوع</span><span>{m(i.paid, cur)}</span></div>
              <div><span>المتبقي</span><span className={i.due > 0.004 ? 'sx-neg' : ''}>{m(i.due, cur)}</span></div>
              {can('costs.view') && isSale ? <div className="dim"><span>الربح التقريبي</span><span>{m(i.total * (cur === 'USD' ? i.exchange_rate : 1) - i.cost_total)}</span></div> : null}
            </div>
          </Card>
          {i.note && !original ? <Card title="ملاحظة" icon="note"><p className="sx-pre">{i.note}</p></Card> : null}
        </div>
      </div>
      {ret ? <ReturnModal full={inv.data} onClose={() => setRet(false)} onDone={(rid) => { setRet(false); nav(`/invoices/${rid}`); }} /> : null}
      <VoucherModal open={pay} onClose={() => setPay(false)} preset={{ direction: 'in', customer: customer && !customer.is_cash_customer ? customer : null, invoice: { id: i.id, number: i.number, due: i.due, currency: cur } }} onDone={() => void inv.reload()} />
    </>
  );
}

function ReturnModal({ full, onClose, onDone }: { full: InvoiceFull; onClose: () => void; onDone: (id: string) => void }) {
  const fmt = useFmt();
  const m = useMoney();
  const { store } = useSettings();
  const { accounts } = useAccounts();
  const i = full.invoice;
  const cur = i.currency;
  const [qty, setQty] = useState<Record<string, number>>({});
  const [reason, setReason] = useState('');
  const [method, setMethod] = useState<PaymentMethod>('cash');
  const [account, setAccount] = useState<string | null>(null);
  const [refund, setRefund] = useState<number | null>(null);
  const share = i.subtotal > 0 ? 1 - i.discount / i.subtotal : 1;
  const value = useMemo(() => roundMoney(full.items.reduce((s, it) => s + (qty[it.id] ?? 0) * (it.line_total / it.qty) * share, 0), cur), [qty, full.items, share, cur]);
  const maxRefund = Math.min(value, i.paid);
  useEffect(() => setRefund(maxRefund), [maxRefund]);
  const save = useAction(async () => {
    const res = await postReturn({
      invoice_id: i.id, reason: reason.trim() || 'إرجاع',
      items: full.items.filter((it) => (qty[it.id] ?? 0) > 0).map((it) => ({ invoice_item_id: it.id, qty: qty[it.id] })),
      refund: refund && refund > 0 ? { method, amount: refund, currency: cur, account_id: account ?? defaultAccountFor(accounts, method, cur)?.id ?? null } : null,
    });
    void printInvoice(res.invoice_id, store, 'thermal').catch(() => undefined);
    return res;
  }, { success: 'سُجّل الإرجاع' });
  return (
    <Modal open onClose={onClose} title={`إرجاع من ${i.number}`} subtitle="اختر الكميات المُرجعة. يعود المخزون تلقائياً." width={640}
      footer={<><Button onClick={onClose}>إلغاء</Button><Button variant="primary" icon="return" loading={save.busy} disabled={!value} onClick={async () => { const r = await save.run(); if (r) onDone(r.invoice_id); }}>تسجيل الإرجاع</Button></>}>
      <div className="stack">
        {full.items.map((it) => {
          const left = it.qty - (full.returned[it.id] ?? 0);
          return (
            <div key={it.id} className="sx-between" style={{ borderBottom: '1px dashed var(--line-strong)', paddingBottom: 8 }}>
              <span style={{ minWidth: 0 }}><b>{it.name}</b>{it.variant_title ? <span className="dim"> — {it.variant_title}</span> : null}<div className="sx-muted">بيع {fmt.qty(it.qty)} · متاح للإرجاع {fmt.qty(left)} · {m(it.line_total / it.qty, cur)}</div></span>
              <span style={{ width: 120 }}><NumberInput value={qty[it.id] ?? null} onChange={(v) => setQty({ ...qty, [it.id]: Math.min(left, v ?? 0) })} max={left} min={0} disabled={left <= 0} ariaLabel={`كمية إرجاع ${it.name}`} /></span>
            </div>
          );
        })}
        <Field label="السبب"><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="عيب مصنعي، تبديل…" /></Field>
        <div className="form-grid">
          <Field label="المبلغ المسترد" hint={`قيمة الإرجاع ${m(value, cur)} · المدفوع على الفاتورة ${m(i.paid, cur)}`}><MoneyInput value={refund} onChange={(v) => setRefund(Math.min(v ?? 0, value))} currency={cur} /></Field>
          <Field label="طريقة الرد"><Select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)} options={METHODS_ALL.map((x) => ({ value: x, label: PAYMENT_METHOD[x].label }))} /></Field>
          <AccountSelect accounts={accounts} currency={cur} value={account} onChange={setAccount} />
        </div>
        {value > (refund ?? 0) ? <Alert tone="info">الفرق {m(value - (refund ?? 0), cur)} يُخصم من دين الزبون أو يبقى رصيداً له.</Alert> : null}
      </div>
    </Modal>
  );
}
