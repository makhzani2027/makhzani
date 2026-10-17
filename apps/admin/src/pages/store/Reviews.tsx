/** التقييمات: ما كتبه الزبائن عن المنتجات، مع إخفاء/إظهار */
import { useState } from 'react';
import { Badge, Button, DataTable, PageHeader, Segmented, Stat, type Column } from '../../ui';
import { useAction, useLoad } from '../../lib/hooks';
import { useFmt } from '../../lib/settings';
import { listReviews, setReviewVisible, type ReviewRow } from './api';
import '../sales/sales.css';

export default function Reviews() {
  const fmt = useFmt();
  const list = useLoad(listReviews, []);
  const [f, setF] = useState<'all' | 'low' | 'hidden'>('all');
  const toggle = useAction(async (r: ReviewRow) => { await setReviewVisible(r.id, !r.is_visible); await list.reload(); }, { success: 'حُدّث التقييم' });
  const rows = list.data?.filter((r) => f === 'all' || (f === 'low' ? r.rating <= 2 : !r.is_visible));
  const avg = list.data?.length ? list.data.reduce((s, r) => s + r.rating, 0) / list.data.length : 0;
  const cols: Column<ReviewRow>[] = [
    { key: 'p', header: 'المنتج', primary: true, cell: (r) => <b>{r.product_name}</b> },
    { key: 'r', header: 'التقييم', cell: (r) => <span className="stars" aria-label={`${r.rating} من ٥`}>{'★'.repeat(r.rating)}<span className="faint">{'★'.repeat(5 - r.rating)}</span></span> },
    { key: 'c', header: 'التعليق', cell: (r) => <span className={r.is_visible ? '' : 'faint'}>{r.comment ?? '—'}</span> },
    { key: 'u', header: 'الزبون', hideOnMobile: true, cell: (r) => <span className="dim">{r.customer_name ?? '—'} · {fmt.ago(r.created_at)}</span> },
    { key: 'v', header: '', shrink: true, cell: (r) => <span className="sx-row" style={{ flexWrap: 'nowrap' }}>{!r.is_visible ? <Badge tone="neutral">مخفي</Badge> : null}<Button size="sm" loading={toggle.busy} onClick={() => void toggle.run(r)}>{r.is_visible ? 'إخفاء' : 'إظهار'}</Button></span> },
  ];
  return (
    <>
      <PageHeader title="التقييمات" description="آراء الزبائن في المنتجات. أخفِ المسيء أو غير المناسب." />
      <div className="sx-stats">
        <Stat label="متوسط التقييم" icon="star" value={fmt.num(Math.round(avg * 10) / 10)} unit="/ ٥" />
        <Stat label="عدد التقييمات" icon="chat" value={fmt.num(list.data?.length ?? 0)} foot={`${fmt.num((list.data ?? []).filter((r) => !r.is_visible).length)} مخفي`} />
      </div>
      <DataTable rows={rows} columns={cols} rowKey={(r) => r.id} loading={list.loading} error={list.error} onRetry={list.reload}
        toolbar={<div className="sx-filters"><Segmented value={f} onChange={setF} options={[{ value: 'all', label: 'الكل' }, { value: 'low', label: 'نجمة أو نجمتان' }, { value: 'hidden', label: 'المخفية' }]} /></div>}
        empty={{ icon: 'star', title: 'لا تقييمات هنا' }} />
    </>
  );
}
