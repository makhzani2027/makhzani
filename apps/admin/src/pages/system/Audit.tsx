/** سجل العمليات: من فعل ماذا ومتى، مع عرض الفرق (قبل/بعد) */
import { useState } from 'react';
import { BANNER_LINK_KIND, COUPON_KIND, HOME_SECTION_KIND, MONEY_ACCOUNT_KIND, governorateName } from '@raqeem/shared';
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
  send: { label: 'إرسال', tone: 'info' }, transfer: { label: 'تحويل', tone: 'info' }, 'staff.create': { label: 'إضافة', tone: 'success' }, 'staff.set_role': { label: 'تغيير الدور', tone: 'info' },
  'staff.disable': { label: 'إيقاف', tone: 'danger' }, 'staff.enable': { label: 'تفعيل', tone: 'success' }, 'staff.reset_password': { label: 'كلمة مرور جديدة', tone: 'warning' },
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
    { key: 'd', header: 'التفاصيل', hideOnMobile: true, cell: (a) => <span className="dim truncate" style={{ display: 'block', maxWidth: 380 }}>{summary(a.entity, a.data, fmt)}</span> },
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
            <Diff entity={sel.entity} data={sel.data} fmt={fmt} />
          </div>
        </Drawer>
      ) : null}
    </>
  );
}

type Fmt = ReturnType<typeof useFmt>;

/** أسماء الحقول بالعربية (ما لا يوجد هنا يُعرض باسمه كما هو) */
const FIELD: Record<string, string> = {
  name: 'الاسم', title: 'العنوان', subtitle: 'الوصف', body: 'النص', code: 'الرمز', kind: 'النوع', value: 'القيمة', status: 'الحالة', phone: 'الهاتف', email: 'البريد',
  price: 'السعر', compare_at_price: 'السعر قبل الخصم', wholesale_price: 'سعر الجملة', cost: 'التكلفة', credit_limit: 'حد الدين', amount: 'المبلغ', total: 'الإجمالي',
  free_delivery_over: 'توصيل مجاني فوق', min_subtotal: 'أقل مبلغ للطلب', max_discount: 'أقصى خصم', usage_limit: 'حد الاستعمال', per_customer_limit: 'حد كل زبون', used_count: 'مرات الاستعمال',
  starts_at: 'يبدأ', ends_at: 'ينتهي', is_active: 'مفعّل', sort: 'الترتيب', placement: 'المكان', link_kind: 'نوع الرابط', link_value: 'الرابط', image_key: 'الصورة',
  permissions: 'الصلاحيات', description: 'الوصف', role_id: 'الدور', category: 'البند', number: 'الرقم', reason: 'السبب', return_of: 'مرتجع من', recipients: 'المستلمون',
  governorate: 'المحافظة', fee: 'الأجرة', eta_text: 'مدة التوصيل', max_items: 'أقصى عدد', category_id: 'القسم', brand_id: 'العلامة', product_ids: 'المنتجات',
};
const MONEY = new Set(['price', 'compare_at_price', 'wholesale_price', 'cost', 'credit_limit', 'amount', 'total', 'free_delivery_over', 'min_subtotal', 'max_discount', 'fee']);
const PLACEMENT: Record<string, string> = { home_hero: 'أعلى الرئيسية', home_strip: 'شريط وسط الرئيسية', category_top: 'أعلى صفحة القسم' };
const STATUS: Record<string, string> = { active: 'نشط', blocked: 'موقوف' };
const KIND: Record<string, Record<string, { label: string }>> = { coupons: COUPON_KIND, home_sections: HOME_SECTION_KIND, money_accounts: MONEY_ACCOUNT_KIND };
const PERMS = { one: 'صلاحية واحدة', two: 'صلاحيتان', few: 'صلاحيات', many: 'صلاحية' };
const RECIPIENTS = { one: 'زبون واحد', two: 'زبونان', few: 'زبائن', many: 'زبوناً', zero: 'لا أحد' };

const fieldName = (k: string) => FIELD[k] ?? k;

/** قيمة حقل للعرض: أسماء الأنواع بالعربية، المبالغ بالعملة، والتواريخ والصح/الخطأ مقروءة */
function show(entity: string, k: string, v: unknown, row: Record<string, unknown>, fmt: Fmt): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'نعم' : 'لا';
  if (k === 'permissions') return fmt.count(Array.isArray(v) ? v.length : Number(v), PERMS);
  if (k === 'recipients' && typeof v === 'number') return fmt.count(v, RECIPIENTS);
  if (Array.isArray(v)) return fmt.num(v.length);
  if (typeof v === 'object') return JSON.stringify(v);
  if (typeof v === 'string') {
    if (k === 'kind') return KIND[entity]?.[v]?.label ?? v;
    if (k === 'link_kind') return BANNER_LINK_KIND[v as keyof typeof BANNER_LINK_KIND]?.label ?? v;
    if (k === 'placement') return PLACEMENT[v] ?? v;
    if (k === 'status') return STATUS[v] ?? v;
    if (k === 'governorate') return governorateName(v) || v;
    if (/_at$/.test(k) && !Number.isNaN(Date.parse(v))) return fmt.date(v, true);
    return v;
  }
  if (typeof v === 'number') {
    if (entity === 'coupons' && k === 'value') return row.kind === 'percent' ? `${fmt.num(v)}٪` : fmt.money(v);
    return MONEY.has(k) ? fmt.money(v) : fmt.num(v);
  }
  return String(v);
}

function summary(entity: string, d: Record<string, unknown>, fmt: Fmt): string {
  if (typeof d.label === 'string') return d.label;
  if (typeof d.number === 'string') return `${d.number}${d.reason ? ` — ${String(d.reason)}` : ''}`;
  const n = (d.new ?? d) as Record<string, unknown>;
  return Object.entries(n).filter(([, v]) => v !== null && v !== undefined && v !== '').slice(0, 3).map(([k, v]) => `${fieldName(k)}: ${show(entity, k, v, n, fmt)}`).join(' · ');
}

/** يعرض الفرق: data.old / data.new (من مشغّل السجل) أو الحقول كما هي */
function Diff({ entity, data, fmt }: { entity: string; data: Record<string, unknown>; fmt: Fmt }) {
  const old = (data.old ?? {}) as Record<string, unknown>;
  const neu = (data.new ?? (data.old ? {} : data)) as Record<string, unknown>;
  const keys = [...new Set([...Object.keys(old), ...Object.keys(neu)])].filter((k) => k !== 'updated_at');
  if (!keys.length) return <p className="sx-muted">لا تفاصيل.</p>;
  return (
    <table className="diff">
      <thead><tr><th>الحقل</th>{data.old ? <th>قبل</th> : null}<th>{data.old ? 'بعد' : 'القيمة'}</th></tr></thead>
      <tbody>
        {keys.map((k) => {
          const a = show(entity, k, old[k], old, fmt);
          const b = show(entity, k, neu[k], neu, fmt);
          const changed = data.old && a !== b;
          return <tr key={k}><td><b className={FIELD[k] ? '' : 'ltr'}>{fieldName(k)}</b></td>{data.old ? <td className={changed ? 'old' : ''}>{a}</td> : null}<td className={changed ? 'new' : ''}>{b}</td></tr>;
        })}
      </tbody>
    </table>
  );
}
