import { useNavigate } from "react-router-dom";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { IconButton } from "@/components/ui/Button";
import { Card, PageHeader } from "@/components/ui/Card";
import { Input, Select, Toolbar } from "@/components/ui/Form";
import { StatusBadge } from "@/components/ui/Badge";
import { DataTable, Pagination, type Column } from "@/components/ui/DataTable";
import { useApi, useTableState } from "@/hooks/useApi";
import { downloadFile, errorMessage } from "@/services/api";
import { date, money, period, units } from "@/utils/format";
import type { Bill, Page } from "@/types";

const STATUSES = [
  { value: "pending", label: "Pending" },
  { value: "generated", label: "Generated" },
  { value: "partially_paid", label: "Partially Paid" },
  { value: "paid", label: "Paid" },
  { value: "overdue", label: "Overdue" },
  { value: "cancelled", label: "Cancelled" },
];

export default function BillHistory() {
  const navigate = useNavigate();
  const t = useTableState({ status: "", billing_period: "" }, { by: "billing_period", dir: "desc" });
  const { data, loading, error, reload } = useApi<Page<Bill>>("/api/bills", {
    page: t.page, page_size: t.pageSize, sort_by: t.sort.by, sort_dir: t.sort.dir, ...t.filters,
  });

  const columns: Column<Bill>[] = [
    { key: "billing_period", header: "Period", sortable: true, render: (b) => <span className="font-medium text-ink">{period(b.billing_period)}</span> },
    { key: "invoice_number", header: "Invoice", sortable: true, hideOnMobile: true },
    { key: "units_consumed", header: "Units", sortable: true, align: "right", render: (b) => units(b.units_consumed) },
    { key: "total_amount", header: "Total", sortable: true, align: "right", render: (b) => money(b.total_amount) },
    { key: "balance_due", header: "Balance", sortable: true, align: "right", hideOnMobile: true, render: (b) => money(b.balance_due) },
    { key: "due_date", header: "Due", sortable: true, hideOnMobile: true, render: (b) => date(b.due_date) },
    { key: "status", header: "Status", render: (b) => <StatusBadge status={b.status} carried={!!b.carried_forward_to_id} /> },
    {
      key: "pdf", header: "", align: "right",
      render: (b) => (
        <IconButton label="Download PDF" onClick={(e) => {
          e.stopPropagation();
          downloadFile(`/api/bills/${b.id}/pdf`, undefined, `${b.invoice_number}.pdf`).catch((err) => toast.error(errorMessage(err)));
        }}>
          <Download className="h-4 w-4" />
        </IconButton>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="Bill History" subtitle="All your electricity bills." />
      <Card>
        <Toolbar>
          <Select className="sm:w-48" placeholder="All statuses" options={STATUSES} value={t.filters.status} onChange={(e) => t.setFilter("status", e.target.value)} aria-label="Status" />
          <Input type="month" className="sm:w-48" value={t.filters.billing_period} onChange={(e) => t.setFilter("billing_period", e.target.value)} aria-label="Billing month" />
          {(t.filters.status || t.filters.billing_period) && (
            <button className="text-xs font-medium text-brand-600" onClick={t.reset}>Clear filters</button>
          )}
        </Toolbar>
        <DataTable columns={columns} rows={data?.items} loading={loading} error={error} onRetry={reload} sort={t.sort} onSort={t.toggleSort}
          onRowClick={(b) => navigate(`/portal/bills/${b.id}`)} />
        {data && <Pagination page={data.page} pages={data.pages} total={data.total} pageSize={data.page_size} onPage={t.setPage} onPageSize={t.setPageSize} />}
      </Card>
    </div>
  );
}
