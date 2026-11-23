import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { api, errorMessage } from "@/services/api";
import { useApi, useDebounce, useTableState } from "@/hooks/useApi";
import { Card, PageHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field, Input, SearchInput, Select, Textarea, Toolbar } from "@/components/ui/Form";
import { DataTable, Pagination, type Column } from "@/components/ui/DataTable";
import { StatusBadge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { Alert } from "@/components/ui/States";
import type { Complaint, Customer, CustomerProfile, Page } from "@/types";
import { CATEGORY_LABELS, date, timeAgo } from "@/utils/format";

const STATUSES = ["submitted", "under_review", "assigned", "in_progress", "resolved", "closed"];

export default function ComplaintList() {
  const navigate = useNavigate();
  const t = useTableState({ search: "", status: "", category: "", priority: "", mine: "" }, { by: "created_at", dir: "desc" });
  const search = useDebounce(t.filters.search);
  const { data, loading, error, reload } = useApi<Page<Complaint>>("/api/complaints", {
    page: t.page, page_size: t.pageSize, sort_by: t.sort.by, sort_dir: t.sort.dir, search, status: t.filters.status, category: t.filters.category,
    priority: t.filters.priority, assigned_to_me: t.filters.mine ? true : undefined,
  });
  const [open, setOpen] = useState(false);

  const columns: Column<Complaint>[] = [
    { key: "complaint_code", header: "ID", render: (c) => <span className="font-medium text-ink">{c.complaint_code}</span> },
    { key: "subject", header: "Subject", render: (c) => <div className="max-w-[280px]"><p className="truncate font-medium text-ink">{c.subject}</p><p className="text-xs text-ink-muted">{CATEGORY_LABELS[c.category]}</p></div> },
    { key: "customer", header: "Customer", hideOnMobile: true, render: (c) => <div><p>{c.customer_name}</p><p className="text-xs text-ink-muted">{c.customer_code}</p></div> },
    { key: "priority", header: "Priority", sortable: true, render: (c) => <StatusBadge status={c.priority} /> },
    { key: "status", header: "Status", sortable: true, render: (c) => <StatusBadge status={c.status} /> },
    { key: "assigned_to_name", header: "Assigned", hideOnMobile: true, render: (c) => c.assigned_to_name ?? <span className="text-ink-faint">Unassigned</span> },
    { key: "created_at", header: "Submitted", sortable: true, render: (c) => <span title={date(c.created_at)}>{timeAgo(c.created_at)}</span> },
  ];

  return (
    <div>
      <PageHeader title="Complaints" subtitle="Track, assign and resolve customer issues."
        actions={<Button icon={<Plus className="h-4 w-4" />} onClick={() => setOpen(true)}>Log complaint</Button>} />
      <Card>
        <Toolbar>
          <SearchInput className="sm:w-64" value={t.filters.search} onChange={(v) => t.setFilter("search", v)} placeholder="ID, subject, customer..." />
          <Select className="sm:w-40" value={t.filters.status} onChange={(e) => t.setFilter("status", e.target.value)} placeholder="All statuses"
            options={STATUSES.map((s) => ({ value: s, label: s.replace("_", " ").replace(/^\w/, (x) => x.toUpperCase()) }))} />
          <Select className="sm:w-52" value={t.filters.category} onChange={(e) => t.setFilter("category", e.target.value)} placeholder="All categories"
            options={Object.entries(CATEGORY_LABELS).map(([v, l]) => ({ value: v, label: l }))} />
          <Select className="sm:w-36" value={t.filters.priority} onChange={(e) => t.setFilter("priority", e.target.value)} placeholder="Any priority"
            options={["low", "medium", "high", "critical"].map((s) => ({ value: s, label: s[0].toUpperCase() + s.slice(1) }))} />
          <label className="flex items-center gap-2 text-xs font-medium text-ink-soft">
            <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={!!t.filters.mine} onChange={(e) => t.setFilter("mine", e.target.checked ? "1" : "")} /> Assigned to me
          </label>
        </Toolbar>
        <DataTable columns={columns} rows={data?.items} loading={loading} error={error} onRetry={reload} sort={t.sort} onSort={t.toggleSort} onRowClick={(c) => navigate(`/app/complaints/${c.id}`)} />
        {data && <Pagination page={data.page} pages={data.pages} total={data.total} pageSize={data.page_size} onPage={t.setPage} onPageSize={t.setPageSize} />}
      </Card>
      <LogComplaintModal open={open} onClose={() => setOpen(false)} onDone={(id) => navigate(`/app/complaints/${id}`)} />
    </div>
  );
}

function LogComplaintModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: (id: number) => void }) {
  const [q, setQ] = useState("");
  const dq = useDebounce(q);
  const { data: customers } = useApi<Page<Customer>>(open ? "/api/customers" : null, { search: dq, page_size: 20 });
  const [f, setF] = useState({ customer_id: "", connection_id: "", category: "power_supply", priority: "medium", subject: "", description: "" });
  const { data: profile } = useApi<CustomerProfile>(f.customer_id ? `/api/customers/${f.customer_id}/profile` : null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));

  const save = async () => {
    setErr(null);
    setBusy(true);
    try {
      const { data } = await api.post("/api/complaints", { ...f, customer_id: Number(f.customer_id), connection_id: f.connection_id ? Number(f.connection_id) : null });
      toast.success(`Complaint ${data.complaint_code} logged`);
      onClose();
      onDone(data.id);
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} size="lg" title="Log complaint on behalf of a customer"
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button loading={busy} onClick={save}>Submit complaint</Button></>}>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {err && <div className="sm:col-span-2"><Alert tone="error">{err}</Alert></div>}
        <Field label="Find customer"><Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name or ID..." /></Field>
        <Field label="Customer" required><Select placeholder="Select customer" value={f.customer_id} onChange={set("customer_id")} options={(customers?.items ?? []).map((c) => ({ value: c.id, label: `${c.full_name} (${c.customer_code})` }))} /></Field>
        <Field label="Connection"><Select placeholder="Not specific" value={f.connection_id} onChange={set("connection_id")} options={(profile?.connections ?? []).map((c) => ({ value: c.id, label: c.connection_code }))} /></Field>
        <Field label="Category"><Select value={f.category} onChange={set("category")} options={Object.entries(CATEGORY_LABELS).map(([v, l]) => ({ value: v, label: l }))} /></Field>
        <Field label="Priority"><Select value={f.priority} onChange={set("priority")} options={["low", "medium", "high", "critical"].map((s) => ({ value: s, label: s[0].toUpperCase() + s.slice(1) }))} /></Field>
        <Field label="Subject" required hint="5-200 characters"><Input value={f.subject} onChange={set("subject")} /></Field>
        <Field label="Description" required className="sm:col-span-2" hint="At least 10 characters"><Textarea rows={4} value={f.description} onChange={set("description")} /></Field>
      </div>
    </Modal>
  );
}
