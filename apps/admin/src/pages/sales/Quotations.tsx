/** عروض الأسعار: قائمة بالحالة، ثم إنشاء/تعديل/طباعة/إرسال واتساب/تحويل لفاتورة */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { QUOTATION_STATUS, type QuotationStatus } from '@raqeem/shared';
import { Badge, Button, DataTable, PageHeader, SearchInput, Tabs, type Column } from '../../ui';
import { useDebounced, useLoad } from '../../lib/hooks';
import { useFmt } from '../../lib/settings';
import { listQuotations, type QuotationRow } from './api';
import { useMoney } from './components/common';
import './sales.css';

export default function Quotations() {
  const nav = useNavigate();
  const fmt = useFmt();
  const m = useMoney();
  const [tab, setTab] = useState<QuotationStatus | 'all'>('all');
  const [q, setQ] = useState('');
  const dq = useDebounced(q, 250);
  const list = useLoad(() => listQuotations(tab, dq), [tab, dq]);
  const today = new Date().toISOString().slice(0, 10);
  const cols: Column<QuotationRow>[] = [
    { key: 'n', header: 'الرقم', primary: true, cell: (x) => <b className="ltr">{x.number}</b> },
    { key: 'c', header: 'الزبون', cell: (x) => x.display_name },
    { key: 'd', header: 'التاريخ', hideOnMobile: true, cell: (x) => <span className="dim">{fmt.date(x.created_at)}</span> },
    { key: 'v', header: 'ساري حتى', hideOnMobile: true, cell: (x) => (x.valid_until ? <span className={x.valid_until < today && x.status !== 'converted' ? 'sx-neg' : 'dim'}>{fmt.date(`${x.valid_until}T12:00:00Z`)}</span> : '—') },
    { key: 'i', header: 'البنود', end: true, hideOnMobile: true, cell: (x) => fmt.num(x.items_count) },
    { key: 's', header: 'الحالة', cell: (x) => <Badge tone={QUOTATION_STATUS[x.status].tone}>{QUOTATION_STATUS[x.status].label}</Badge> },
    { key: 't', header: 'الإجمالي', end: true, cell: (x) => <b>{m(x.total, x.currency)}</b> },
  ];
  return (
    <>
      <PageHeader title="عروض الأسعار" description="عرض مكتوب للزبون قبل البيع، يتحول لفاتورة بضغطة." actions={<Button variant="primary" icon="plus" onClick={() => nav('/quotations/new')}>عرض سعر جديد</Button>} />
      <Tabs value={tab} onChange={setTab} items={[{ value: 'all' as const, label: 'الكل' }, ...(['draft', 'sent', 'accepted', 'converted', 'expired', 'cancelled'] as QuotationStatus[]).map((s) => ({ value: s, label: QUOTATION_STATUS[s].label }))]} />
      <DataTable rows={list.data} columns={cols} rowKey={(x) => x.id} loading={list.loading} error={list.error} onRetry={list.reload} onRowClick={(x) => nav(`/quotations/${x.id}`)}
        toolbar={<div className="sx-filters"><div className="grow"><SearchInput value={q} onChange={setQ} placeholder="رقم العرض أو اسم الزبون…" /></div></div>}
        empty={q ? { icon: 'search', title: 'لا نتائج' } : { icon: 'fileText', title: 'لا عروض أسعار', text: 'جهّز عرضاً للزبون وأرسله واتساب أو اطبعه.', action: <Button variant="primary" onClick={() => nav('/quotations/new')}>عرض سعر جديد</Button> }} />
    </>
  );
}
