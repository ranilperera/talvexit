import clsx from 'clsx';

export interface Column<T> {
  key: string;
  header: string;
  render?: (row: T) => React.ReactNode;
  className?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  keyField: keyof T;
  onRowClick?: (row: T) => void;
  emptyMessage?: string;
  isLoading?: boolean;
  // Cursor-based pagination
  nextCursor?: string | null;
  onNextPage?: () => void;
  // Optional search slot rendered above the table
  searchSlot?: React.ReactNode;
}

export default function DataTable<T>({
  columns,
  rows,
  keyField,
  onRowClick,
  emptyMessage = 'No records found.',
  isLoading,
  nextCursor,
  onNextPage,
  searchSlot,
}: DataTableProps<T>) {
  return (
    <div className="space-y-3">
      {searchSlot && <div>{searchSlot}</div>}

      <div className="overflow-x-auto rounded-lg border border-slate-800 bg-slate-900 shadow-sm">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-slate-900">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={clsx(
                    'px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500',
                    col.className,
                  )}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-8 text-center text-slate-500">
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-8 text-center text-slate-500">
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={String(row[keyField])}
                  onClick={() => onRowClick?.(row)}
                  className={clsx(
                    'transition-colors',
                    onRowClick && 'cursor-pointer hover:bg-blue-50',
                  )}
                >
                  {columns.map((col) => (
                    <td key={col.key} className={clsx('px-4 py-3 text-slate-300', col.className)}>
                      {col.render
                        ? col.render(row)
                        : String((row as Record<string, unknown>)[col.key] ?? '')}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {nextCursor && onNextPage && (
        <div className="flex justify-end">
          <button
            onClick={onNextPage}
            className="rounded-md border border-slate-700 px-4 py-1.5 text-sm text-slate-400 hover:bg-slate-900 transition-colors"
          >
            Next page →
          </button>
        </div>
      )}
    </div>
  );
}
