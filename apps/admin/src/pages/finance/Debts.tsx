/** الديون: من عليه دين، أعمار الذمم (٠–٣٠، ٣١–٦٠، ٦١–٩٠، أقدم)، تذكير واتساب، سند قبض */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatPhone, nouns, whatsappLink } from '@raqeem/shared';
import { Button, DataTable, IconButton, PageHeader, SearchInput, Stat, type Column } from '../../ui';
import { useAuth } from '../../lib/auth';
import { useLoad } from '../../lib/hooks';
import { useFmt, useSettings } from '../../lib/settings';
import { downloadText, toCsv } from '../../lib/csv';
import { listDebts, type DebtRow } from './api';
import { VoucherModal, useMoney } from '../sales/components/common';
import '../sales/sales.css';

export default function Debts() {
  const nav = useNavigate();
  const fmt = useFmt();
  const m = useMoney();
  const { store } = useSettings();
  const { can } = useAuth();
  const list = useLoad(listDebts, []);
  const [q, setQ] = useState('');
  const [pay, setPay] = useState<DebtRow | null>(null);
  const rows = list.data?.filter((d) => !q || d.customer.name.includes(q.trim()) || (d.customer.phone ?? '').includes(q.replace(/\D/g, '').replace(/^0/, '')));
  const tot = (list.data ?? []).reduce((a, d) => ({ iqd: a.iqd + d.balance, usd: a.usd + d.balance_usd, d30: a.d30 + d.aging.d30, d60: a.d60 + d.aging.d60, d90: a.d90 + d.aging.d90, older: a.older + d.aging.older }), { iqd: 0, usd: 0, d30: 0, d60: 0, d90: 0, older: 0 });
  const remind = (d: DebtRow) => whatsappLink(d.customer.phone, `مرحباً ${d.customer.name}،\nنذكّركم بأن رصيد حسابكم لدى ${store.name}: ${m(d.balance)}${d.balance_usd > 0 ? ` و${m(d.balance_usd, 'USD')}` : ''}.\nنسعد بتسديده في أقرب وقت. شكراً لكم.`);
  const bar = (d: DebtRow) => {
    const all = d.aging.d30 + d.aging.d60 + d.aging.d90 + d.aging.older || 1;
    return <span className="aging" title={`٠–٣٠: ${m(d.aging.d30)} · ٣١–٦٠: ${m(d.aging.d60)} · ٦١–٩٠: ${m(d.aging.d90)} · أقدم: ${m(d.aging.older)}`}>{[d.aging.d30, d.aging.d60, d.aging.d90, d.aging.older].map((v, i) => <span key={i} style={{ width: `${(v / all) * 100}%` }} />)}</span>;
  };
  const cols: Column<DebtRow>[] = [
    { key: 'n', header: 'الزبون', primary: true, cell: (d) => <div><b>{d.customer.name}</b><div className="small faint ltr" style={{ textAlign: 'start' }}>{d.customer.phone ? formatPhone(d.customer.phone) : ''}</div></div> },
    { key: 'b', header: 'بالدينار', end: true, cell: (d) => <b className={d.balance > 0 ? 'sx-neg' : 'faint'}>{m(d.balance)}</b> },
    { key: 'u', header: 'بالدولار', end: true, hideOnMobile: true, cell: (d) => (d.balance_usd > 0 ? <b className="sx-neg">{m(d.balance_usd, 'USD')}</b> : <span className="faint">—</span>) },
    { key: 'a', header: 'العمر', hideOnMobile: true, cell: bar },
    { key: 'o', header: 'أقدم فاتورة', hideOnMobile: true, cell: (d) => <span className="dim">{d.oldest_at ? fmt.ago(d.oldest_at) : '—'}</span> },
    { key: 'x', header: '', shrink: true, cell: (d) => (
      <span className="sx-row" style={{ flexWrap: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
        {remind(d) ? <IconButton icon="whatsapp" label="تذكير واتساب" onClick={() => window.open(remind(d)!, '_blank', 'noopener')} /> : null}
        {can('finance.manage') ? <Button size="sm" onClick={() => setPay(d)}>قبض</Button> : null}
      </span>
    ) },
  ];
  return (
    <>
      <PageHeader title="الديون" description="ما لك عند الزبائن، مرتباً من الأكبر، مع عمر كل دين."
        actions={<Button icon="download" onClick={() => downloadText('debts.csv', toCsv(list.data ?? [], [
          { key: 'n', label: 'customer', value: (d) => d.customer.name }, { key: 'p', label: 'phone', value: (d) => d.customer.phone }, { key: 'b', label: 'balance_iqd', value: (d) => d.balance }, { key: 'u', label: 'balance_usd', value: (d) => d.balance_usd },
          { key: 'a', label: 'd0_30', value: (d) => Math.round(d.aging.d30) }, { key: 'b2', label: 'd31_60', value: (d) => Math.round(d.aging.d60) }, { key: 'c', label: 'd61_90', value: (d) => Math.round(d.aging.d90) }, { key: 'd', label: 'older', value: (d) => Math.round(d.aging.older) },
        ]))}>تصدير</Button>} />
      <div className="sx-stats">
        <Stat tone="hero" label="مجموع الديون (دينار)" icon="debt" value={m(tot.iqd)} foot={fmt.count(list.data?.length ?? 0, nouns.customer)} />
        {tot.usd ? <Stat label="بالدولار" icon="coins" value={m(tot.usd, 'USD')} /> : null}
        <Stat label="خلال ٣٠ يوماً" icon="clock" value={m(tot.d30)} />
        <Stat label="أقدم من ٦٠ يوماً" icon="alert" value={m(tot.d90 + tot.older)} foot={<span className="sx-legend"><span><i style={{ background: 'var(--c3)' }} />٠–٣٠</span><span><i style={{ background: 'var(--c4)' }} />٣١–٦٠</span><span><i style={{ background: 'var(--c1)' }} />٦١–٩٠</span><span><i style={{ background: 'var(--danger)' }} />أقدم</span></span>} />
      </div>
      <DataTable rows={rows} columns={cols} rowKey={(d) => d.customer.id} loading={list.loading} error={list.error} onRetry={list.reload} onRowClick={(d) => nav(`/customers/${d.customer.id}`)}
        toolbar={<div className="sx-filters"><div className="grow"><SearchInput value={q} onChange={setQ} placeholder="اسم الزبون أو هاتفه…" /></div></div>}
        empty={{ icon: 'checkCircle', title: 'لا ديون', text: 'كل الزبائن مسددون. البيع بالآجل يظهر هنا.' }} />
      <VoucherModal open={!!pay} onClose={() => setPay(null)} preset={pay ? { direction: 'in', customer: pay.customer } : undefined} onDone={() => void list.reload()} />
    </>
  );
}
