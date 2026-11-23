import type { ReactNode } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";
import clsx from "clsx";
import { EmptyState, ErrorState, Skeleton } from "./States";

export interface Column<T> {
  key: string;
  header: string;
  render?: (row: T) => ReactNode;
  sortable?: boolean;
  align?: "left" | "right" | "center";
  className?: string;
  hideOnMobile?: boolean;
}

export function DataTable<T extends { id: number | string }>({
  columns, rows, loading, error, onRetry, sort, onSort, onRowClick, empty, rowClassName,
}: {
  columns: Column<T>[];
  rows: T[] | undefined;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  sort?: { by: string; dir: "asc" | "desc" };
  onSort?: (key: string) => void;
  onRowClick?: (row: T) => void;
  empty?: ReactNode;
  rowClassName?: (row: T) => string | undefined;
}) {
  if (error) return <ErrorState message={error} onRetry={onRetry} />;
  return (
    <div className="relative overflow-x-auto">
      <table className="min-w-full divide-y divide-line">
        <thead className="bg-slate-50/70">
          <tr>
            {columns.map((c) => {
              const active = sort?.by === c.key;
              const Icon = !active ? ArrowUpDown : sort?.dir === "asc" ? ArrowUp : ArrowDown;
              return (
                <th key={c.key} scope="col" className={clsx("table-th", c.align === "right" && "text-right", c.align === "center" && "text-center", c.hideOnMobile && "hidden md:table-cell")}>
                  {c.sortable && onSort ? (
                    <button type="button" onClick={() => onSort(c.key)} className={clsx("inline-flex items-center gap-1 uppercase hover:text-ink", active && "text-ink")}>
                      {c.header}
                      <Icon className={clsx("h-3 w-3", !active && "opacity-40")} />
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody className="divide-y divide-line bg-white">
          {loading && !rows?.length
            ? Array.from({ length: 6 }).map((_, i) => (
                <tr key={i}>
                  {columns.map((c) => (
                    <td key={c.key} className={clsx("table-td", c.hideOnMobile && "hidden md:table-cell")}>
                      <Skeleton className="h-4 w-24" />
                    </td>
                  ))}
                </tr>
              ))
            : rows?.map((row) => (
                <tr
                  key={row.id}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={clsx("transition-colors", onRowClick && "cursor-pointer hover:bg-brand-50/40", rowClassName?.(row), loading && "opacity-60")}
                >
                  {columns.map((c) => (
                    <td key={c.key} className={clsx("table-td", c.align === "right" && "text-right tabular-nums", c.align === "center" && "text-center", c.hideOnMobile && "hidden md:table-cell", c.className)}>
                      {c.render ? c.render(row) : String((row as Record<string, unknown>)[c.key] ?? "-")}
                    </td>
                  ))}
                </tr>
              ))}
        </tbody>
      </table>
      {!loading && rows && rows.length === 0 && (empty ?? <EmptyState title="No records found" message="Try changing the search or filters." />)}
    </div>
  );
}

export function Pagination({ page, pages, total, pageSize, onPage, onPageSize }: {
  page: number; pages: number; total: number; pageSize: number; onPage: (p: number) => void; onPageSize?: (n: number) => void;
}) {
  if (!total) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  const nums: (number | "...")[] = [];
  for (let i = 1; i <= pages; i++) {
    if (i === 1 || i === pages || Math.abs(i - page) <= 1) nums.push(i);
    else if (nums[nums.length - 1] !== "...") nums.push("...");
  }
  return (
    <div className="flex flex-col items-center justify-between gap-3 border-t border-line px-4 py-3 sm:flex-row">
      <div className="flex items-center gap-3 text-xs text-ink-muted">
        <span>
          Showing <b className="text-ink">{from}</b>-<b className="text-ink">{to}</b> of <b className="text-ink">{total}</b>
        </span>
        {onPageSize && (
          <select aria-label="Rows per page" value={pageSize} onChange={(e) => onPageSize(Number(e.target.value))} className="h-7 rounded-md border border-line bg-white px-1.5 text-xs">
            {[10, 20, 50, 100].map((n) => (
              <option key={n} value={n}>{n} / page</option>
            ))}
          </select>
        )}
      </div>
      <div className="flex items-center gap-1">
        <button aria-label="Previous page" disabled={page <= 1} onClick={() => onPage(page - 1)} className="flex h-8 w-8 items-center justify-center rounded-md text-ink-muted hover:bg-slate-100 disabled:opacity-40">
          <ChevronLeft className="h-4 w-4" />
        </button>
        {nums.map((n, i) =>
          n === "..." ? (
            <span key={`e${i}`} className="px-1 text-xs text-ink-faint">...</span>
          ) : (
            <button key={n} onClick={() => onPage(n)} className={clsx("h-8 min-w-8 rounded-md px-2 text-xs font-medium", n === page ? "bg-brand-600 text-white" : "text-ink-soft hover:bg-slate-100")}>
              {n}
            </button>
          ),
        )}
        <button aria-label="Next page" disabled={page >= pages} onClick={() => onPage(page + 1)} className="flex h-8 w-8 items-center justify-center rounded-md text-ink-muted hover:bg-slate-100 disabled:opacity-40">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
