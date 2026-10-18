/**
 * نقطة البيع: بحث ومسح، أقسام، شبكة منتجات، سلة بكميات وخصومات وسريالات، مفرد/جملة، دينار/دولار، دفع مجزأ، تعليق واستئناف.
 * اختصارات: F2 البحث · F4 الزبون · F8 تعليق · F9 الدفع · Esc إغلاق/مسح البحث.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { formatPhone, matchScore, roundMoney, type CurrencyCode, type PriceTier } from '@raqeem/shared';
import { Alert, Avatar, Badge, Button, EmptyState, ErrorState, Field, IconButton, Input, Kbd, Modal, MoneyInput, NumberInput, Segmented, Select, Skeleton, Thumb, Icon, askConfirm, askText, toast, Checkbox } from '../../ui';
import { useAuth } from '../../lib/auth';
import { useAction, useHotkey, useLoad, useStored } from '../../lib/hooks';
import { useBarcodeScanner, beep } from '../../lib/scanner';
import { useFmt, useSettings } from '../../lib/settings';
import { useCounts } from '../../lib/counts';
import { availableSerials, findUnitByBarcode, loadPosCatalog, mySession, openCashSession, posCheckout } from './api';
import { listCategories, listWarehouses, type CustomerHit } from './data/lookups';
import { useSetting } from './data/app-settings';
import type { CheckoutResult, PayLine, PosItem } from './data/types';
import { CustomerPicker, useMoney, useRate } from './components/common';
import { PaymentModal } from './components/PaymentModal';
import { printInvoice } from './printing';
import './sales.css';

interface CartLine {
  key: string;
  item: PosItem;
  qty: number; // بالقطع
  price: number | null; // سعر يدوي بعملة الفاتورة
  discount: number; // على البند كله
  serials: string[];
  unit_name?: string | null;
}
interface Held { id: string; at: string; customer: CustomerHit | null; lines: CartLine[]; discount: number; currency: CurrencyCode; tier: PriceTier; note: string }

export default function Pos() {
  const { can, profile } = useAuth();
  const { store } = useSettings();
  const counts = useCounts();
  const m = useMoney();
  const fmt = useFmt();
  const { usd, rate } = useRate();
  const root = useRef<HTMLDivElement>(null);
  // ارتفاع الشاشة المتاح تحت الشريط العلوي (وشريط وضع العرض إن ظهر)
  useLayoutEffect(() => {
    const fit = () => { const el = root.current; if (el && window.innerWidth > 900) el.style.height = `${window.innerHeight - el.getBoundingClientRect().top - window.scrollY}px`; else if (el) el.style.height = ''; };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);
  const posCfg = useSetting('pos');
  const invCfg = useSetting('inventory');
  const whs = useLoad(listWarehouses, []);
  const cats = useLoad(listCategories, []);
  const [whId, setWhId] = useStored<string>('rq.pos.wh', '');
  const sellable = (whs.data ?? []).filter((w) => w.is_sellable);
  const wh = sellable.find((w) => w.id === whId) ?? sellable.find((w) => w.id === invCfg.default_warehouse_id) ?? sellable.find((w) => w.is_default) ?? sellable[0];
  const catalog = useLoad(() => (wh ? loadPosCatalog(wh.id) : Promise.resolve([] as PosItem[])), [wh?.id]);
  const session = useLoad(() => mySession(profile?.id ?? ''), [profile?.id]);

  const [tier, setTier] = useStored<PriceTier>('rq.pos.tier', 'retail');
  const [currency, setCurrency] = useState<CurrencyCode>('IQD');
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [lines, setLines] = useState<CartLine[]>([]);
  const [customer, setCustomer] = useState<CustomerHit | null>(null);
  const [discount, setDiscount] = useState(0);
  const [note, setNote] = useState('');
  const [held, setHeld] = useStored<Held[]>('rq.pos.held', []);
  const [picking, setPicking] = useState(false);
  const [paying, setPaying] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [serialFor, setSerialFor] = useState<string | null>(null);
  const [showHeld, setShowHeld] = useState(false);
  const [done, setDone] = useState<(CheckoutResult & { total: number; currency: CurrencyCode }) | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const search = useRef<HTMLInputElement>(null);
  const r = currency === 'USD' ? rate : 1;

  const baseIqd = (it: PosItem) => (tier === 'wholesale' ? it.wholesale_price ?? it.price : it.price);
  const unitPrice = (l: CartLine) => l.price ?? roundMoney(baseIqd(l.item) / r, currency);
  const lineTotal = (l: CartLine) => Math.max(0, roundMoney(unitPrice(l) * l.qty - l.discount, currency));
  const subtotal = roundMoney(lines.reduce((s, l) => s + lineTotal(l), 0), currency);
  const disc = Math.min(discount, subtotal);
  const total = roundMoney(subtotal - disc, currency);
  const pieces = lines.reduce((s, l) => s + l.qty, 0);

  // ----- البحث المحلي
  const items = catalog.data ?? [];
  const shown = useMemo(() => {
    const term = q.trim();
    let list = cat ? items.filter((i) => i.category_id === cat || cats.data?.find((c) => c.id === i.category_id)?.parent_id === cat) : items;
    if (term) {
      list = list.map((i) => ({ i, s: i.barcode === term || i.sku.toLowerCase() === term.toLowerCase() ? 1000 : matchScore(term, `${i.search} ${i.sku}`) })).filter((x) => x.s > 0).sort((a, b) => b.s - a.s).map((x) => x.i);
    }
    return list.slice(0, 120);
  }, [items, q, cat, cats.data]);
  const inCart = useMemo(() => { const mp = new Map<string, number>(); lines.forEach((l) => mp.set(l.item.variant_id, (mp.get(l.item.variant_id) ?? 0) + l.qty)); return mp; }, [lines]);
  const rootCats = (cats.data ?? []).filter((c) => !c.parent_id && items.some((i) => i.category_id === c.id || cats.data?.find((x) => x.id === i.category_id)?.parent_id === c.id));

  // ----- السلة
  const add = (it: PosItem, qty = 1, unitName: string | null = null) => {
    const have = inCart.get(it.variant_id) ?? 0;
    if (!invCfg.allow_negative_stock && have + qty > it.stock) {
      beep('error');
      toast.error(it.stock <= 0 ? `«${it.name}» غير متوفر في ${wh?.name ?? 'المخزن'}.` : `المتوفر من «${it.name}» ${it.stock} فقط.`);
      return;
    }
    beep('ok');
    setLines((ls) => {
      const i = ls.findIndex((l) => l.item.variant_id === it.variant_id && !l.item.track_serials);
      if (i >= 0 && !unitName) return ls.map((l, j) => (j === i ? { ...l, qty: l.qty + qty } : l));
      return [{ key: `${it.variant_id}-${Date.now()}`, item: it, qty, price: null, discount: 0, serials: [], unit_name: unitName }, ...ls];
    });
    if (it.track_serials) setTimeout(() => setSerialFor(`${it.variant_id}`), 50);
  };
  const setQty = (key: string, qty: number) => setLines((ls) => ls.flatMap((l) => (l.key !== key ? [l] : qty <= 0 ? [] : [{ ...l, qty, serials: l.serials.slice(0, qty) }])));
  const patch = (key: string, p: Partial<CartLine>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...p } : l)));
  const reset = () => { setLines([]); setCustomer(null); setDiscount(0); setNote(''); setQ(''); };

  const onCode = async (code: string) => {
    const c = code.trim();
    if (!c) return;
    const hit = items.find((i) => i.barcode === c) ?? items.find((i) => i.sku.toLowerCase() === c.toLowerCase());
    if (hit) { add(hit); setQ(''); return; }
    const unit = await findUnitByBarcode(c).catch(() => null);
    const it = unit ? items.find((i) => i.variant_id === unit.variant_id) : undefined;
    if (unit && it) { add(it, unit.factor, unit.unit_name); toast.info(`${unit.unit_name}: أُضيفت ${unit.factor} قطعة من «${it.name}»`); setQ(''); return; }
    beep('error');
    toast.error(`لا يوجد منتج بالباركود ${c}`);
  };
  useBarcodeScanner((c) => void onCode(c), { enabled: !paying && !done });

  // serialFor = variant_id عند الإضافة، أو key عند الضغط على الوسم
  const serialLine = lines.find((l) => l.key === serialFor) ?? lines.find((l) => l.item.variant_id === serialFor);

  // ----- تعليق واستئناف
  const hold = async () => {
    if (!lines.length) return;
    const label = customer?.name ?? (await askText({ title: 'تعليق الفاتورة', label: 'اسم للتذكير (اختياري)', placeholder: 'زبون الطاولة ٢' })) ?? '';
    setHeld([{ id: String(Date.now()), at: new Date().toISOString(), customer, lines, discount, currency, tier, note: note || label }, ...held].slice(0, 20));
    reset();
    toast.success('عُلّقت الفاتورة. استأنفها من «المعلّقة».');
  };
  const resume = (h: Held) => {
    if (lines.length) { toast.error('أكمل الفاتورة الحالية أو علّقها أولاً.'); return; }
    setLines(h.lines); setCustomer(h.customer); setDiscount(h.discount); setCurrency(h.currency); setTier(h.tier); setNote(h.note);
    setHeld(held.filter((x) => x.id !== h.id));
    setShowHeld(false);
  };

  // ----- الدفع
  const checkout = useAction(async (payments: PayLine[]) => {
    if (!wh) throw new Error('اختر المخزن');
    const res = await posCheckout({
      warehouse_id: wh.id, customer_id: customer?.id ?? null, currency, exchange_rate: currency === 'USD' || payments.some((p) => p.currency === 'USD') ? rate : undefined,
      items: lines.map((l) => ({
        variant_id: l.item.variant_id, qty: l.qty, price_tier: tier,
        ...(l.price !== null ? { unit_price: l.price } : {}), ...(l.discount ? { discount: l.discount } : {}), ...(l.serials.length ? { serials: l.serials } : {}),
      })),
      discount: disc || undefined, payments, note: note || undefined,
    });
    return res;
  });
  const pay = async (payments: PayLine[]) => {
    const res = await checkout.run(payments);
    if (!res) return;
    setPaying(false);
    setDone({ ...res, total, currency });
    reset();
    setCartOpen(false);
    void catalog.reload();
    void counts.refresh();
    if (posCfg.auto_print) printInvoice(res.invoice_id, store, 'thermal', res.change).catch(() => toast.error('تعذّرت الطباعة. أعد المحاولة من «طباعة الإيصال».'));
  };
  const startPay = () => {
    if (!lines.length) { toast.info('السلة فارغة. امسح منتجاً أو اختره من الشبكة.'); return; }
    const missing = lines.find((l) => l.item.track_serials && l.serials.length !== l.qty);
    if (missing) { toast.error(`أدخل الأرقام التسلسلية لـ «${missing.item.name}».`); setSerialFor(missing.key); return; }
    if (posCfg.require_cash_session && !session.data) { toast.error('افتح جلسة الصندوق أولاً.'); return; }
    setPaying(true);
  };

  const modalOpen = paying || picking || !!editing || !!serialFor || showHeld || !!done;
  useHotkey('F2', () => search.current?.focus(), !modalOpen);
  useHotkey('F4', () => setPicking(true), !modalOpen);
  useHotkey('F8', () => void hold(), !modalOpen);
  useHotkey('F9', startPay, !modalOpen);
  useHotkey('Escape', () => { if (q) setQ(''); else if (cartOpen) setCartOpen(false); }, !modalOpen);
  useEffect(() => { if (!modalOpen) search.current?.focus(); }, [modalOpen]);

  const openSession = useAction(async () => {
    const f = await askText({ title: 'فتح جلسة الصندوق', label: 'المبلغ الافتتاحي في الدرج (د.ع)', initial: '0', confirm: 'فتح الجلسة' });
    if (f === null) return null;
    const s = await openCashSession(Number(f.replace(/[^\d.]/g, '')) || 0);
    await session.reload();
    return s;
  }, { success: 'فُتحت جلسة الصندوق' });

  if (whs.error) return <ErrorState message={whs.error} onRetry={whs.reload} />;
  const editLine = lines.find((l) => l.key === editing);
  const alt = (n: number) => (currency === 'IQD' ? m(n / rate, 'USD') : m(n * rate));

  return (
    <div className="pos" ref={root}>
      <section className="pos-main" aria-label="المنتجات">
        <div className="pos-bar">
          <div className="grow">
            <Input ref={search} icon="search" size_="lg" value={q} placeholder="ابحث بالاسم أو SKU، أو امسح الباركود…" aria-label="بحث المنتجات" data-scan-target="pos"
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); const exact = items.find((i) => i.barcode === q.trim() || i.sku.toLowerCase() === q.trim().toLowerCase()); if (exact) { add(exact); setQ(''); } else if (shown.length === 1) { add(shown[0]); setQ(''); } else if (/^\d{6,}$/.test(q.trim())) void onCode(q); } }}
              suffix={<Kbd>F2</Kbd>} />
          </div>
          {sellable.length > 1 ? <Select aria-label="المخزن" value={wh?.id ?? ''} onChange={(e) => { if (lines.length) { toast.error('أفرغ السلة قبل تغيير المخزن.'); return; } setWhId(e.target.value); }} options={sellable.map((w) => ({ value: w.id, label: w.name }))} /> : null}
          <Segmented label="السعر" value={tier} onChange={setTier} options={[{ value: 'retail', label: 'مفرد' }, { value: 'wholesale', label: 'جملة' }]} />
          {usd ? <Segmented label="العملة" value={currency} onChange={(c) => { if (lines.some((l) => l.price !== null || l.discount) || discount) { toast.info('أُلغيت الأسعار اليدوية والخصومات بعد تغيير العملة.'); setLines((ls) => ls.map((l) => ({ ...l, price: null, discount: 0 }))); setDiscount(0); } setCurrency(c); }} options={[{ value: 'IQD', label: 'دينار' }, { value: 'USD', label: 'دولار' }]} /> : null}
        </div>
        <div className="pos-chips" role="tablist" aria-label="الأقسام">
          <button type="button" className={!cat ? 'on' : ''} onClick={() => setCat('')}>الكل</button>
          {rootCats.map((c) => <button key={c.id} type="button" className={cat === c.id ? 'on' : ''} onClick={() => setCat(c.id)}>{c.name}</button>)}
        </div>
        <div className="sx-between sx-muted" style={{ fontSize: 12.5 }}>
          <span>{usd ? <>سعر الصرف اليوم: <b className="sx-mono">{m(rate)}</b> للدولار</> : null}</span>
          <span className="sx-row">
            {session.data ? <Badge tone="success">الصندوق مفتوح</Badge> : <Button size="sm" variant="ghost" icon="cash" loading={openSession.busy} onClick={() => void openSession.run()}>فتح جلسة الصندوق</Button>}
            {held.length ? <Button size="sm" icon="clock" onClick={() => setShowHeld(true)}>المعلّقة ({fmt.num(held.length)})</Button> : null}
          </span>
        </div>
        {posCfg.require_cash_session && !session.loading && !session.data ? <Alert tone="warning">البيع يحتاج جلسة صندوق مفتوحة. اضغط «فتح جلسة الصندوق».</Alert> : null}
        <div className="pos-grid">
          {catalog.loading && !catalog.data ? Array.from({ length: 12 }, (_, i) => <Skeleton key={i} h={170} r={16} />) : null}
          {catalog.error ? <div style={{ gridColumn: '1/-1' }}><ErrorState message={catalog.error} onRetry={catalog.reload} /></div> : null}
          {catalog.data && !shown.length ? <div style={{ gridColumn: '1/-1' }}><EmptyState icon="search" title={q ? 'لا نتائج' : 'لا منتجات في هذا المخزن'} text={q ? 'جرّب اسماً آخر أو امسح الباركود.' : 'أضف منتجات أو أدخل مخزوناً أولاً.'} /></div> : null}
          {shown.map((it) => {
            const n = inCart.get(it.variant_id);
            const price = roundMoney(baseIqd(it) / r, currency);
            return (
              <button key={it.variant_id} type="button" className={`pos-card ${it.stock <= 0 ? 'out' : ''}`} onClick={() => add(it)} title={it.sku}>
                <Thumb imageKey={it.image_key} size="lg" />
                {n ? <span className="incart">{fmt.qty(n)}</span> : null}
                <span className="nm">{it.name}{it.variant_title ? ` — ${it.variant_title}` : ''}</span>
                <span className="sx-between"><span className="pr">{m(price, currency)}</span><small className={it.stock <= 0 ? 'sx-neg' : it.stock <= it.min_stock ? 'sx-muted' : 'sx-muted'}>{it.stock <= 0 ? 'نفد' : `${fmt.qty(it.stock)} ${it.unit}`}</small></span>
              </button>
            );
          })}
        </div>
      </section>

      <aside className={`pos-cart ${cartOpen ? 'open' : ''}`} aria-label="السلة">
        <button type="button" className="pos-mobile-toggle sx-between" style={{ padding: '12px 16px', border: 0, background: 'var(--hero)', color: 'var(--hero-ink)', fontFamily: 'inherit', borderRadius: '20px 20px 0 0', cursor: 'pointer' }} onClick={() => setCartOpen(!cartOpen)}>
          <span><Icon name="cart" size={18} /> السلة · {fmt.qty(pieces)} قطعة</span><b style={{ fontSize: 20 }}>{m(total, currency)}</b>
        </button>
        <div className="pos-cart-head">
          <button type="button" className="pos-cust" style={{ border: 0, cursor: 'pointer', color: 'var(--ink)', fontFamily: 'inherit', textAlign: 'start' }} onClick={() => setPicking(true)}>
            <Avatar name={customer?.name ?? 'ن'} size={34} />
            <span className="grow">
              <b className="truncate" style={{ display: 'block' }}>{customer?.name ?? 'زبون نقدي'}</b>
              <span className="sx-muted">{customer ? `${customer.phone ? formatPhone(customer.phone) : 'بلا هاتف'}${customer.balance > 0 ? ` · عليه ${m(customer.balance)}` : ''}` : 'اضغط لاختيار زبون أو إضافة جديد'}</span>
            </span>
            <Kbd>F4</Kbd>
          </button>
        </div>
        <div className="pos-lines">
          {!lines.length ? <EmptyState icon="cart" title="السلة فارغة" text="امسح الباركود أو اختر من المنتجات." /> : null}
          {lines.map((l) => (
            <div key={l.key} className="pos-line">
              <div className="top">
                <span className="nm">{l.item.name}{l.item.variant_title ? <span className="sx-muted"> — {l.item.variant_title}</span> : null}</span>
                <b className="sx-mono">{m(lineTotal(l), currency)}</b>
                <IconButton icon="trash" size="sm" label="حذف من السلة" onClick={() => setQty(l.key, 0)} />
              </div>
              <div className="bot">
                <span className="qty-step">
                  <button type="button" aria-label="إنقاص" onClick={() => setQty(l.key, l.qty - 1)}><Icon name="minus" size={14} /></button>
                  <input aria-label="الكمية" inputMode="numeric" value={l.qty} onChange={(e) => { const v = Number(e.target.value.replace(/\D/g, '')); if (v >= 0) setQty(l.key, v || 1); }} onFocus={(e) => e.target.select()} />
                  <button type="button" aria-label="زيادة" onClick={() => add(l.item)}><Icon name="plus" size={14} /></button>
                </span>
                <span className="sx-muted sx-mono">× {m(unitPrice(l), currency, true)}{l.price !== null ? ' (يدوي)' : ''}</span>
              </div>
              <div className="tags">
                {l.unit_name ? <Badge>{l.unit_name}</Badge> : null}
                {can('pos.discount') || can('pos.price_override') ? <button type="button" className={l.discount || l.price !== null ? 'set' : ''} onClick={() => setEditing(l.key)}>{l.discount ? `خصم ${m(l.discount, currency, true)}` : can('pos.price_override') ? 'السعر والخصم' : 'خصم'}</button> : null}
                {l.item.track_serials ? <button type="button" className={l.serials.length === l.qty ? 'set' : ''} onClick={() => setSerialFor(l.key)}>التسلسلي {fmt.num(l.serials.length)}/{fmt.num(l.qty)}</button> : null}
              </div>
            </div>
          ))}
        </div>
        <div className="pos-foot">
          {lines.length ? (
            <div className="totals">
              <div><span>المجموع ({fmt.qty(pieces)} قطعة)</span><span className="sx-mono">{m(subtotal, currency)}</span></div>
              {can('pos.discount') ? (
                <div><span>خصم الفاتورة</span><span style={{ width: 150 }}><MoneyInput value={discount || null} onChange={(v) => setDiscount(v ?? 0)} currency={currency} size_="sm" ariaLabel="خصم الفاتورة" /></span></div>
              ) : disc ? <div><span>الخصم</span><span>− {m(disc, currency)}</span></div> : null}
            </div>
          ) : null}
          <div className="pos-total">
            <span><span className="sx-muted">الإجمالي</span>{usd ? <div className="alt">{alt(total)}</div> : null}</span>
            <span className="big">{m(total, currency)}</span>
          </div>
          <div className="sx-row" style={{ flexWrap: 'nowrap' }}>
            <Button icon="clock" onClick={() => void hold()} disabled={!lines.length} kbd="F8">تعليق</Button>
            <IconButton icon="trash" label="إفراغ السلة" disabled={!lines.length} onClick={async () => { if (await askConfirm({ title: 'إفراغ السلة؟', danger: true, confirm: 'إفراغ' })) reset(); }} />
            <Button variant="primary" className="pos-pay" style={{ flex: 1 }} icon="cash" onClick={startPay} disabled={!lines.length} kbd="F9" block>الدفع</Button>
          </div>
        </div>
      </aside>

      <CustomerPicker open={picking} onClose={() => setPicking(false)} onPick={setCustomer} />
      <PaymentModal open={paying} onClose={() => setPaying(false)} total={total} currency={currency} rate={rate} usdEnabled={usd}
        customer={customer ? { name: customer.name, credit_limit: customer.credit_limit, balance: customer.balance } : null} busy={checkout.busy} onConfirm={(p) => void pay(p)} />

      {editLine ? <LineEdit line={editLine} currency={currency} unit={unitPrice(editLine)} canPrice={can('pos.price_override')} canDiscount={can('pos.discount')} onClose={() => setEditing(null)} onSave={(p) => { patch(editLine.key, p); setEditing(null); }} /> : null}
      {serialLine && wh ? <SerialModal line={serialLine} warehouseId={wh.id} onClose={() => setSerialFor(null)} onSave={(s) => { patch(serialLine.key, { serials: s, qty: Math.max(serialLine.qty, s.length) }); setSerialFor(null); }} /> : null}

      <Modal open={showHeld} onClose={() => setShowHeld(false)} title="الفواتير المعلّقة" subtitle="محفوظة على هذا الجهاز فقط" width={520}>
        {!held.length ? <EmptyState icon="clock" title="لا فواتير معلّقة" /> : held.map((h) => (
          <div key={h.id} className="list-item">
            <div className="grow" style={{ minWidth: 0 }}><b>{h.customer?.name ?? (h.note || 'زبون نقدي')}</b><div className="meta">{fmt.num(h.lines.length)} بند · {fmt.time(h.at)}</div></div>
            <Button size="sm" variant="primary" onClick={() => resume(h)}>استئناف</Button>
            <IconButton icon="trash" label="حذف" onClick={() => setHeld(held.filter((x) => x.id !== h.id))} />
          </div>
        ))}
      </Modal>

      <Modal open={!!done} onClose={() => setDone(null)} width={420} title="تمّ البيع"
        footer={<><Button icon="printer" onClick={() => done && printInvoice(done.invoice_id, store, 'thermal', done.change)}>طباعة الإيصال</Button><Button icon="fileText" onClick={() => done && printInvoice(done.invoice_id, store, 'A4')}>A4</Button><Button variant="primary" autoFocus onClick={() => setDone(null)}>بيع جديد</Button></>}>
        {done ? (
          <div className="pos-done">
            <span className="ok"><Icon name="check" size={32} /></span>
            <div>فاتورة <Link to={`/invoices/${done.invoice_id}`} className="ltr"><b>{done.number}</b></Link> · {m(done.total, done.currency)}</div>
            {done.change > 0 ? <><span className="sx-muted">الباقي للزبون</span><span className="change">{m(done.change, done.currency)}</span></> : <span className="sx-muted">لا باقٍ للزبون</span>}
          </div>
        ) : null}
      </Modal>
    </div>
  );
}

function LineEdit({ line, currency, unit, canPrice, canDiscount, onClose, onSave }: { line: CartLine; currency: CurrencyCode; unit: number; canPrice: boolean; canDiscount: boolean; onClose: () => void; onSave: (p: Partial<CartLine>) => void }) {
  const m = useMoney();
  const fmt = useFmt();
  const [price, setPrice] = useState<number | null>(line.price ?? unit);
  const [mode, setMode] = useState<'amount' | 'percent'>('amount');
  const [disc, setDisc] = useState<number | null>(line.discount || null);
  const gross = (price ?? unit) * line.qty;
  const discAmount = mode === 'percent' ? roundMoney((gross * Math.min(disc ?? 0, 100)) / 100, currency) : disc ?? 0;
  return (
    <Modal open onClose={onClose} title={line.item.name} subtitle={`${fmt.qty(line.qty)} × ${m(unit, currency)}`} width={440}
      footer={<><Button onClick={() => onSave({ price: null, discount: 0 })}>إعادة الأصل</Button><Button variant="primary" onClick={() => onSave({ price: canPrice && price !== null && price !== roundMoney(unit, currency) ? price : line.price, discount: Math.min(discAmount, gross) })}>تطبيق</Button></>}>
      <div className="stack">
        {canPrice ? <Field label="سعر الوحدة"><MoneyInput autoFocus value={price} onChange={setPrice} currency={currency} /></Field> : null}
        {canDiscount ? (
          <Field label="خصم على البند">
            <div className="sx-row" style={{ flexWrap: 'nowrap' }}>
              <Segmented value={mode} onChange={setMode} options={[{ value: 'amount', label: 'مبلغ' }, { value: 'percent', label: '٪' }]} />
              {mode === 'amount' ? <MoneyInput value={disc} onChange={setDisc} currency={currency} /> : <NumberInput value={disc} onChange={setDisc} max={100} suffix="٪" />}
            </div>
          </Field>
        ) : null}
        <div className="totals"><div className="grand"><span>صافي البند</span><span>{m(Math.max(0, gross - discAmount), currency)}</span></div></div>
      </div>
    </Modal>
  );
}

function SerialModal({ line, warehouseId, onClose, onSave }: { line: CartLine; warehouseId: string; onClose: () => void; onSave: (s: string[]) => void }) {
  const fmt = useFmt();
  const avail = useLoad(() => availableSerials(line.item.variant_id, warehouseId), [line.item.variant_id, warehouseId]);
  const [sel, setSel] = useState<string[]>(line.serials);
  const [typed, setTyped] = useState('');
  const toggle = (s: string) => setSel((x) => (x.includes(s) ? x.filter((y) => y !== s) : [...x, s]));
  const addTyped = () => { const s = typed.trim(); if (s && !sel.includes(s)) setSel([...sel, s]); setTyped(''); };
  return (
    <Modal open onClose={onClose} title="الأرقام التسلسلية" subtitle={`${line.item.name} — المطلوب ${fmt.num(line.qty)}`} width={480}
      footer={<><Button onClick={onClose}>لاحقاً</Button><Button variant="primary" onClick={() => onSave(sel)}>حفظ ({fmt.num(sel.length)})</Button></>}>
      <div className="stack">
        <Input autoFocus dir="ltr" icon="serial" placeholder="امسح أو اكتب الرقم ثم Enter" value={typed} data-scan-target="keep" onChange={(e) => setTyped(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTyped(); } }} />
        {avail.loading ? <Skeleton h={80} /> : (avail.data ?? []).length ? (
          <div className="serial-list">
            {[...new Set([...(avail.data ?? []), ...sel])].map((s) => <Checkbox key={s} label={<span className="ltr">{s}</span>} checked={sel.includes(s)} onChange={() => toggle(s)} />)}
          </div>
        ) : <p className="sx-muted">لا أرقام مسجّلة لهذا المنتج في المخزن. اكتبها يدوياً.</p>}
      </div>
    </Modal>
  );
}
