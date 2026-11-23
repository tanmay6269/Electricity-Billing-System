import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import { useApi, useDebounce, useTableState } from "@/hooks/useApi";
import { Card, PageHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { SearchInput, Select, Toolbar } from "@/components/ui/Form";
import { DataTable, Pagination, type Column } from "@/components/ui/DataTable";
import { StatusBadge, TypeBadge } from "@/components/ui/Badge";
import type { Connection, Page, Tariff } from "@/types";
import { date } from "@/utils/format";
import ConnectionFormModal from "./ConnectionFormModal";

export default function ConnectionList() {
  const navigate = useNavigate();
  const t = useTableState({ search: "", status: "", connection_type: "", tariff_plan_id: "" }, { by: "created_at", dir: "desc" });
  const search = useDebounce(t.filters.search);
  const { data, loading, error, reload } = useApi<Page<Connection>>("/api/connections", {
    page: t.page, page_size: t.pageSize, sort_by: t.sort.by, sort_dir: t.sort.dir, search, status: t.filters.status,
    connection_type: t.filters.connection_type, tariff_plan_id: t.filters.tariff_plan_id,
  });
  const { data: tariffs } = useApi<Tariff[]>("/api/tariffs");
  const [open, setOpen] = useState(false);

  const columns: Column<Connection>[] = [
    { key: "connection_code", header: "Connection ID", sortable: true, render: (c) => <span className="font-medium text-ink">{c.connection_code}</span> },
    { key: "customer", header: "Customer", render: (c) => <div><p className="font-medium text-ink">{c.customer_name}</p><p className="text-xs text-ink-muted">{c.customer_code}</p></div> },
    { key: "meter_number", header: "Meter", render: (c) => <div><p>{c.meter_number}</p><p className="text-xs text-ink-muted">Meter: {c.meter_status}</p></div> },
    { key: "connection_type", header: "Type", render: (c) => <TypeBadge type={c.connection_type} /> },
    { key: "sanctioned_load_kw", header: "Load", sortable: true, align: "right", hideOnMobile: true, render: (c) => `${c.sanctioned_load_kw} kW` },
    { key: "tariff_plan", header: "Tariff", hideOnMobile: true, render: (c) => <span className="text-xs">{c.tariff_plan}</span> },
    { key: "installation_date", header: "Installed", sortable: true, hideOnMobile: true, render: (c) => date(c.installation_date) },
    { key: "status", header: "Status", sortable: true, render: (c) => <StatusBadge status={c.status} /> },
  ];

  return (
    <div>
      <PageHeader title="Electricity Connections" subtitle="Connections are managed separately from customer accounts - one customer can hold several."
        actions={<Button icon={<Plus className="h-4 w-4" />} onClick={() => setOpen(true)}>New connection</Button>} />
      <Card>
        <Toolbar>
          <SearchInput className="sm:w-72" value={t.filters.search} onChange={(v) => t.setFilter("search", v)} placeholder="Search connection, meter, customer..." />
          <Select className="sm:w-40" value={t.filters.status} onChange={(e) => t.setFilter("status", e.target.value)} placeholder="All statuses"
            options={["active", "pending", "suspended", "disconnected"].map((s) => ({ value: s, label: s[0].toUpperCase() + s.slice(1) }))} />
          <Select className="sm:w-40" value={t.filters.connection_type} onChange={(e) => t.setFilter("connection_type", e.target.value)} placeholder="All types"
            options={["residential", "commercial", "industrial"].map((s) => ({ value: s, label: s[0].toUpperCase() + s.slice(1) }))} />
          <Select className="sm:w-56" value={t.filters.tariff_plan_id} onChange={(e) => t.setFilter("tariff_plan_id", e.target.value)} placeholder="All tariffs"
            options={(tariffs ?? []).map((x) => ({ value: x.id, label: x.name }))} />
        </Toolbar>
        <DataTable columns={columns} rows={data?.items} loading={loading} error={error} onRetry={reload} sort={t.sort} onSort={t.toggleSort}
          onRowClick={(c) => navigate(`/app/connections/${c.id}`)} />
        {data && <Pagination page={data.page} pages={data.pages} total={data.total} pageSize={data.page_size} onPage={t.setPage} onPageSize={t.setPageSize} />}
      </Card>
      <ConnectionFormModal open={open} onClose={() => setOpen(false)} onSaved={(id) => navigate(`/app/connections/${id}`)} />
    </div>
  );
}
