/** إنشاء/تعديل عرض سعر: زبون مسجّل أو اسم حر، بنود بأسعار قابلة للتعديل، مفرد/جملة، عملة، صلاحية؛ ثم طباعة وواتساب وتحويل لفاتورة */
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { QUOTATION_STATUS, isoDay, roundMoney, startOfBaghdadDay, whatsappLink, type CurrencyCode, type PriceTier, type QuotationStatus } from '@raqeem/shared';
import { Alert, Avatar, Badge, Button, Card, EmptyState, ErrorState, Field, IconButton, Input, Loading, MoneyInput, NumberInput, PageHeader, Segmented, Select, Textarea, askConfirm } from '../../ui';
import { useAction, useLoad } from '../../lib/hooks';
import { useFmt, useSettings } from '../../lib/settings';
import { printDoc, buildQuotationA4 } from '../../print';
import { VariantPicker } from '../catalog/components/VariantPicker';
import type { VariantHit } from '../catalog/api';
import { convertQuotation, getQuotation, loadPosCatalog, saveQuotation, setQuotationStatus, type QuotationFull } from './api';
import { listWarehouses, type CustomerHit } from './data/lookups';
import { CustomerPicker, useMoney, useRate } from './components/common';
import { PaymentModal } from './components/PaymentModal';
import type { PayLine } from './data/types';
import { printInvoice } from './printing';
import './sales.css';

interface Line { variant_id: string; name: string; qty: number; unit_price: number; discount: number; price_tier: PriceTier }

export default function QuotationForm() {
  const { id } = useParams();
  const isNew = !id || id === 'new';
  const existing = useLoad(() => (isNew ? Promise.resolve(null) : getQuotation(id!)), [id]);
  if (existing.error) return <ErrorState message={existing.error} onRetry={existing.reload} />;
  if (!isNew && !existing.data) return <Loading />;
  return <Editor key={id ?? 'new'} full={existing.data ?? null} reload={existing.reload} />;
}

function Editor({ full, reload }: { full: QuotationFull | null; reload: () => Promise<void> }) {
  const nav = useNavigate();
  const fmt = useFmt();
  const m = useMoney();
  const { store } = useSettings();
  const { usd, rate } = useRate();
  const whs = useLoad(listWarehouses, []);
  const q0 = full?.quotation;
  const locked = q0?.status === 'converted' || q0?.status === 'cancelled';
  const [customer, setCustomer] = useState<Pick<CustomerHit, 'id' | 'name' | 'phone' | 'credit_limit' | 'balance'> | null>(full?.customer ? { ...full.customer, balance: 0 } : null);
  const [freeName, setFreeName] = useState(q0?.customer_name ?? '');
  const [whId, setWhId] = useState(q0?.warehouse_id ?? '');
  const [currency, setCurrency] = useState<CurrencyCode>(q0?.currency ?? 'IQD');
  const [tier, setTier] = useState<PriceTier>('retail');
  const [valid, setValid] = useState(q0?.valid_until ?? isoDay(startOfBaghdadDay(Date.now(), 7)));
  const [discount, setDiscount] = useState(q0?.discount ?? 0);
  const [note, setNote] = useState(q0?.note ?? '');
  const [lines, setLines] = useState<Line[]>(full?.items.map((i) => ({ variant_id: i.variant_id, name: `${i.name}${i.variant_title ? ` — ${i.variant_title}` : ''}`, qty: i.qty, unit_price: i.unit_price, discount: i.discount, price_tier: i.price_tier })) ?? []);
  const [picking, setPicking] = useState(false);
  const [paying, setPaying] = useState(false);
  const wh = whId || whs.data?.find((w) => w.is_default)?.id || whs.data?.[0]?.id || '';
  const catalog = useLoad(() => (wh ? loadPosCatalog(wh) : Promise.resolve([])), [wh]);
  const r = currency === 'USD' ? q0?.exchange_rate ?? rate : 1;
  useEffect(() => { if (!whId && wh) setWhId(wh); }, [wh, whId]);

  const lineTotal = (l: Line) => Math.max(0, roundMoney(l.unit_price * l.qty - l.discount, currency));
  const subtotal = roundMoney(lines.reduce((s, l) => s + lineTotal(l), 0), currency);
  const total = roundMoney(subtotal - Math.min(discount, subtotal), currency);

  const priceFor = (variantId: string, t: PriceTier, fallback: number) => {
    const it = catalog.data?.find((x) => x.variant_id === variantId);
    const iqd = it ? (t === 'wholesale' ? it.wholesale_price ?? it.price : it.price) : fallback;
    return roundMoney(iqd / r, currency);
  };
  const add = (h: VariantHit) => {
    const qty = h.factor || 1;
    setLines((ls) => {
      const i = ls.findIndex((l) => l.variant_id === h.variant_id);
      if (i >= 0) return ls.map((l, j) => (j === i ? { ...l, qty: l.qty + qty } : l));
      return [...ls, { variant_id: h.variant_id, name: `${h.name}${h.title && h.title !== 'افتراضي' ? ` — ${h.title}` : ''}`, qty, unit_price: priceFor(h.variant_id, tier, h.price), discount: 0, price_tier: tier }];
    });
  };
  const set = (i: number, p: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...p } : l)));
  const retier = (t: PriceTier) => { setTier(t); setLines((ls) => ls.map((l) => ({ ...l, price_tier: t, unit_price: priceFor(l.variant_id, t, l.unit_price) }))); };
  const recurrency = (c: CurrencyCode) => {
    if (c === currency) return;
    setLines((ls) => ls.map((l) => ({ ...l, unit_price: roundMoney(c === 'USD' ? l.unit_price / rate : l.unit_price * rate, c), discount: 0 })));
    setDiscount(0);
    setCurrency(c);
  };

  const save = useAction(async (status: QuotationStatus) => saveQuotation({
    id: q0?.id, customer_id: customer?.id ?? null, customer_name: customer ? null : freeName, warehouse_id: wh, currency, exchange_rate: currency === 'USD' ? r : 1,
    valid_until: valid || null, discount, note: note || null, status,
    items: lines.map((l) => ({ variant_id: l.variant_id, qty: l.qty, unit_price: l.unit_price, discount: l.discount, price_tier: l.price_tier })),
  }), { success: 'حُفظ عرض السعر' });
  const saveAndGo = async (status: QuotationStatus) => {
    const res = await save.run(status);
    if (res) { if (!q0) nav(`/quotations/${res.id}`, { replace: true }); else await reload(); }
    return res;
  };
  const convert = useAction(async (payments: PayLine[]) => convertQuotation(q0!.id, payments), { success: 'حُوّل العرض لفاتورة' });
  const cancel = useAction(async () => { await setQuotationStatus(q0!.id, 'cancelled'); await reload(); }, { success: 'أُلغي العرض' });

  const print = async () => {
    const f = await getQuotation(q0!.id);
    await printDoc(buildQuotationA4({ quotation: f.quotation, items: f.items, customer: f.customer, store }));
  };
  const waText = useMemo(() => [
    `عرض سعر ${q0?.number ?? ''} من ${store.name}`, '',
    ...lines.map((l) => `• ${l.name} × ${fmt.qty(l.qty)} = ${m(lineTotal(l), currency)}`), '',
    discount ? `الخصم: ${m(discount, currency)}` : '', `الإجمالي: ${m(total, currency)}`, valid ? `ساري حتى ${fmt.date(`${valid}T12:00:00Z`)}` : '',
  ].filter((x, i, a) => x || a[i - 1]).join('\n'), [lines, total, discount, valid, q0, currency]);
  const wa = whatsappLink(customer?.phone ?? null, waText);
  const expired = !!valid && valid < isoDay() && !locked;

  return (
    <>
      <PageHeader title={q0 ? <span>عرض سعر <span className="ltr">{q0.number}</span></span> : 'عرض سعر جديد'} crumbs={[{ label: 'عروض الأسعار', to: '/quotations' }, { label: q0?.number ?? 'جديد' }]}
        description={q0 ? <><Badge tone={QUOTATION_STATUS[q0.status].tone}>{QUOTATION_STATUS[q0.status].label}</Badge> · {fmt.date(q0.created_at)}</> : 'اختر الزبون والمنتجات، ثم احفظه أو أرسله.'}
        actions={q0 ? <>
          <Button icon="printer" onClick={() => void print()}>طباعة A4</Button>
          <Button icon="whatsapp" onClick={() => { if (wa) window.open(wa, '_blank', 'noopener'); else void navigator.clipboard?.writeText(waText); }}>{wa ? 'واتساب' : 'نسخ النص'}</Button>
          {!locked ? <Button icon="xCircle" variant="ghost" loading={cancel.busy} onClick={async () => { if (await askConfirm({ title: 'إلغاء عرض السعر؟', danger: true, confirm: 'إلغاء العرض' })) void cancel.run(); }}>إلغاء</Button> : null}
          {!locked ? <Button variant="primary" icon="receipt" onClick={() => setPaying(true)}>تحويل لفاتورة</Button> : null}
        </> : null} />
      {q0?.status === 'converted' && q0.invoice_id ? <Alert tone="success">حُوّل لفاتورة <Link className="ltr" to={`/invoices/${q0.invoice_id}`}>{full?.invoice_number ?? 'عرض'}</Link>.</Alert> : null}
      {expired ? <Alert tone="warning">انتهت صلاحية العرض. عند التحويل تُحتسب أسعار اليوم.</Alert> : null}
      <div className="sx-split">
        <div className="sx-stack">
          {!locked ? <VariantPicker onPick={add} autoFocus={!q0} placeholder="أضف منتجاً: ابحث بالاسم أو SKU أو امسح الباركود…" /> : null}
          <Card flush>
            {!lines.length ? <EmptyState icon="fileText" title="لا بنود بعد" text="ابحث عن المنتج أعلاه أو امسح الباركود." /> : (
              <div className="table-scroll">
                <table className="table">
                  <thead><tr><th>المنتج</th><th style={{ width: 110 }}>الكمية</th><th style={{ width: 150 }}>السعر</th><th style={{ width: 130 }}>الخصم</th><th className="end">المجموع</th><th /></tr></thead>
                  <tbody>
                    {lines.map((l, i) => (
                      <tr key={l.variant_id}>
                        <td><b>{l.name}</b>{l.price_tier === 'wholesale' ? <div className="small faint">جملة</div> : null}</td>
                        <td><NumberInput value={l.qty} onChange={(v) => set(i, { qty: Math.max(1, v ?? 1) })} min={1} disabled={locked} ariaLabel="الكمية" size_="sm" /></td>
                        <td><MoneyInput value={l.unit_price} onChange={(v) => set(i, { unit_price: v ?? 0 })} currency={currency} disabled={locked} ariaLabel="السعر" size_="sm" /></td>
                        <td><MoneyInput value={l.discount || null} onChange={(v) => set(i, { discount: v ?? 0 })} currency={currency} disabled={locked} ariaLabel="الخصم" size_="sm" /></td>
                        <td className="end"><b>{m(lineTotal(l), currency)}</b></td>
                        <td>{!locked ? <IconButton icon="trash" size="sm" label="حذف" onClick={() => setLines(lines.filter((_, j) => j !== i))} /> : null}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
          <Field label="ملاحظات للزبون"><Textarea rows={3} value={note} disabled={locked} onChange={(e) => setNote(e.target.value)} placeholder="مدة التوريد، الضمان، شروط الدفع…" /></Field>
        </div>
        <div className="sx-stack">
          <Card title="الزبون" icon="user">
            {customer ? (
              <div className="pos-cust"><Avatar name={customer.name} size={32} /><span className="grow"><b>{customer.name}</b></span>{!locked ? <Button size="sm" variant="ghost" onClick={() => setCustomer(null)}>تغيير</Button> : null}</div>
            ) : (
              <div className="stack-sm">
                <Button icon="users" onClick={() => setPicking(true)} disabled={locked}>اختيار زبون مسجّل</Button>
                <Field label="أو اكتب الاسم"><Input value={freeName} disabled={locked} onChange={(e) => setFreeName(e.target.value)} placeholder="شركة النور للتجهيزات" /></Field>
              </div>
            )}
          </Card>
          <Card title="الإعدادات" icon="sliders">
            <div className="stack">
              {(whs.data ?? []).length > 1 ? <Field label="المخزن"><Select value={wh} disabled={locked} onChange={(e) => setWhId(e.target.value)} options={(whs.data ?? []).map((w) => ({ value: w.id, label: w.name }))} /></Field> : null}
              <Field label="السعر"><Segmented value={tier} onChange={(t) => !locked && retier(t)} options={[{ value: 'retail', label: 'مفرد' }, { value: 'wholesale', label: 'جملة' }]} /></Field>
              {usd ? <Field label="العملة" hint={currency === 'USD' ? `بسعر صرف ${m(r)}` : undefined}><Segmented value={currency} onChange={(c) => !locked && recurrency(c)} options={[{ value: 'IQD', label: 'دينار' }, { value: 'USD', label: 'دولار' }]} /></Field> : null}
              <Field label="ساري حتى"><Input type="date" value={valid} disabled={locked} onChange={(e) => setValid(e.target.value)} /></Field>
            </div>
          </Card>
          <Card title="الإجمالي" icon="receipt">
            <div className="totals">
              <div><span>المجموع</span><span>{m(subtotal, currency)}</span></div>
              <div><span>خصم العرض</span><span style={{ width: 150 }}><MoneyInput value={discount || null} onChange={(v) => setDiscount(v ?? 0)} currency={currency} disabled={locked} size_="sm" ariaLabel="خصم العرض" /></span></div>
              <div className="grand"><span>الإجمالي</span><span>{m(total, currency)}</span></div>
            </div>
            {!locked ? (
              <div className="sx-row" style={{ marginTop: 12 }}>
                <Button loading={save.busy} onClick={() => void saveAndGo(q0?.status === 'sent' ? 'sent' : 'draft')}>{q0 ? 'حفظ التعديل' : 'حفظ كمسودة'}</Button>
                {q0?.status !== 'sent' ? <Button variant="primary" icon="share" loading={save.busy} onClick={async () => { const r2 = await saveAndGo('sent'); if (r2 && wa) window.open(wa, '_blank', 'noopener'); }}>حفظ وإرسال</Button> : null}
                {q0 && q0.status === 'sent' ? <Button onClick={() => void saveAndGo('accepted')}>قبِله الزبون</Button> : null}
              </div>
            ) : null}
          </Card>
        </div>
      </div>
      <CustomerPicker open={picking} allowCash={false} onClose={() => setPicking(false)} onPick={(c) => c && setCustomer(c)} />
      {q0 ? (
        <PaymentModal open={paying} onClose={() => setPaying(false)} title={`تحويل ${q0.number} لفاتورة`} total={q0.total} currency={q0.currency} rate={q0.currency === 'USD' ? q0.exchange_rate : rate} usdEnabled={usd}
          customer={customer ? { name: customer.name, credit_limit: customer.credit_limit, balance: customer.balance } : null} busy={convert.busy}
          onConfirm={async (p) => { const res = await convert.run(p); if (res) { setPaying(false); void printInvoice(res.invoice_id, store, 'A4').catch(() => undefined); nav(`/invoices/${res.invoice_id}`); } }} />
      ) : null}
    </>
  );
}
