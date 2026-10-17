/** سجل العمليات: من فعل ماذا ومتى، مع عرض الفرق (قبل/بعد) */
import { useState } from 'react';
import { Badge, DataTable, Drawer, PageHeader, Pagination, SearchInput, Select, type Column } from '../../ui';
import { useDebounced, useLoad } from '../../lib/hooks';
import { useFmt } from '../../lib/settings';
import { listAudit, type AuditRow } from './api';
import '../sales/sales.css';

const ENTITY: Record<string, string> = {
  invoices: 'الفواتير', payments: 'الدفعات', orders: 'الطلبات', products: 'المنتجات', product_variants: 'نسخ المنتجات', customers: 'الزبائن', expenses: 'المصروفات',
  money_accounts: 'الحسابات', account_transfers: 'التحويلات', app_settings: 'الإعدادات', staff_roles: 'الأدوار', profiles: 'الموظفون', coupons: 'الكوبونات', banners: 'البانرات',
  home_sections: 'أقسام الرئيسية', delivery_zones: 'مناطق التوصيل', notification_campaigns: 'الإشعارات', stock_movements: 'حركة المخزون', quotations: 'عروض الأسعار', cash_sessions: 'الصندوق',
};
const ACTION: Record<string, { label: string; tone: 'success' | 'info' | 'danger' | 'warning' | 'neutral' }> = {
  insert: { label: 'إضافة', tone: 'success' }, update: { label: 'تعديل', tone: 'info' }, delete: { label: 'حذف', tone: 'danger' }, void: { label: 'إلغاء', tone: 'danger' },
};

export default function Audit() {
  const fmt = useFmt();
  const [entity, setEntity] = useState('');
  const [q, setQ] = useState('');
  const dq = useDebounced(q, 300);
  const [page, setPage] = useState(1);
  const [sel, setSel] = useState<AuditRow | null>(null);
  const list = useLoad(() => listAudit({ entity, q: dq, page, pageSize: 40 }), [entity, dq, page]);
  const cols: Column<AuditRow>[] = [
    { key: 't', header: 'الوقت', cell: (a) => <span className="dim" style={{ whiteSpace: 'nowrap' }}>{fmt.date(a.created_at, true)}</span> },
    { key: 'u', header: 'الموظف', primary: true, cell: (a) => a.actor_name ?? <span className="faint">النظام</span> },
    { key: 'a', header: 'العملية', cell: (a) => { const x = ACTION[a.action] ?? { label: a.action, tone: 'neutral' as const }; return <Badge tone={x.tone}>{x.label}</Badge>; } },
    { key: 'e', header: 'على', cell: (a) => ENTITY[a.entity] ?? a.entity },
    { key: 'd', header: 'التفاصيل', hideOnMobile: true, cell: (a) => <span className="dim truncate" style={{ display: 'block', maxWidth: 380 }}>{summary(a.data)}</span> },
  ];
  return (
    <>
      <PageHeader title="سجل العمليات" description="كل تعديل مهم في النظام: من، ماذا، ومتى." />
      <DataTable rows={list.data?.rows} columns={cols} rowKey={(a) => String(a.id)} loading={list.loading} error={list.error} onRetry={list.reload} onRowClick={setSel}
        toolbar={<div className="sx-filters"><div className="grow"><SearchInput value={q} onChange={(v) => { setQ(v); setPage(1); }} placeholder="بحث في العملية أو المعرّف…" /></div><Select aria-label="الجدول" value={entity} onChange={(e) => { setEntity(e.target.value); setPage(1); }} placeholder="كل الأقسام" options={(list.data?.entities ?? []).map((x) => ({ value: x, label: ENTITY[x] ?? x }))} /></div>}
        footer={<Pagination page={page} pageSize={40} total={list.data?.total ?? 0} onPage={setPage} />}
        empty={{ icon: 'history', title: 'لا عمليات مسجّلة' }} />
      {sel ? (
        <Drawer open onClose={() => setSel(null)} title={`${ACTION[sel.action]?.label ?? sel.action} — ${ENTITY[sel.entity] ?? sel.entity}`} width={560}>
          <div className="stack">
            <dl className="kv"><dt>الوقت</dt><dd>{fmt.date(sel.created_at, true)}</dd><dt>الموظف</dt><dd>{sel.actor_name ?? 'النظام'}</dd>{sel.entity_id ? <><dt>المعرّف</dt><dd className="ltr" style={{ textAlign: 'start' }}>{sel.entity_id}</dd></> : null}</dl>
            <Diff data={sel.data} />
          </div>
        </Drawer>
      ) : null}
    </>
  );
}

function summary(d: Record<string, unknown>): string {
  if (typeof d.label === 'string') return d.label;
  if (typeof d.number === 'string') return `${d.number}${d.reason ? ` — ${String(d.reason)}` : ''}`;
  const n = (d.new ?? d) as Record<string, unknown>;
  return Object.entries(n).slice(0, 3).map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`).join(' · ');
}

const show = (v: unknown) => (v === null || v === undefined ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v));

/** يعرض الفرق: data.old / data.new (من مشغّل السجل) أو الحقول كما هي */
function Diff({ data }: { data: Record<string, unknown> }) {
  const old = (data.old ?? {}) as Record<string, unknown>;
  const neu = (data.new ?? (data.old ? {} : data)) as Record<string, unknown>;
  const keys = [...new Set([...Object.keys(old), ...Object.keys(neu)])].filter((k) => k !== 'updated_at');
  if (!keys.length) return <p className="sx-muted">لا تفاصيل.</p>;
  return (
    <table className="diff">
      <thead><tr><th>الحقل</th>{data.old ? <th>قبل</th> : null}<th>{data.old ? 'بعد' : 'القيمة'}</th></tr></thead>
      <tbody>
        {keys.map((k) => {
          const changed = data.old && show(old[k]) !== show(neu[k]);
          return <tr key={k}><td><b className="ltr">{k}</b></td>{data.old ? <td className={changed ? 'old' : ''}>{show(old[k])}</td> : null}<td className={changed ? 'new' : ''}>{show(neu[k])}</td></tr>;
        })}
      </tbody>
    </table>
  );
}
