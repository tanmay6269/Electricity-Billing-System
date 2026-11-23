import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Download, Eye, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useApi, useDebounce, useTableState } from "@/hooks/useApi";
import { api, downloadFile, errorMessage } from "@/services/api";
import { Card, PageHeader } from "@/components/ui/Card";
import { Button, IconButton } from "@/components/ui/Button";
import { SearchInput, Select, Toolbar } from "@/components/ui/Form";
import { DataTable, Pagination, type Column } from "@/components/ui/DataTable";
import { StatusBadge, TypeBadge } from "@/components/ui/Badge";
import { ConfirmDialog } from "@/components/ui/Modal";
import type { Customer, Page } from "@/types";
import { date } from "@/utils/format";

export default function CustomerList() {
  const navigate = useNavigate();
  const t = useTableState({ search: "", customer_type: "", status: "" }, { by: "created_at", dir: "desc" });
  const search = useDebounce(t.filters.search);
  const params = { page: t.page, page_size: t.pageSize, sort_by: t.sort.by, sort_dir: t.sort.dir, search, customer_type: t.filters.customer_type, status: t.filters.status };
  const { data, loading, error, reload } = useApi<Page<Customer>>("/api/customers", params);
  const [toDelete, setToDelete] = useState<Customer | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);

  const remove = async () => {
    if (!toDelete) return;
    setDeleting(true);
    try {
      await api.delete(`/api/customers/${toDelete.id}`);
      toast.success(`${toDelete.full_name} deleted`);
      setToDelete(null);
      reload();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setDeleting(false);
    }
  };

  const columns: Column<Customer>[] = [
    { key: "customer_code", header: "Customer ID", sortable: true, render: (c) => <span className="font-medium text-ink">{c.customer_code}</span> },
    {
      key: "full_name", header: "Name", sortable: true,
      render: (c) => (
        <div className="min-w-[160px]">
          <p className="font-medium text-ink">{c.full_name}</p>
          <p className="text-xs text-ink-muted">{c.phone}</p>
        </div>
      ),
    },
    { key: "customer_type", header: "Type", sortable: true, render: (c) => <TypeBadge type={c.customer_type} /> },
    { key: "connection_code", header: "Connection / Meter", hideOnMobile: true, render: (c) => c.connection_code ? (<div><p>{c.connection_code}</p><p className="text-xs text-ink-muted">{c.meter_number}</p></div>) : <span className="text-ink-faint">No connection</span> },
    { key: "tariff_plan", header: "Tariff", hideOnMobile: true, render: (c) => <span className="text-xs">{c.tariff_plan ?? "-"}</span> },
    { key: "city", header: "City", sortable: true, hideOnMobile: true },
    { key: "status", header: "Status", sortable: true, render: (c) => <StatusBadge status={c.status} /> },
    { key: "created_at", header: "Created", sortable: true, hideOnMobile: true, render: (c) => date(c.created_at) },
    {
      key: "actions", header: "", align: "right",
      render: (c) => (
        <div className="flex justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
          <IconButton label="View profile" onClick={() => navigate(`/app/customers/${c.id}`)}><Eye className="h-4 w-4" /></IconButton>
          <IconButton label="Edit" onClick={() => navigate(`/app/customers/${c.id}/edit`)}><Pencil className="h-4 w-4" /></IconButton>
          <IconButton label="Delete" className="hover:bg-bad-50 hover:text-bad-600" onClick={() => setToDelete(c)}><Trash2 className="h-4 w-4" /></IconButton>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Customers"
        subtitle="Manage consumer accounts, their connections and tariff plans."
        actions={<Link to="/app/customers/new"><Button icon={<Plus className="h-4 w-4" />}>Add customer</Button></Link>}
      />
      <Card>
        <Toolbar
          actions={
            <Button variant="outline" loading={exporting} icon={<Download className="h-4 w-4" />}
              onClick={async () => {
                setExporting(true);
                try {
                  await downloadFile("/api/customers/export", { search, customer_type: t.filters.customer_type, status: t.filters.status }, "customers.csv");
                } catch (e) {
                  toast.error(errorMessage(e));
                } finally {
                  setExporting(false);
                }
              }}>
              Export CSV
            </Button>
          }
        >
          <SearchInput className="sm:w-80" value={t.filters.search} onChange={(v) => t.setFilter("search", v)} placeholder="Search name, ID, connection, meter..." />
          <Select className="sm:w-44" value={t.filters.customer_type} onChange={(e) => t.setFilter("customer_type", e.target.value)} placeholder="All types"
            options={[{ value: "residential", label: "Residential" }, { value: "commercial", label: "Commercial" }, { value: "industrial", label: "Industrial" }]} />
          <Select className="sm:w-40" value={t.filters.status} onChange={(e) => t.setFilter("status", e.target.value)} placeholder="All statuses"
            options={[{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }, { value: "suspended", label: "Suspended" }]} />
        </Toolbar>
        <DataTable columns={columns} rows={data?.items} loading={loading} error={error} onRetry={reload} sort={t.sort} onSort={t.toggleSort}
          onRowClick={(c) => navigate(`/app/customers/${c.id}`)} />
        {data && <Pagination page={data.page} pages={data.pages} total={data.total} pageSize={data.page_size} onPage={t.setPage} onPageSize={t.setPageSize} />}
      </Card>

      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        onConfirm={remove}
        loading={deleting}
        title="Delete customer?"
        confirmLabel="Delete customer"
        message={<>This will deactivate <b>{toDelete?.full_name}</b> ({toDelete?.customer_code}) and disconnect their connections. Billing and payment history is kept for audit. Customers with unpaid bills cannot be deleted.</>}
      />
    </div>
  );
}
