import type { ReactNode } from 'react';
import { EmptyState, ErrorState, Skeleton } from './layout';
import type { IconName } from './Icon';

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  /** محاذاة لليسار (الأرقام والمبالغ) */
  end?: boolean;
  shrink?: boolean;
  width?: number | string;
  /** العمود الرئيسي: يظهر عنواناً في وضع البطاقات على الهاتف */
  primary?: boolean;
  hideOnMobile?: boolean;
}

/**
 * جدول البيانات الموحد: تحميل بهيكل، حالة فارغة مرسومة، خطأ مع إعادة، ضغط على الصف، تحديد متعدد،
 * ويتحول لبطاقات على الهاتف تلقائياً.
 */
export function DataTable<T>({ rows, columns, rowKey, loading, error, onRetry, onRowClick, empty, toolbar, footer, selected, onSelect, dense }: {
  rows: T[] | undefined; columns: Column<T>[]; rowKey: (r: T) => string; loading?: boolean; error?: string | null; onRetry?: () => void;
  onRowClick?: (r: T) => void; empty?: { icon?: IconName; title: string; text?: ReactNode; action?: ReactNode };
  toolbar?: ReactNode; footer?: ReactNode; selected?: Set<string>; onSelect?: (next: Set<string>) => void; dense?: boolean;
}) {
  const showSkeleton = loading && !rows?.length;
  const allSelected = !!rows?.length && !!selected && rows.every((r) => selected.has(rowKey(r)));
  const toggleAll = () => {
    if (!onSelect || !rows) return;
    onSelect(allSelected ? new Set() : new Set(rows.map(rowKey)));
  };
  const toggle = (k: string) => {
    if (!onSelect || !selected) return;
    const n = new Set(selected);
    if (n.has(k)) n.delete(k); else n.add(k);
    onSelect(n);
  };
  return (
    <div className="table-wrap">
      {toolbar ? <div className="table-toolbar">{toolbar}</div> : null}
      {error && !rows?.length ? (
        <ErrorState message={error} onRetry={onRetry} />
      ) : !showSkeleton && rows && rows.length === 0 ? (
        <EmptyState icon={empty?.icon ?? 'list'} title={empty?.title ?? 'لا توجد بيانات'} text={empty?.text} action={empty?.action} />
      ) : (
        <div className="table-scroll">
          <table className="table cards" style={dense ? { fontSize: 13.5 } : undefined}>
            <thead>
              <tr>
                {onSelect ? <th className="check-col"><input type="checkbox" aria-label="تحديد الكل" checked={allSelected} onChange={toggleAll} /></th> : null}
                {columns.map((c) => (
                  <th key={c.key} className={`${c.end ? 'end' : ''} ${c.shrink ? 'shrink' : ''} ${c.hideOnMobile ? 'only-desktop' : ''}`} style={c.width ? { width: c.width } : undefined}>{c.header}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {showSkeleton
                ? Array.from({ length: 6 }, (_, i) => (
                    <tr key={i}>
                      {onSelect ? <td /> : null}
                      {columns.map((c) => <td key={c.key}><Skeleton h={14} w={c.end ? 60 : '70%'} /></td>)}
                    </tr>
                  ))
                : rows!.map((r) => {
                    const k = rowKey(r);
                    return (
                      <tr key={k} className={`${onRowClick ? 'clickable' : ''} ${selected?.has(k) ? 'selected' : ''}`} onClick={onRowClick ? () => onRowClick(r) : undefined}>
                        {onSelect ? (
                          <td className="check-col" onClick={(e) => e.stopPropagation()}>
                            <input type="checkbox" aria-label="تحديد" checked={selected?.has(k) ?? false} onChange={() => toggle(k)} />
                          </td>
                        ) : null}
                        {columns.map((c) => (
                          <td key={c.key} data-label={typeof c.header === 'string' ? c.header : ''} className={`${c.end ? 'end num' : ''} ${c.shrink ? 'shrink' : ''} ${c.primary ? 'primary-cell' : ''} ${c.hideOnMobile ? 'only-desktop' : ''}`}>
                            {c.cell(r)}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
            </tbody>
          </table>
        </div>
      )}
      {footer ? <div className="table-foot">{footer}</div> : null}
    </div>
  );
}
