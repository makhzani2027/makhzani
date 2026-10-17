import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { CurrencyCode } from '@raqeem/shared';
import { Alert, Button, Card, EmptyState, Field, IconButton, Input, MoneyInput, NumberInput, PageHeader, Segmented, Select, Textarea, Thumb, toast } from '../../ui';
import { useAuth } from '../../lib/auth';
import { useAction, useLoad } from '../../lib/hooks';
import { useFmt, useSettings } from '../../lib/settings';
import { useCounts } from '../../lib/counts';
import { variantsByIds, type VariantHit } from '../catalog/api';
import { useMoneyIn, useUnsavedGuard } from '../catalog/components/hooks';
import { VariantPicker } from '../catalog/components/VariantPicker';
import { lastCostsOf, listSuppliers, listWarehouses, postPurchase } from './api';
import { getCurrencySettings, listMoneyAccounts } from './api-extra';
import { serialList, useLines, type Line } from './components/lines';
import { PayFields, emptyPay } from './components/PayFields';
import { SupplierModal, emptySupplier } from './components/SupplierModal';
import { printPurchase } from './components/purchasePrint';
import '../catalog/catalog.css';

/**
 * فاتورة شراء ← post_purchase {supplier_id, warehouse_id, currency, exchange_rate, discount, note,
 *   items:[{variant_id, qty, unit_cost, serials?, lot_code?, expiry_date?}], payments:[{method, amount, account_id?, reference?}]}
 * الكلفة بعملة الفاتورة. مسح باركود الكرتونة يضيف عدد قطعها.
 */
export default function PurchaseNew() {
  const nav = useNavigate();
  const [sp] = useSearchParams();
  const fmt = useFmt();
  const m = useMoneyIn();
  const { store } = useSettings();
  const { can } = useAuth();
  const counts = useCounts();
  const sups = useLoad(listSuppliers, []);
  const whs = useLoad(() => listWarehouses(), []);
  const cur = useLoad(getCurrencySettings, []);
  const accounts = useLoad(listMoneyAccounts, []);
  const [supplier, setSupplier] = useState(sp.get('supplier') ?? '');
  const [wh, setWh] = useState('');
  const [currency, setCurrency] = useState<CurrencyCode>('IQD');
  const [rate, setRate] = useState<number | null>(null);
  const [discount, setDiscount] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [pay, setPay] = useState(emptyPay());
  const [addSup, setAddSup] = useState(false);
  const [done, setDone] = useState<{ invoice_id: string; number: string } | null>(null);
  const L = useLines();
  const save = useAction(postPurchase);
  const guard = useUnsavedGuard(L.lines.length > 0 && !done);

  useEffect(() => { if (!wh && whs.data?.length) setWh((whs.data.find((w) => w.is_default) ?? whs.data[0]).id); }, [wh, whs.data]);
  useEffect(() => { if (cur.data && rate === null) setRate(cur.data.usd_rate); }, [cur.data, rate]);
  // تعبئة من «النواقص»
  useEffect(() => {
    const ids = sp.get('variants')?.split(',').filter(Boolean) ?? [];
    if (!ids.length) return;
    void variantsByIds(ids).then(async (hits) => {
      const costs = await lastCostsOf(hits.map((h) => h.variant_id)).catch(() => ({} as Record<string, number>));
      for (const h of hits) L.add({ ...h, factor: Math.max(1, h.min_stock * 2 - h.available_qty) }, { unit_cost: costs[h.variant_id] ?? null });
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const addHit = async (h: VariantHit) => {
    const exists = L.lines.some((l) => l.variant_id === h.variant_id);
    let cost: number | null = null;
    if (!exists && currency === 'IQD' && can('costs.view')) cost = (await lastCostsOf([h.variant_id]).catch(() => ({} as Record<string, number>)))[h.variant_id] ?? null;
    // كلفة الكرتونة تُحوَّل لكلفة القطعة لاحقاً بيد الموظف؛ نقترح آخر كلفة للقطعة
    L.add(h, { unit_cost: cost });
  };

  const lineTotal = (l: Line) => (l.qty ?? 0) * (l.unit_cost ?? 0);
  const subtotal = useMemo(() => L.lines.reduce((s, l) => s + lineTotal(l), 0), [L.lines]);
  const total = Math.max(0, subtotal - (discount ?? 0));
  const paid = pay.amount ?? 0;
  const issues = [
    !supplier && 'اختر المورد',
    !L.lines.length && 'أضف منتجاً واحداً على الأقل',
    L.lines.some((l) => !(l.qty && l.qty > 0)) && 'كل الكميات يجب أن تكون أكبر من صفر',
    L.lines.some((l) => l.unit_cost === null) && 'اكتب كلفة كل سطر',
    L.lines.some((l) => l.track_serials && serialList(l.serials).length !== (l.qty ?? 0)) && 'عدد الأرقام التسلسلية يجب أن يساوي الكمية',
    L.lines.some((l) => l.track_expiry && !l.expiry_date) && 'اكتب تاريخ الانتهاء للمنتجات التي تتتبع الصلاحية',
    paid > total && 'المدفوع أكبر من الإجمالي',
  ].filter(Boolean) as string[];

  const submit = async () => {
    if (issues.length) { toast.error(issues[0]); return; }
    const r = await save.run({
      supplier_id: supplier, warehouse_id: wh, currency, exchange_rate: currency === 'USD' ? rate ?? 1 : 1, discount: discount ?? 0, note: note.trim() || null,
      items: L.lines.map((l) => ({
        variant_id: l.variant_id, qty: l.qty ?? 0, unit_cost: l.unit_cost ?? 0,
        ...(l.track_serials ? { serials: serialList(l.serials) } : {}),
        ...(l.track_expiry ? { ...(l.lot_code.trim() ? { lot_code: l.lot_code.trim() } : {}), expiry_date: l.expiry_date } : {}),
      })),
      payments: paid > 0 ? [{ method: pay.method, amount: paid, account_id: pay.account_id || null, ...(pay.reference ? { reference: pay.reference } : {}) }] : [],
    });
    if (r) { setDone(r); counts.refresh(); toast.success(`سُجّلت فاتورة الشراء ${r.number}`); }
  };

  const printIt = () => done && void printPurchase({
    number: done.number, created_at: new Date().toISOString(), supplier: sups.data?.find((s) => s.id === supplier)?.name ?? '', warehouse: whs.data?.find((w) => w.id === wh)?.name ?? '',
    currency, exchange_rate: rate ?? 1, subtotal, discount: discount ?? 0, total, paid, note: note || null,
    lines: L.lines.map((l) => ({ name: l.name, variant_title: l.title || null, sku: l.sku, qty: l.qty ?? 0, unit_cost: l.unit_cost ?? 0, line_total: lineTotal(l), lot_code: l.lot_code || null, expiry_date: l.expiry_date || null, serials: serialList(l.serials) })),
  }, store, fmt.digits);

  if (done) {
    return (
      <>
        <PageHeader crumbs={[{ label: 'المشتريات', to: '/purchases' }, { label: done.number }]} title="سُجّلت فاتورة الشراء" />
        <Card>
          <EmptyState icon="checkCircle" title={`فاتورة ${done.number}`} text={`${fmt.qty(L.units)} قطعة دخلت المخزن. الإجمالي ${m(total, currency)}${total - paid > 0 ? `، المتبقي للمورد ${m(total - paid, currency)}` : ''}.`}
            action={<div className="row" style={{ gap: 8, justifyContent: 'center' }}>
              <Button variant="primary" icon="printer" onClick={printIt}>طباعة A4</Button>
              <Button icon="plus" onClick={() => { setDone(null); L.setLines([]); setDiscount(null); setNote(''); setPay(emptyPay()); }}>فاتورة أخرى</Button>
              <Button variant="ghost" onClick={() => nav('/purchases')}>كل المشتريات</Button>
            </div>} />
        </Card>
      </>
    );
  }

  const expiryCol = L.lines.some((l) => l.track_expiry);
  const serialCol = L.lines.some((l) => l.track_serials);
  return (
    <>
      <PageHeader crumbs={[{ label: 'المشتريات', to: '/purchases' }, { label: 'فاتورة شراء' }]} title="فاتورة شراء" description="امسح البضاعة الواصلة، اكتب الكلفة، وسجّل ما دفعت." />
      <div className="form-layout">
        <div className="stack">
          <Card>
            <div className="grid-3">
              <Field label="المورد" required>
                <div className="row nowrap" style={{ gap: 6 }}>
                  <Select value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="اختر المورد" options={(sups.data ?? []).map((s) => ({ value: s.id, label: s.company ? `${s.name} — ${s.company}` : s.name }))} />
                  <IconButton icon="userPlus" label="مورد جديد" onClick={() => setAddSup(true)} />
                </div>
              </Field>
              <Field label="إلى مخزن"><Select value={wh} onChange={(e) => setWh(e.target.value)} options={(whs.data ?? []).map((w) => ({ value: w.id, label: w.name }))} /></Field>
              {cur.data?.usd_enabled ? (
                <Field label="العملة"><Segmented value={currency} onChange={(c) => { setCurrency(c); setPay({ ...pay, account_id: '' }); }} options={[{ value: 'IQD', label: 'دينار' }, { value: 'USD', label: 'دولار' }]} /></Field>
              ) : null}
            </div>
            {currency === 'USD' ? <div className="grid-3"><Field label="سعر الصرف" hint="دينار لكل دولار — يُحفظ مع الفاتورة"><NumberInput value={rate} onChange={setRate} min={1} /></Field></div> : null}
          </Card>
          <div className="scan-box"><VariantPicker onPick={(h) => void addHit(h)} autoFocus showStock={false} /></div>
          <Card flush>
            {!L.lines.length ? <EmptyState icon="stockIn" title="لا بنود بعد" text="امسح باركود كل منتج واصل (والكرتونة تضيف عدد قطعها)، أو ابحث بالاسم." /> : (
              <div className="scroll-x">
                <table className="lines-table">
                  <thead><tr><th>المنتج</th><th>الكمية</th><th>كلفة القطعة</th>{expiryCol ? <th>الدفعة والانتهاء</th> : null}{serialCol ? <th>الأرقام التسلسلية</th> : null}<th className="end">المجموع</th><th /></tr></thead>
                  <tbody>{L.lines.map((l) => (
                    <tr key={l.variant_id} className={Date.now() - l.added < 900 ? 'just-added' : ''}>
                      <td className="line-main"><div className="pcell"><Thumb imageKey={l.cover_key} size="sm" /><div className="meta"><b className="truncate">{l.name}</b><span>{l.title} <span className="code">{l.sku}</span></span></div></div></td>
                      <td data-label="الكمية" style={{ width: 100 }}><NumberInput value={l.qty} onChange={(n) => L.update(l.variant_id, { qty: n })} allowDecimal min={0} ariaLabel="الكمية" /></td>
                      <td data-label="الكلفة" style={{ width: 140 }}><MoneyInput value={l.unit_cost} currency={currency} onChange={(n) => L.update(l.variant_id, { unit_cost: n })} ariaLabel="كلفة القطعة" /></td>
                      {expiryCol ? <td data-label="الدفعة">{l.track_expiry ? <div className="row nowrap" style={{ gap: 4 }}><Input value={l.lot_code} onChange={(e) => L.update(l.variant_id, { lot_code: e.target.value })} placeholder="رقم الدفعة" aria-label="رقم الدفعة" style={{ width: 110 }} /><Input type="date" value={l.expiry_date} onChange={(e) => L.update(l.variant_id, { expiry_date: e.target.value })} aria-label="تاريخ الانتهاء" /></div> : <span className="faint">—</span>}</td> : null}
                      {serialCol ? <td data-label="الأرقام">{l.track_serials ? <><Input value={l.serials} dir="ltr" data-scan-target="keep" onChange={(e) => L.update(l.variant_id, { serials: e.target.value })} placeholder="امسح أو افصل بفاصلة" aria-label="الأرقام التسلسلية" /><div className={`small ${serialList(l.serials).length === (l.qty ?? 0) ? 'faint' : 'qty-neg'}`}>{fmt.num(serialList(l.serials).length)} / {fmt.num(l.qty ?? 0)}</div></> : <span className="faint">—</span>}</td> : null}
                      <td data-label="المجموع" className="end"><b className="money">{m(lineTotal(l), currency)}</b></td>
                      <td><IconButton icon="trash" label="حذف السطر" onClick={() => L.remove(l.variant_id)} /></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </Card>
          <Field label="ملاحظة"><Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="رقم فاتورة المورد، شروط الدفع…" /></Field>
        </div>
        <aside className="aside">
          <Card title="الحساب" icon="receipt">
            <div className="summary-card">
              <div className="kv-list">
                <div><span>البنود</span><span>{fmt.num(L.lines.length)} · {fmt.qty(L.units)} قطعة</span></div>
                <div><span>المجموع</span><span className="money">{m(subtotal, currency)}</span></div>
              </div>
              <Field label="خصم على الفاتورة"><MoneyInput value={discount} currency={currency} onChange={setDiscount} /></Field>
              <div className="preview-box row between"><b>الإجمالي</b><b className="money" style={{ fontSize: 20 }}>{m(total, currency)}</b></div>
              <div className="row between"><b>الدفع الآن</b><span className="inline-btns"><Button size="sm" variant="ghost" onClick={() => setPay({ ...pay, amount: total })}>كامل</Button><Button size="sm" variant="ghost" onClick={() => setPay({ ...pay, amount: null })}>آجل</Button></span></div>
              <PayFields value={pay} onChange={setPay} currency={currency} accounts={accounts.data ?? []} amountLabel="المدفوع" />
              <div className="kv-list"><div><span>المتبقي للمورد</span><b className={total - paid > 0 ? 'qty-neg' : ''}>{m(Math.max(0, total - paid), currency)}</b></div></div>
              {issues.length && L.lines.length ? <Alert tone="warning">{issues[0]}</Alert> : null}
              <Button variant="primary" size="lg" block icon="check" loading={save.busy} onClick={submit}>ترحيل الفاتورة</Button>
              <Button block onClick={async () => { if (await guard()) nav('/purchases'); }}>إلغاء</Button>
            </div>
          </Card>
        </aside>
      </div>
      {addSup ? <SupplierModal draft={emptySupplier()} onClose={() => setAddSup(false)} onSaved={(s) => { void sups.reload().then(() => setSupplier(s.id)); }} /> : null}
    </>
  );
}
