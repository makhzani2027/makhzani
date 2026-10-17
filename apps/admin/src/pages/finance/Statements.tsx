/** الكشوفات: زبون أو مورد أو صندوق/حساب + فترة ← رصيد تراكمي بالدينار والدولار، طباعة A4 وتصدير */
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button, EmptyState, ErrorState, Loading, PageHeader, Segmented, Select, Card } from '../../ui';
import { useLoad } from '../../lib/hooks';
import { useSettings } from '../../lib/settings';
import { downloadText, toCsv } from '../../lib/csv';
import { buildStatementA4, printDoc } from '../../print';
import { CustomerPicker, RangePicker, useRange } from '../sales/components/common';
import type { Statement } from '../sales/data/types';
import { accountStatement, listAccounts, listSuppliersLite, partyStatement } from './api';
import { StatementView } from './StatementView';
import '../sales/sales.css';

type Kind = 'customer' | 'supplier' | 'account';

export default function Statements() {
  const [sp] = useSearchParams();
  const { store } = useSettings();
  const [kind, setKind] = useState<Kind>((sp.get('kind') as Kind) ?? 'customer');
  const [party, setParty] = useState<{ id: string; name: string; phone: string | null } | null>(null);
  const [picking, setPicking] = useState(false);
  const r = useRange('year');
  const sups = useLoad(() => (kind === 'supplier' ? listSuppliersLite() : Promise.resolve([])), [kind]);
  const accs = useLoad(() => (kind === 'account' ? listAccounts(true) : Promise.resolve([])), [kind]);
  const st = useLoad<Statement | null>(() => {
    if (!party) return Promise.resolve(null);
    return kind === 'account' ? accountStatement(party.id, r.range) : partyStatement(kind, party.id, r.range);
  }, [kind, party?.id, r.range]);

  const print = () => st.data && party && printDoc(buildStatementA4({ party: { ...party, kind }, rows: st.data.rows, opening: st.data.opening, from: r.range?.from ?? null, to: r.range?.to ?? null, store }));
  const csv = () => st.data && party && downloadText(`statement-${party.name}.csv`, toCsv(st.data.rows, [
    { key: 'at', label: 'date', value: (x) => x.at }, { key: 'n', label: 'number', value: (x) => x.number }, { key: 'd', label: 'description', value: (x) => x.description },
    { key: 'c', label: 'currency', value: (x) => x.currency }, { key: 'dr', label: 'debit', value: (x) => x.debit }, { key: 'cr', label: 'credit', value: (x) => x.credit }, { key: 'b', label: 'balance', value: (x) => x.balance },
  ]));

  return (
    <>
      <PageHeader title="الكشوفات" description="كشف حساب لأي زبون أو مورد أو صندوق، لأي فترة، برصيد تراكمي."
        actions={party && st.data ? <><Button icon="download" onClick={csv}>تصدير</Button><Button variant="primary" icon="printer" onClick={() => void print()}>طباعة A4</Button></> : null} />
      <Card>
        <div className="sx-filters">
          <Segmented value={kind} onChange={(k) => { setKind(k); setParty(null); }} options={[{ value: 'customer', label: 'زبون' }, { value: 'supplier', label: 'مورد' }, { value: 'account', label: 'صندوق / حساب' }]} />
          {kind === 'customer' ? <Button icon="users" onClick={() => setPicking(true)}>{party?.name ?? 'اختر الزبون'}</Button> : null}
          {kind === 'supplier' ? <Select aria-label="المورد" value={party?.id ?? ''} onChange={(e) => { const s = sups.data?.find((x) => x.id === e.target.value); setParty(s ? { id: s.id, name: s.name, phone: s.phone } : null); }} placeholder="اختر المورد" options={(sups.data ?? []).map((s) => ({ value: s.id, label: s.name }))} /> : null}
          {kind === 'account' ? <Select aria-label="الحساب" value={party?.id ?? ''} onChange={(e) => { const a = accs.data?.find((x) => x.id === e.target.value); setParty(a ? { id: a.id, name: a.name, phone: null } : null); }} placeholder="اختر الحساب" options={(accs.data ?? []).map((a) => ({ value: a.id, label: a.name }))} /> : null}
          <RangePicker r={r} allowAll />
        </div>
      </Card>
      {!party ? <EmptyState icon="fileText" title="اختر الطرف أولاً" text="ثم الفترة، ويظهر الكشف مباشرة." /> : st.error ? <ErrorState message={st.error} onRetry={st.reload} /> : !st.data ? <Loading /> : <StatementView st={st.data} kind={kind} />}
      <CustomerPicker open={picking} allowCash={false} onClose={() => setPicking(false)} onPick={(c) => c && setParty({ id: c.id, name: c.name, phone: c.phone })} />
    </>
  );
}
