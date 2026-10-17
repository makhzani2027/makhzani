/** كشف حساب A4 لزبون أو مورد: الحركات بالترتيب مع الرصيد التراكمي */
import type { StoreSettings } from '@raqeem/shared';
import type { StatementRow } from '../pages/sales/data/types';
import { a4Css, a4Header, code, escapeHtml, formatPhoneSafe, printFmt, type PrintDoc } from './common';

export function buildStatementA4(o: {
  party: { name: string; phone: string | null; kind: 'customer' | 'supplier' };
  rows: StatementRow[]; from: string | null; to: string | null; store: StoreSettings;
}): PrintDoc {
  const f = printFmt(o.store);
  const debit = o.rows.reduce((s, r) => s + r.debit, 0);
  const credit = o.rows.reduce((s, r) => s + r.credit, 0);
  const closing = o.rows.length ? o.rows[o.rows.length - 1].balance : 0;
  const balLabel = (b: number) => (b > 0 ? (o.party.kind === 'customer' ? 'عليه' : 'له') : b < 0 ? (o.party.kind === 'customer' ? 'له' : 'عليه') : '');
  const body = o.rows
    .map((r) => `<tr>
  <td class="e">${f.dateShort(r.at)}</td>
  <td>${r.number ? code(r.number) : '—'}</td>
  <td>${escapeHtml(r.description)}</td>
  <td class="e">${r.debit ? f.money(r.debit, true) : ''}</td>
  <td class="e">${r.credit ? f.money(r.credit, true) : ''}</td>
  <td class="e"><b>${f.money(Math.abs(r.balance), true)}</b> <span class="muted">${balLabel(r.balance)}</span></td>
</tr>`)
    .join('');
  const period = o.from || o.to ? `الفترة: ${o.from ? f.date(o.from) : 'البداية'} — ${o.to ? f.date(o.to) : 'اليوم'}` : 'كل الحركات';
  const html = `<div class="a4">
${a4Header(o.store, { kind: 'كشف حساب', meta: [period, `تاريخ الطباعة: ${f.date(Date.now())}`] })}
<div class="parties">
  <div class="party"><h4>${o.party.kind === 'customer' ? 'الزبون' : 'المورد'}</h4><b>${escapeHtml(o.party.name)}</b>${o.party.phone ? `<div class="muted">${code(formatPhoneSafe(o.party.phone))}</div>` : ''}</div>
  <div class="party"><h4>الرصيد الختامي</h4><b>${f.money(Math.abs(closing))}</b> <span class="muted">${balLabel(closing) || 'لا رصيد'}</span></div>
</div>
<table>
  <thead><tr><th style="width:24mm">التاريخ</th><th style="width:26mm">المستند</th><th>البيان</th><th class="e" style="width:26mm">مدين</th><th class="e" style="width:26mm">دائن</th><th class="e" style="width:32mm">الرصيد</th></tr></thead>
  <tbody>${body || '<tr><td colspan="6" style="text-align:center;padding:8mm">لا حركات في هذه الفترة</td></tr>'}</tbody>
  <tfoot><tr><td colspan="3"><b>المجموع</b></td><td class="e"><b>${f.money(debit, true)}</b></td><td class="e"><b>${f.money(credit, true)}</b></td><td class="e"><b>${f.money(Math.abs(closing), true)}</b></td></tr></tfoot>
</table>
<div class="sign"><div>توقيع ${o.party.kind === 'customer' ? 'الزبون' : 'المورد'}</div><div>المحاسب</div></div>
</div>`;
  return { html, css: a4Css, paper: 'A4', title: `كشف حساب ${o.party.name}` };
}
