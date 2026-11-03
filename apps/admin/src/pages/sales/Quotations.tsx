/** عروض الأسعار: قائمة بالحالة، ثم إنشاء/تعديل/طباعة/إرسال واتساب/تحويل لفاتورة */
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { QUOTATION_STATUS, countOf, isoDay, nouns, type QuotationStatus } from '@raqeem/shared';
import { Alert, Badge, Button, DataTable, PageHeader, SearchInput, Tabs, type Column } from '../../ui';
import { useAuth } from '../../lib/auth';
import { useDebounced, useLoad } from '../../lib/hooks';
import { useFmt, useSettings } from '../../lib/settings';
import { listQuotations, type QuotationRow } from './api';
import { useMoney } from './components/common';
import { clearDraft, draftIds, draftKey, readDraft } from './quoteDraft';
import './sales.css';

export default function Quotations() {
  const nav = useNavigate();
  const fmt = useFmt();
  const m = useMoney();
  const [tab, setTab] = useState<QuotationStatus | 'all'>('all');
  const [q, setQ] = useState('');
  const dq = useDebounced(q, 250);
  const list = useLoad(() => listQuotations(tab, dq), [tab, dq]);
  const { profile } = useAuth();
  const { store } = useSettings();
  // مسودة عرض جديد لم يُحفظ بعد: تظهر هنا ليكمله الموظف بعد عودته من قسم آخر
  const newKey = draftKey(profile?.id, null);
  const [pending, setPending] = useState(() => readDraft(newKey, 'new'));
  const [edited] = useState(() => draftIds(profile?.id));
  const today = isoDay(); // يوم بغداد (لا UTC) مثل QuotationForm
  const cols: Column<QuotationRow>[] = [
    { key: 'n', header: 'الرقم', primary: true, cell: (x) => <span><b className="ltr">{x.number}</b>{edited.has(x.id) ? <> <Badge tone="warning">تعديلات غير محفوظة</Badge></> : null}</span> },
    { key: 'c', header: 'الزبون', cell: (x) => <span>{x.display_name}{x.title ? <div className="small dim">{x.title}</div> : null}</span> },
    { key: 'd', header: 'التاريخ', hideOnMobile: true, cell: (x) => <span className="dim">{fmt.date(x.created_at)}</span> },
    { key: 'v', header: 'ساري حتى', hideOnMobile: true, cell: (x) => (x.valid_until ? <span className={x.valid_until < today && x.status !== 'converted' ? 'sx-neg' : 'dim'}>{fmt.date(`${x.valid_until}T12:00:00Z`)}</span> : '—') },
    { key: 'i', header: 'البنود', end: true, hideOnMobile: true, cell: (x) => fmt.num(x.items_count) },
    { key: 's', header: 'الحالة', cell: (x) => <Badge tone={QUOTATION_STATUS[x.status].tone}>{QUOTATION_STATUS[x.status].label}</Badge> },
    { key: 't', header: 'الإجمالي', end: true, cell: (x) => <b>{m(x.total, x.currency)}</b> },
  ];
  return (
    <>
      <PageHeader title="عروض الأسعار" description="عرض مكتوب للزبون قبل البيع، يتحول لفاتورة بضغطة." actions={<Button variant="primary" icon="plus" onClick={() => nav('/quotations/new')}>عرض سعر جديد</Button>} />
      {pending ? (
        <Alert tone="info">
          <span className="row" style={{ gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
            <span className="grow">لديك عرض سعر غير محفوظ{(pending.customer as { name?: string } | null)?.name || pending.freeName.trim() ? <> للزبون <b>{(pending.customer as { name?: string } | null)?.name || pending.freeName.trim()}</b></> : null}{pending.lines.length ? <> ({countOf(pending.lines.length, nouns.line, store.digits)})</> : null}، آخر تعديل {fmt.date(pending.at, true)}.</span>
            <Button size="sm" variant="primary" icon="edit" onClick={() => nav('/quotations/new')}>أكمل العرض</Button>
            <Button size="sm" variant="ghost" icon="trash" onClick={() => { clearDraft(newKey); setPending(null); }}>تجاهل</Button>
          </span>
        </Alert>
      ) : null}
      <Tabs value={tab} onChange={setTab} items={[{ value: 'all' as const, label: 'الكل' }, ...(['draft', 'sent', 'accepted', 'converted', 'expired', 'cancelled'] as QuotationStatus[]).map((s) => ({ value: s, label: QUOTATION_STATUS[s].label }))]} />
      <DataTable rows={list.data} columns={cols} rowKey={(x) => x.id} loading={list.loading} error={list.error} onRetry={list.reload} onRowClick={(x) => nav(`/quotations/${x.id}`)}
        toolbar={<div className="sx-filters"><div className="grow"><SearchInput value={q} onChange={setQ} placeholder="رقم العرض أو اسم الزبون أو عنوان العرض…" /></div></div>}
        empty={q ? { icon: 'search', title: 'لا نتائج' } : { icon: 'fileText', title: 'لا عروض أسعار', text: 'جهّز عرضاً للزبون وأرسله واتساب أو اطبعه.', action: <Button variant="primary" onClick={() => nav('/quotations/new')}>عرض سعر جديد</Button> }} />
    </>
  );
}
