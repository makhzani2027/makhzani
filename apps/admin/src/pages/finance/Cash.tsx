/** الصندوق: جلسة الموظف الحالية (فتح/إغلاق بعدّ الدرج) وسجل الجلسات بالفروقات */
import { Alert, Badge, Button, Card, DataTable, Field, Modal, MoneyInput, PageHeader, Stat, Textarea, type Column } from '../../ui';
import { useState } from 'react';
import { useAuth } from '../../lib/auth';
import { useAction, useLoad } from '../../lib/hooks';
import { useFmt } from '../../lib/settings';
import { closeCashSession, mySession, openCashSession } from '../sales/api';
import { RangePicker, useMoney, useRange } from '../sales/components/common';
import { listCashSessions, type SessionRow } from './api';
import '../sales/sales.css';

export default function Cash() {
  const fmt = useFmt();
  const m = useMoney();
  const { profile } = useAuth();
  const r = useRange('30d');
  const mine = useLoad(() => mySession(profile?.id ?? ''), [profile?.id]);
  const list = useLoad(() => listCashSessions(r.range), [r.range]);
  const [openM, setOpenM] = useState(false);
  const [closeM, setCloseM] = useState(false);
  const [amount, setAmount] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const current = (list.data ?? []).find((s) => s.id === mine.data?.id);
  const reload = () => { void mine.reload(); void list.reload(); };
  const doOpen = useAction(async () => openCashSession(amount ?? 0), { success: 'فُتحت جلسة الصندوق' });
  const doClose = useAction(async () => closeCashSession(amount ?? 0, note || null), { success: 'أُغلقت الجلسة' });
  const cols: Column<SessionRow>[] = [
    { key: 'u', header: 'الموظف', primary: true, cell: (s) => <div><b>{s.opened_by_name ?? '—'}</b><div className="small faint">{fmt.date(s.opened_at, true)}</div></div> },
    { key: 's', header: 'الحالة', cell: (s) => <Badge tone={s.status === 'open' ? 'success' : 'neutral'}>{s.status === 'open' ? 'مفتوحة' : 'مغلقة'}</Badge> },
    { key: 'f', header: 'الافتتاحي', end: true, hideOnMobile: true, cell: (s) => m(s.opening_float) },
    { key: 'e', header: 'المتوقع', end: true, cell: (s) => (s.expected !== null ? m(s.expected) : '—') },
    { key: 'c', header: 'المعدود', end: true, cell: (s) => (s.counted_cash !== null ? m(s.counted_cash) : '—') },
    { key: 'd', header: 'الفرق', end: true, cell: (s) => (s.difference === null ? '—' : <b className={s.difference < 0 ? 'sx-neg' : s.difference > 0 ? 'sx-pos' : 'faint'}>{s.difference > 0 ? '+' : ''}{m(s.difference)}</b>) },
    { key: 'cl', header: 'الإغلاق', hideOnMobile: true, cell: (s) => <span className="dim">{s.closed_at ? fmt.date(s.closed_at, true) : '—'}{s.note ? ` · ${s.note}` : ''}</span> },
  ];
  return (
    <>
      <PageHeader title="الصندوق" description="افتح الجلسة بمبلغ الدرج، وأغلقها بعدّه — والفرق يظهر فوراً." />
      <Card title="جلستي" icon="cash">
        {mine.loading && !mine.data ? null : mine.data ? (
          <div className="stack">
            <div className="sx-stats" style={{ marginBottom: 0 }}>
              <Stat label="مفتوحة منذ" icon="clock" value={fmt.ago(mine.data.opened_at)} foot={fmt.date(mine.data.opened_at, true)} />
              <Stat label="الافتتاحي" icon="cash" value={m(mine.data.opening_float)} />
              {current?.cash_in !== null && current ? <Stat label="نقد داخل" icon="arrowDown" value={m(current.cash_in)} foot={`خارج ${m((current.cash_out ?? 0) + (current.expenses ?? 0))}`} /> : null}
              {current?.expected !== null && current ? <Stat tone="hero" label="المتوقع في الدرج" icon="wallet" value={m(current.expected)} /> : null}
            </div>
            <div><Button variant="primary" icon="lock" onClick={() => { setAmount(null); setNote(''); setCloseM(true); }}>إغلاق الجلسة</Button></div>
          </div>
        ) : (
          <div className="sx-between"><span className="sx-muted">لا جلسة مفتوحة لك الآن.</span><Button variant="primary" icon="unlock" onClick={() => { setAmount(0); setOpenM(true); }}>فتح جلسة</Button></div>
        )}
      </Card>
      <DataTable rows={list.data} columns={cols} rowKey={(s) => s.id} loading={list.loading} error={list.error} onRetry={list.reload}
        toolbar={<div className="sx-filters"><RangePicker r={r} allowAll /></div>} empty={{ icon: 'cash', title: 'لا جلسات في هذه الفترة' }} />
      <Modal open={openM} onClose={() => setOpenM(false)} title="فتح جلسة الصندوق" width={420}
        footer={<><Button onClick={() => setOpenM(false)}>إلغاء</Button><Button variant="primary" loading={doOpen.busy} onClick={async () => { if (await doOpen.run()) { setOpenM(false); reload(); } }}>فتح الجلسة</Button></>}>
        <Field label="المبلغ الموجود في الدرج الآن"><MoneyInput autoFocus value={amount} onChange={setAmount} /></Field>
      </Modal>
      <Modal open={closeM} onClose={() => setCloseM(false)} title="إغلاق الجلسة" subtitle="عدّ النقد في الدرج واكتب المبلغ" width={460}
        footer={<><Button onClick={() => setCloseM(false)}>إلغاء</Button><Button variant="primary" loading={doClose.busy} disabled={amount === null} onClick={async () => { if (await doClose.run()) { setCloseM(false); reload(); } }}>إغلاق الجلسة</Button></>}>
        <div className="stack">
          <Field label="المعدود فعلاً"><MoneyInput autoFocus value={amount} onChange={setAmount} /></Field>
          {current?.expected !== null && current && amount !== null ? <Alert tone={amount - current.expected! === 0 ? 'success' : 'warning'}>المتوقع {m(current.expected)} — الفرق {m(amount - current.expected!)}</Alert> : null}
          <Field label="ملاحظة"><Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="سبب الفرق إن وجد" /></Field>
        </div>
      </Modal>
    </>
  );
}
