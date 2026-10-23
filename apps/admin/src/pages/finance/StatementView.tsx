/** عرض كشف حساب: جدول لكل عملة برصيد افتتاحي وحركات ورصيد تراكمي */
import { Link } from 'react-router-dom';
import type { CurrencyCode } from '@raqeem/shared';
import { Card, EmptyState } from '../../ui';
import { useFmt } from '../../lib/settings';
import type { Statement } from '../sales/data/types';
import { useMoney } from '../sales/components/common';

const DOC_LINK = new Set(['sale', 'sale_return', 'purchase', 'purchase_return']);

export function StatementView({ st, kind }: { st: Statement; kind: 'customer' | 'supplier' | 'account' }) {
  const fmt = useFmt();
  const m = useMoney();
  const curs = (['IQD', 'USD'] as CurrencyCode[]).filter((c) => st.rows.some((r) => r.currency === c) || st.opening[c] || st.closing[c]);
  if (!curs.length) return <Card><EmptyState icon="fileText" title="لا حركات في هذه الفترة" /></Card>;
  // رصيد الصندوق يُعرض بإشارته (السالب = مكشوف)؛ للزبون والمورد القيمة المطلقة مع «عليه/له»
  const amt = (b: number) => (kind === 'account' ? b : Math.abs(b));
  const label = (b: number) => (kind === 'account' || !b ? '' : (kind === 'customer' ? b > 0 : b < 0) ? 'عليه' : 'له');
  return (
    <>
      {curs.map((c) => (
        <Card key={c} title={c === 'USD' ? 'بالدولار' : 'بالدينار'} icon={c === 'USD' ? 'coins' : 'cash'} flush>
          <div className="table-scroll">
            <table className="table">
              <thead><tr><th>التاريخ</th><th>المستند</th><th>البيان</th><th className="end">{kind === 'account' ? 'وارد' : 'مدين'}</th><th className="end">{kind === 'account' ? 'صادر' : 'دائن'}</th><th className="end">الرصيد</th></tr></thead>
              <tbody>
                <tr><td /><td /><td><b>رصيد افتتاحي</b></td><td /><td /><td className="end"><b>{m(amt(st.opening[c]), c)}</b> <span className="faint">{label(st.opening[c])}</span></td></tr>
                {st.rows.filter((r) => r.currency === c).map((r, i) => (
                  <tr key={`${r.doc_id}-${i}`}>
                    <td className="dim" style={{ whiteSpace: 'nowrap' }}>{fmt.date(r.at)}</td>
                    <td>{r.number ? (r.doc_id && DOC_LINK.has(r.doc_type) ? <Link to={`/invoices/${r.doc_id}`} className="ltr">{r.number}</Link> : <span className="ltr">{r.number}</span>) : '—'}</td>
                    <td>{r.description}</td>
                    <td className="end">{r.debit ? m(r.debit, c, true) : ''}</td>
                    <td className="end">{r.credit ? m(r.credit, c, true) : ''}</td>
                    <td className="end"><b>{m(amt(r.balance), c, true)}</b> <span className="faint">{label(r.balance)}</span></td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr><td colSpan={3}><b>الرصيد الختامي</b></td><td className="end">{m(st.rows.filter((r) => r.currency === c).reduce((s, r) => s + r.debit, 0), c, true)}</td><td className="end">{m(st.rows.filter((r) => r.currency === c).reduce((s, r) => s + r.credit, 0), c, true)}</td><td className="end"><b>{m(amt(st.closing[c]), c)}</b> <span className="faint">{label(st.closing[c])}</span></td></tr></tfoot>
            </table>
          </div>
        </Card>
      ))}
    </>
  );
}
