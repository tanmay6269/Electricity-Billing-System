import { Fragment, useState } from "react";
import { ChevronDown, ChevronRight, ShieldCheck } from "lucide-react";
import { useApi, useDebounce, useTableState } from "@/hooks/useApi";
import { Card, PageHeader } from "@/components/ui/Card";
import { SearchInput, Select, Toolbar } from "@/components/ui/Form";
import { Pagination } from "@/components/ui/DataTable";
import { Badge } from "@/components/ui/Badge";
import { EmptyState, ErrorState, LoadingBlock } from "@/components/ui/States";
import type { AuditEntry, Page } from "@/types";
import { dateTime, label } from "@/utils/format";

export default function AuditLogs() {
  const t = useTableState({ search: "", entity_type: "", date_from: "", date_to: "" });
  const search = useDebounce(t.filters.search);
  const { data, loading, error, reload } = useApi<Page<AuditEntry & { id: number }>>("/api/audit-logs", { page: t.page, page_size: t.pageSize, search, entity_type: t.filters.entity_type, date_from: t.filters.date_from, date_to: t.filters.date_to });
  const { data: types } = useApi<string[]>("/api/audit-logs/entity-types");
  const [open, setOpen] = useState<number | null>(null);

  return (
    <div>
      <PageHeader title="Audit Logs" subtitle="Read-only trail of every important action. Audit records cannot be edited or deleted." />
      <Card>
        <Toolbar>
          <SearchInput className="sm:w-72" value={t.filters.search} onChange={(v) => t.setFilter("search", v)} placeholder="Search action or summary..." />
          <Select className="sm:w-44" value={t.filters.entity_type} onChange={(e) => t.setFilter("entity_type", e.target.value)} placeholder="All entities" options={(types ?? []).map((x) => ({ value: x, label: label(x) }))} />
          <input type="date" aria-label="From date" className="input sm:w-40" value={t.filters.date_from} onChange={(e) => t.setFilter("date_from", e.target.value)} />
          <input type="date" aria-label="To date" className="input sm:w-40" value={t.filters.date_to} onChange={(e) => t.setFilter("date_to", e.target.value)} />
        </Toolbar>
        {error ? <ErrorState message={error} onRetry={reload} /> : loading && !data ? <LoadingBlock /> : !data?.items.length ? <EmptyState icon={<ShieldCheck className="h-6 w-6" />} title="No audit entries" /> : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-line">
              <thead className="bg-slate-50/70"><tr><th className="table-th w-8" /><th className="table-th">Time</th><th className="table-th">User</th><th className="table-th">Action</th><th className="table-th">Entity</th><th className="table-th">Summary</th><th className="table-th">IP</th></tr></thead>
              <tbody className="divide-y divide-line">
                {data.items.map((a) => (
                  <Fragment key={a.id}>
                    <tr className="cursor-pointer hover:bg-slate-50" onClick={() => setOpen(open === a.id ? null : a.id)}>
                      <td className="table-td">{a.old_values || a.new_values ? (open === a.id ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />) : null}</td>
                      <td className="table-td text-xs">{dateTime(a.created_at)}</td>
                      <td className="table-td"><p className="text-ink">{a.user}</p>{a.user_role && <p className="text-xs text-ink-muted">{a.user_role}</p>}</td>
                      <td className="table-td"><Badge tone="gray">{a.action}</Badge></td>
                      <td className="table-td text-xs">{label(a.entity_type)} {a.entity_id && `#${a.entity_id}`}</td>
                      <td className="table-td max-w-[360px] truncate whitespace-normal text-xs">{a.summary ?? "-"}</td>
                      <td className="table-td text-xs text-ink-muted">{a.ip_address ?? "-"}</td>
                    </tr>
                    {open === a.id && (a.old_values || a.new_values) && (
                      <tr className="bg-slate-50/60">
                        <td />
                        <td colSpan={6} className="px-4 py-3">
                          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                            {a.old_values && <div><p className="mb-1 text-xs font-semibold text-ink-muted">Before</p><pre className="overflow-auto rounded-lg bg-white p-3 text-[11px] ring-1 ring-line">{JSON.stringify(a.old_values, null, 2)}</pre></div>}
                            {a.new_values && <div><p className="mb-1 text-xs font-semibold text-ink-muted">After</p><pre className="overflow-auto rounded-lg bg-white p-3 text-[11px] ring-1 ring-line">{JSON.stringify(a.new_values, null, 2)}</pre></div>}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && <Pagination page={data.page} pages={data.pages} total={data.total} pageSize={data.page_size} onPage={t.setPage} onPageSize={t.setPageSize} />}
      </Card>
    </div>
  );
}
