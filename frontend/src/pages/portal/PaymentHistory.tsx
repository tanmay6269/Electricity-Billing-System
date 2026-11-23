import { Download } from "lucide-react";
import { toast } from "sonner";
import { IconButton } from "@/components/ui/Button";
import { Card, PageHeader } from "@/components/ui/Card";
import { SearchInput, Select, Toolbar } from "@/components/ui/Form";
import { StatusBadge } from "@/components/ui/Badge";
import { DataTable, Pagination, type Column } from "@/components/ui/DataTable";
import { useApi, useDebounce, useTableState } from "@/hooks/useApi";
import { downloadFile, errorMessage } from "@/services/api";
import { dateTime, METHOD_LABELS, money, period } from "@/utils/format";
import type { Page, Payment } from "@/types";

export default function PaymentHistory() {
  const t = useTableState({ search: "", status: "", method: "" }, { by: "payment_date", dir: "desc" });
  const search = useDebounce(t.filters.search);
  const { data, loading, error, reload } = useApi<Page<Payment>>("/api/payments", {
    page: t.page, page_size: t.pageSize, sort_by: t.sort.by, sort_dir: t.sort.dir, status: t.filters.status, method: t.filters.method, search,
  });

  const columns: Column<Payment>[] = [
    { key: "payment_date", header: "Date", sortable: true, render: (p) => dateTime(p.payment_date) },
    { key: "transaction_id", header: "Transaction ID", render: (p) => <span className="font-mono text-xs">{p.transaction_id}</span> },
    { key: "invoice_number", header: "Invoice", hideOnMobile: true, render: (p) => <span>{p.invoice_number} <span className="text-ink-faint">({period(p.billing_period)})</span></span> },
    { key: "method", header: "Method", sortable: true, hideOnMobile: true, render: (p) => METHOD_LABELS[p.method] ?? p.method },
    { key: "amount", header: "Amount", sortable: true, align: "right", render: (p) => money(p.amount) },
    { key: "status", header: "Status", sortable: true, render: (p) => <StatusBadge status={p.status} /> },
    {
      key: "receipt", header: "Receipt", align: "right",
      render: (p) => p.status === "successful" && p.receipt_number ? (
        <IconButton label="Download receipt" onClick={() => downloadFile(`/api/payments/${p.id}/receipt`, undefined, `${p.receipt_number}.pdf`).catch((e) => toast.error(errorMessage(e)))}>
          <Download className="h-4 w-4" />
        </IconButton>
      ) : <span className="text-ink-faint">-</span>,
    },
  ];

  return (
    <div>
      <PageHeader title="Payment History" subtitle={data?.summary ? `Total paid ${money(data.summary.successful_amount)}` : undefined} />
      <Card>
        <Toolbar>
          <SearchInput className="sm:w-72" value={t.filters.search} onChange={(v) => t.setFilter("search", v)} placeholder="Search transaction or invoice" />
          <Select className="sm:w-44" placeholder="All statuses" value={t.filters.status} onChange={(e) => t.setFilter("status", e.target.value)} aria-label="Status"
            options={[{ value: "successful", label: "Successful" }, { value: "failed", label: "Failed" }, { value: "refunded", label: "Refunded" }, { value: "pending", label: "Pending" }]} />
          <Select className="sm:w-44" placeholder="All methods" value={t.filters.method} onChange={(e) => t.setFilter("method", e.target.value)} aria-label="Method"
            options={Object.entries(METHOD_LABELS).map(([value, label]) => ({ value, label }))} />
        </Toolbar>
        <DataTable columns={columns} rows={data?.items} loading={loading} error={error} onRetry={reload} sort={t.sort} onSort={t.toggleSort} />
        {data && <Pagination page={data.page} pages={data.pages} total={data.total} pageSize={data.page_size} onPage={t.setPage} onPageSize={t.setPageSize} />}
      </Card>
    </div>
  );
}
