import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Download, FileDown, Plus } from "lucide-react";
import { toast } from "sonner";
import { downloadFile, errorMessage } from "@/services/api";
import { useApi, useDebounce, useTableState } from "@/hooks/useApi";
import { Card, PageHeader } from "@/components/ui/Card";
import { Button, IconButton } from "@/components/ui/Button";
import { SearchInput, Select, Toolbar } from "@/components/ui/Form";
import { DataTable, Pagination, type Column } from "@/components/ui/DataTable";
import { StatusBadge } from "@/components/ui/Badge";
import type { Bill, Page } from "@/types";
import { date, money, number, period } from "@/utils/format";

const STATUSES = ["draft", "generated", "pending", "partially_paid", "paid", "overdue", "cancelled"];

export default function BillsList() {
  const navigate = useNavigate();
  const t = useTableState({ search: "", status: "", billing_period: "", customer_type: "" }, { by: "issue_date", dir: "desc" });
  const search = useDebounce(t.filters.search);
  const { data, loading, error, reload } = useApi<Page<Bill>>("/api/bills", {
    page: t.page, page_size: t.pageSize, sort_by: t.sort.by, sort_dir: t.sort.dir, search, status: t.filters.status, billing_period: t.filters.billing_period, customer_type: t.filters.customer_type,
  });
  const [exporting, setExporting] = useState(false);

  const columns: Column<Bill>[] = [
    { key: "invoice_number", header: "Invoice", sortable: true, render: (b) => <span className="font-medium text-ink">{b.invoice_number}</span> },
    { key: "customer", header: "Customer", render: (b) => <div><p className="font-medium text-ink">{b.customer_name}</p><p className="text-xs text-ink-muted">{b.customer_code} · {b.connection_code}</p></div> },
    { key: "billing_period", header: "Period", sortable: true, render: (b) => period(b.billing_period) },
    { key: "units_consumed", header: "Units", sortable: true, align: "right", hideOnMobile: true, render: (b) => number(b.units_consumed) },
    { key: "total_amount", header: "Total", sortable: true, align: "right", render: (b) => money(b.total_amount) },
    { key: "balance_due", header: "Balance", sortable: true, align: "right", render: (b) => <span className={b.balance_due > 0 && !b.carried_forward_to_id && b.status !== "cancelled" ? "font-medium text-bad-700" : ""}>{money(b.carried_forward_to_id ? 0 : b.balance_due)}</span> },
    { key: "due_date", header: "Due", sortable: true, hideOnMobile: true, render: (b) => date(b.due_date) },
    { key: "status", header: "Status", sortable: true, render: (b) => <StatusBadge status={b.status} carried={!!b.carried_forward_to_id} /> },
    { key: "pdf", header: "", align: "right", render: (b) => (
      <IconButton label="Download PDF" onClick={(e) => { e.stopPropagation(); downloadFile(`/api/bills/${b.id}/pdf`).catch((er) => toast.error(errorMessage(er))); }}>
        <FileDown className="h-4 w-4" />
      </IconButton>
    ) },
  ];

  return (
    <div>
      <PageHeader title="Bills" subtitle="Search, filter and open invoices."
        actions={<Link to="/app/billing"><Button icon={<Plus className="h-4 w-4" />}>Generate bills</Button></Link>} />
      <Card>
        <Toolbar actions={
          <Button variant="outline" loading={exporting} icon={<Download className="h-4 w-4" />} onClick={async () => {
            setExporting(true);
            try { await downloadFile("/api/bills/export", { search, status: t.filters.status, billing_period: t.filters.billing_period, customer_type: t.filters.customer_type }); }
            catch (e) { toast.error(errorMessage(e)); }
            finally { setExporting(false); }
          }}>Export CSV</Button>
        }>
          <SearchInput className="sm:w-72" value={t.filters.search} onChange={(v) => t.setFilter("search", v)} placeholder="Invoice number, customer, connection..." />
          <Select className="sm:w-44" value={t.filters.status} onChange={(e) => t.setFilter("status", e.target.value)} placeholder="All statuses"
            options={STATUSES.map((s) => ({ value: s, label: s.replace("_", " ").replace(/^\w/, (c) => c.toUpperCase()) }))} />
          <input type="month" aria-label="Billing month" className="input sm:w-44" value={t.filters.billing_period} onChange={(e) => t.setFilter("billing_period", e.target.value)} />
          <Select className="sm:w-40" value={t.filters.customer_type} onChange={(e) => t.setFilter("customer_type", e.target.value)} placeholder="All types"
            options={["residential", "commercial", "industrial"].map((s) => ({ value: s, label: s[0].toUpperCase() + s.slice(1) }))} />
        </Toolbar>
        <DataTable columns={columns} rows={data?.items} loading={loading} error={error} onRetry={reload} sort={t.sort} onSort={t.toggleSort} onRowClick={(b) => navigate(`/app/bills/${b.id}`)} />
        {data && <Pagination page={data.page} pages={data.pages} total={data.total} pageSize={data.page_size} onPage={t.setPage} onPageSize={t.setPageSize} />}
      </Card>
    </div>
  );
}
