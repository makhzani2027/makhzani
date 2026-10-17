/** تقرير A4 عام: عنوان، فترة، مؤشرات، وجداول */
import type { StoreSettings } from '@raqeem/shared';
import { a4Css, a4Header, escapeHtml, printFmt, type PrintDoc } from './common';

export interface ReportTable {
  title?: string;
  head: { label: string; end?: boolean }[];
  rows: string[][]; // قيم منسقة جاهزة (نص عادي — تُهرَّب هنا)
  foot?: string[];
}

export function buildReportA4(o: { title: string; period: string; kpis?: { label: string; value: string }[]; tables: ReportTable[]; store: StoreSettings }): PrintDoc {
  const f = printFmt(o.store);
  const table = (t: ReportTable) => `${t.title ? `<h3 class="sec">${escapeHtml(t.title)}</h3>` : ''}<table>
<thead><tr>${t.head.map((h) => `<th class="${h.end ? 'e' : ''}">${escapeHtml(h.label)}</th>`).join('')}</tr></thead>
<tbody>${t.rows.map((r) => `<tr>${r.map((c, i) => `<td class="${t.head[i]?.end ? 'e' : ''}">${escapeHtml(c)}</td>`).join('')}</tr>`).join('') || `<tr><td colspan="${t.head.length}" style="text-align:center;padding:6mm">لا بيانات</td></tr>`}</tbody>
${t.foot ? `<tfoot><tr>${t.foot.map((c, i) => `<td class="${t.head[i]?.end ? 'e' : ''}"><b>${escapeHtml(c)}</b></td>`).join('')}</tr></tfoot>` : ''}
</table>`;
  const html = `<div class="a4">
${a4Header(o.store, { kind: o.title, meta: [escapeHtml(o.period), `تاريخ الطباعة: ${f.date(Date.now())} · ${f.time(Date.now())}`] })}
${o.kpis?.length ? `<div class="kpis">${o.kpis.map((k) => `<div class="kpi"><span>${escapeHtml(k.label)}</span><b>${escapeHtml(k.value)}</b></div>`).join('')}</div>` : ''}
${o.tables.map(table).join('')}
</div>`;
  return { html, css: a4Css, paper: 'A4', title: o.title };
}
