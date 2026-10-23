import { useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { cleanScan, normalizeArabic } from '@raqeem/shared';
import { Alert, Badge, Button, DataTable, ErrorState, Input, NumberInput, PageHeader, SearchInput, Segmented, Skeleton, Stat, askConfirm, toast, type Column } from '../../ui';
import { useAuth } from '../../lib/auth';
import { useAction, useLoad } from '../../lib/hooks';
import { useFmt } from '../../lib/settings';
import { useCounts } from '../../lib/counts';
import { beep, useBarcodeScanner } from '../../lib/scanner';
import { downloadText, toCsv } from '../../lib/csv';
import { errorMessage } from '../../lib/supabase';
import { findVariantByCode } from '../catalog/api';
import { applyStocktake, cancelStocktake, getStocktake, setStocktakeCount, type CountLine } from './api';
import '../catalog/catalog.css';

type Show = 'all' | 'counted' | 'uncounted' | 'diff';

/** شاشة العدّ: كل مسحة تزيد العدد (والكرتونة بعدد قطعها) مع صوت، ثم اعتماد الفروق ← apply_stocktake */
export default function StocktakeDetail() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const fmt = useFmt();
  const { can } = useAuth();
  const counts = useCounts();
  const st = useLoad(() => getStocktake(id, can('costs.view')), [id]);
  const [q, setQ] = useState('');
  const [show, setShow] = useState<Show>('all');
  const [last, setLast] = useState<{ name: string; counted: number; at: number } | null>(null);
  const [manual, setManual] = useState('');
  const apply = useAction(applyStocktake);
  const cancel = useAction(cancelStocktake, { success: 'أُلغي الجرد' });
  const draft = st.data?.stocktake.status === 'draft';
  // آخر نسخة من الأسطر (تُحدَّث فوراً بعد كل حفظ، قبل إعادة الرسم) + طابور للمسحات حتى لا تضيع مسحة سريعة
  const linesRef = useRef<CountLine[] | undefined>(undefined);
  linesRef.current = st.data?.lines;
  const scanQueue = useRef<Promise<void>>(Promise.resolve());
  // أعداد كُتبت باليد ولم تُحفظ بعد (تُحفظ قبل الاعتماد)
  const unsaved = useRef(new Set<string>());

  const setCount = async (variantId: string, counted: number | null) => {
    try {
      await setStocktakeCount(id, variantId, counted);
      unsaved.current.delete(variantId);
      const known = linesRef.current?.some((l) => l.variant_id === variantId);
      if (!known) {
        const fresh = await getStocktake(id, can('costs.view'));
        linesRef.current = fresh.lines;
        st.setData(fresh);
      } else {
        linesRef.current = linesRef.current?.map((l) => (l.variant_id === variantId ? { ...l, counted } : l));
        st.setData((d) => ({ ...d!, lines: d!.lines.map((l) => (l.variant_id === variantId ? { ...l, counted } : l)) }));
      }
      return true;
    } catch (e) { toast.error(errorMessage(e)); beep('error'); return false; }
  };

  const onCode = async (raw: string) => {
    const code = cleanScan(raw);
    if (!code || !draft) return;
    const h = await findVariantByCode(code).catch(() => null);
    if (!h) { beep('error'); toast.error(`لم نجد منتجاً بالرمز ${code}`); return; }
    const step = h.factor || 1;
    const run = async () => {
      const next = (linesRef.current?.find((l) => l.variant_id === h.variant_id)?.counted ?? 0) + step;
      if (await setCount(h.variant_id, next)) {
        beep('ok');
        setLast({ name: h.title ? `${h.name} — ${h.title}` : h.name, counted: next, at: Date.now() });
        if (h.factor > 1) toast.info(`${h.unit_name}: +${h.factor}`);
      }
    };
    scanQueue.current = scanQueue.current.then(run, run);
    await scanQueue.current;
  };
  useBarcodeScanner((c) => void onCode(c), { enabled: !!draft });

  const lines = st.data?.lines;
  const sum = useMemo(() => {
    const ls = lines ?? [];
    const counted = ls.filter((l) => l.counted !== null);
    const diffs = counted.filter((l) => l.counted !== l.expected);
    return {
      counted: counted.length, total: ls.length, diffs: diffs.length,
      plus: diffs.reduce((s, l) => s + Math.max(0, (l.counted ?? 0) - l.expected), 0),
      minus: diffs.reduce((s, l) => s + Math.max(0, l.expected - (l.counted ?? 0)), 0),
      value: diffs.reduce((s, l) => s + ((l.counted ?? 0) - l.expected) * (l.cost ?? l.price), 0),
    };
  }, [lines]);
  const t = normalizeArabic(q);
  const rows = (lines ?? []).filter((l) => (!t || normalizeArabic(`${l.name} ${l.variant_title ?? ''}`).includes(t) || l.sku.toLowerCase().includes(q.toLowerCase()) || (l.barcode ?? '').includes(q))
    && (show === 'all' || (show === 'counted' ? l.counted !== null : show === 'uncounted' ? l.counted === null : l.counted !== null && l.counted !== l.expected)));

  if (st.error) return <ErrorState message={st.error} onRetry={st.reload} />;
  if (!st.data) return <div className="stack"><Skeleton h={40} w={260} /><Skeleton h={300} /></div>;
  const s = st.data.stocktake;

  const columns: Column<CountLine>[] = [
    { key: 'p', header: 'المنتج', primary: true, cell: (l) => <div><b>{l.name}</b>{l.variant_title ? <span className="dim"> — {l.variant_title}</span> : null}<div className="small faint code">{l.sku}{l.barcode ? ` · ${l.barcode}` : ''}</div></div> },
    { key: 'e', header: 'بالنظام', end: true, cell: (l) => <span className="num">{fmt.qty(l.expected)}</span> },
    {
      key: 'c', header: 'المعدود', end: true, width: 130, cell: (l) => (draft ? (
        <span onClick={(e) => e.stopPropagation()}><NumberInput value={l.counted} allowDecimal min={0} ariaLabel={`عدد ${l.name}`} onChange={(n) => { unsaved.current.add(l.variant_id); st.setData((d) => ({ ...d!, lines: d!.lines.map((x) => (x.variant_id === l.variant_id ? { ...x, counted: n } : x)) })); }} onEnter={() => void setCount(l.variant_id, st.data!.lines.find((x) => x.variant_id === l.variant_id)?.counted ?? null)} /></span>
      ) : <span className="num">{l.counted === null ? '—' : fmt.qty(l.counted)}</span>),
    },
    { key: 'd', header: 'الفرق', end: true, cell: (l) => { if (l.counted === null) return <span className="faint">لم يُعدّ</span>; const d = l.counted - l.expected; return d === 0 ? <Badge tone="success">مطابق</Badge> : <span className={d > 0 ? 'var-pos' : 'var-neg'}>{d > 0 ? '+' : ''}{fmt.qty(d)}</span>; } },
    ...(can('costs.view') ? [{ key: 'v', header: 'قيمة الفرق', end: true, hideOnMobile: true, cell: (l: CountLine) => (l.counted !== null && l.counted !== l.expected ? <span className={l.counted > l.expected ? 'var-pos' : 'var-neg'}>{fmt.money((l.counted - l.expected) * (l.cost ?? 0))}</span> : '') }] : []),
    ...(draft ? [{ key: 'x', header: '', shrink: true, cell: (l: CountLine) => (l.counted !== null ? <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); void setCount(l.variant_id, null); }}>مسح</Button> : <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); void setCount(l.variant_id, l.expected); }}>مطابق</Button>) }] : []),
  ];

  return (
    <>
      <PageHeader crumbs={[{ label: 'الجرد', to: '/stocktakes' }, { label: s.number }]} title={`جرد ${st.data.warehouse_name}`}
        description={<span>{s.number} · {fmt.date(s.created_at, true)} {draft ? <Badge tone="warning">مفتوح</Badge> : s.status === 'cancelled' ? <Badge tone="neutral">ملغى</Badge> : <Badge tone="success">معتمد {s.applied_at ? fmt.date(s.applied_at) : ''}</Badge>}{s.note ? ` · ${s.note}` : ''}</span>}
        actions={<>
          <Button icon="download" onClick={() => downloadText(`${s.number}.csv`, toCsv(st.data!.lines.filter((l) => l.counted !== null), [
            { key: 'sku', label: 'sku', value: (l) => l.sku }, { key: 'name', label: 'name', value: (l) => l.name }, { key: 'e', label: 'expected', value: (l) => l.expected }, { key: 'c', label: 'counted', value: (l) => l.counted }, { key: 'd', label: 'diff', value: (l) => (l.counted ?? 0) - l.expected },
          ]))}>تصدير</Button>
          {draft ? <Button variant="danger" icon="close" loading={cancel.busy} onClick={async () => {
            if (!(await askConfirm({ title: 'إلغاء الجرد؟', body: 'لا تتغير الأرصدة، ويمكن بدء جرد جديد لهذا المخزن.', confirm: 'إلغاء الجرد', danger: true }))) return;
            if (await cancel.run(id)) { counts.refresh(); void st.reload(); }
          }}>إلغاء الجرد</Button> : null}
          {draft ? <Button variant="primary" icon="check" loading={apply.busy} disabled={!sum.counted} onClick={async () => {
            if (!(await askConfirm({ title: 'اعتماد الجرد؟', body: `سيُضبط رصيد ${fmt.num(sum.diffs)} نسخة على المعدود (+${fmt.qty(sum.plus)} / −${fmt.qty(sum.minus)}). النسخ التي لم تُعدّ لا تتغير. لا يمكن التراجع.`, confirm: 'اعتماد الفروق' }))) return;
            // احفظ الأعداد المكتوبة يدوياً بلا Enter أولاً، وإلا يُعتمد الجرد بدونها
            await scanQueue.current;
            for (const vid of [...unsaved.current]) {
              if (!(await setCount(vid, linesRef.current?.find((x) => x.variant_id === vid)?.counted ?? null))) return;
            }
            const r = await apply.run(id);
            if (r) { toast.success(`اعتُمد الجرد: عُدّل ${fmt.num(r.adjusted)} رصيد`); counts.refresh(); void st.reload(); }
          }}>اعتماد الجرد</Button> : null}
        </>} />
      <div className="stat-row" style={{ marginBottom: 14 }}>
        <Stat label="معدود" icon="clipboardCheck" value={`${fmt.num(sum.counted)} / ${fmt.num(sum.total)}`} />
        <Stat label="فروق" icon="alert" value={fmt.num(sum.diffs)} foot={<span><span className="var-pos">+{fmt.qty(sum.plus)}</span> · <span className="var-neg">−{fmt.qty(sum.minus)}</span></span>} />
        <Stat label={can('costs.view') ? 'قيمة الفروق (تكلفة)' : 'قيمة الفروق (بيع)'} icon="coins" value={fmt.money(sum.value)} />
      </div>
      {draft ? (
        <div className="scan-box" style={{ marginBottom: 14 }}>
          <span className="scan-hint" style={{ color: 'var(--hero-ink2)' }}><span className="live" />القارئ جاهز: امسح أي منتج</span>
          {last ? <span key={last.at} className="flash" style={{ padding: '4px 10px', borderRadius: 8 }}>آخر مسح: <b>{last.name}</b> ← {fmt.qty(last.counted)}</span> : null}
          <span className="input-wrap grow"><Input value={manual} onChange={(e) => setManual(e.target.value)} placeholder="أو اكتب الباركود/SKU واضغط Enter" data-scan-target="clear" onKeyDown={(e) => { if (e.key === 'Enter') { void onCode(manual); setManual(''); } }} /></span>
        </div>
      ) : <Alert tone="success">هذا الجرد معتمد: الأرقام للعرض فقط.</Alert>}
      <DataTable rows={rows} columns={columns} rowKey={(l) => l.variant_id} loading={st.loading} dense
        toolbar={<div className="filters" style={{ width: '100%' }}>
          <SearchInput value={q} onChange={setQ} placeholder="ابحث في القائمة…" />
          <Segmented value={show} onChange={setShow} options={[{ value: 'all', label: 'الكل' }, { value: 'uncounted', label: 'لم يُعدّ' }, { value: 'counted', label: 'معدود' }, { value: 'diff', label: 'فروق' }]} />
        </div>}
        empty={{ icon: 'stocktake', title: 'لا شيء هنا' }} />
      <div style={{ height: 8 }} />
      <Button variant="ghost" icon="arrowRight" onClick={() => nav('/stocktakes')}>كل الجرد</Button>
    </>
  );
}
