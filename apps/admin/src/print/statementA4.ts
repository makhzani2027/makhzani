/** كشف حساب A4 (زبون، مورد، أو صندوق/حساب): رصيد افتتاحي ثم الحركات برصيد تراكمي، جدول لكل عملة */
import { formatMoney, type CurrencyCode, type StoreSettings } from '@raqeem/shared';
import type { StatementRow } from '../pages/sales/data/types';
import { a4Css, a4Header, code, escapeHtml, formatPhoneSafe, printFmt, type PrintDoc } from './common';

export function buildStatementA4(o: {
  party: { name: string; phone: string | null; kind: 'customer' | 'supplier' | 'account' };
  rows: StatementRow[]; from: string | null; to: string | null; store: StoreSettings;
  opening?: Partial<Record<CurrencyCode, number>>;
}): PrintDoc {
  const f = printFmt(o.store);
  const digits = o.store.digits ?? 'arab';
  const m = (n: number, c: CurrencyCode) => formatMoney(n, { currency: c, digits, bare: true });
  const balLabel = (b: number) => {
    if (o.party.kind === 'account' || !b) return '';
    const owes = o.party.kind === 'customer' ? b > 0 : b < 0;
    return owes ? 'عليه' : 'له';
  };
  const currencies = Array.from(new Set<CurrencyCode>([...o.rows.map((r) => r.currency), ...(Object.keys(o.opening ?? {}) as CurrencyCode[]).filter((c) => o.opening?.[c])]));
  if (!currencies.length) currencies.push('IQD');
  const closingOf = (c: CurrencyCode) => {
    const rs = o.rows.filter((r) => r.currency === c);
    return rs.length ? rs[rs.length - 1].balance : o.opening?.[c] ?? 0;
  };
  const tables = currencies.map((c) => {
    const rs = o.rows.filter((r) => r.currency === c);
    const debit = rs.reduce((s, r) => s + r.debit, 0);
    const credit = rs.reduce((s, r) => s + r.credit, 0);
    const opening = o.opening?.[c] ?? 0;
    const closing = closingOf(c);
    const body = rs.map((r) => `<tr>
  <td class="e">${f.dateShort(r.at)}</td>
  <td>${r.number ? code(r.number) : '—'}</td>
  <td>${escapeHtml(r.description)}</td>
  <td class="e">${r.debit ? m(r.debit, c) : ''}</td>
  <td class="e">${r.credit ? m(r.credit, c) : ''}</td>
  <td class="e"><b>${m(Math.abs(r.balance), c)}</b> <span class="muted">${balLabel(r.balance)}</span></td>
</tr>`).join('');
    return `<h3 style="margin:6mm 0 2mm">${c === 'USD' ? 'بالدولار الأمريكي' : 'بالدينار العراقي'}</h3>
<table>
  <thead><tr><th style="width:24mm">التاريخ</th><th style="width:26mm">المستند</th><th>البيان</th><th class="e" style="width:26mm">${o.party.kind === 'account' ? 'وارد' : 'مدين'}</th><th class="e" style="width:26mm">${o.party.kind === 'account' ? 'صادر' : 'دائن'}</th><th class="e" style="width:32mm">الرصيد</th></tr></thead>
  <tbody><tr><td></td><td></td><td><b>رصيد افتتاحي</b></td><td></td><td></td><td class="e"><b>${m(Math.abs(opening), c)}</b> <span class="muted">${balLabel(opening)}</span></td></tr>
  ${body || '<tr><td colspan="6" style="text-align:center;padding:6mm">لا حركات في هذه الفترة</td></tr>'}</tbody>
  <tfoot><tr><td colspan="3"><b>المجموع</b></td><td class="e"><b>${m(debit, c)}</b></td><td class="e"><b>${m(credit, c)}</b></td><td class="e"><b>${m(Math.abs(closing), c)}</b></td></tr></tfoot>
</table>`;
  }).join('');
  const period = o.from || o.to ? `الفترة: ${o.from ? f.date(o.from) : 'البداية'} — ${o.to ? f.date(o.to) : 'اليوم'}` : 'كل الحركات';
  const who = o.party.kind === 'customer' ? 'الزبون' : o.party.kind === 'supplier' ? 'المورد' : 'الحساب';
  const closingTxt = currencies.map((c) => `<div><b>${formatMoney(Math.abs(closingOf(c)), { currency: c, digits })}</b> <span class="muted">${balLabel(closingOf(c))}</span></div>`).join('');
  const html = `<div class="a4">
${a4Header(o.store, { kind: 'كشف حساب', meta: [period, `تاريخ الطباعة: ${f.date(Date.now())}`] })}
<div class="parties">
  <div class="party"><h4>${who}</h4><b>${escapeHtml(o.party.name)}</b>${o.party.phone ? `<div class="muted">${code(formatPhoneSafe(o.party.phone))}</div>` : ''}</div>
  <div class="party"><h4>الرصيد الختامي</h4>${closingTxt}</div>
</div>
${tables}
${o.party.kind === 'account' ? '' : `<div class="sign"><div>توقيع ${who}</div><div>المحاسب</div></div>`}
</div>`;
  return { html, css: a4Css, paper: 'A4', title: `كشف حساب ${o.party.name}` };
}
