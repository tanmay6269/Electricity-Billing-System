import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Download, FileDown, Plus, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { api, downloadFile, errorMessage } from "@/services/api";
import { useApi, useDebounce, useTableState } from "@/hooks/useApi";
import { useAuth } from "@/context/AuthContext";
import { Card, PageHeader } from "@/components/ui/Card";
import { Button, IconButton } from "@/components/ui/Button";
import { Field, Input, SearchInput, Select, Textarea, Toolbar } from "@/components/ui/Form";
import { DataTable, Pagination, type Column } from "@/components/ui/DataTable";
import { StatusBadge } from "@/components/ui/Badge";
import { ConfirmDialog, Modal } from "@/components/ui/Modal";
import { Alert } from "@/components/ui/States";
import type { Bill, Page, Payment } from "@/types";
import { dateTime, METHOD_LABELS, money, period } from "@/utils/format";

export default function PaymentList() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const t = useTableState({ search: "", status: "", method: "", date_from: "", date_to: "" }, { by: "payment_date", dir: "desc" });
  const search = useDebounce(t.filters.search);
  const params = { search, status: t.filters.status, method: t.filters.method, date_from: t.filters.date_from, date_to: t.filters.date_to };
  const { data, loading, error, reload } = useApi<Page<Payment>>("/api/payments", { ...params, page: t.page, page_size: t.pageSize, sort_by: t.sort.by, sort_dir: t.sort.dir });
  const [recordOpen, setRecordOpen] = useState(false);
  const [refund, setRefund] = useState<Payment | null>(null);
  const [busy, setBusy] = useState(false);

  const columns: Column<Payment>[] = [
    { key: "payment_date", header: "Date", sortable: true, render: (p) => <span className="text-xs">{dateTime(p.payment_date)}</span> },
    { key: "transaction_id", header: "Transaction ID", render: (p) => <span className="font-mono text-xs text-ink">{p.transaction_id}</span> },
    { key: "invoice_number", header: "Invoice", render: (p) => <button className="text-brand-600 hover:underline" onClick={() => navigate(`/app/bills/${p.bill_id}`)}>{p.invoice_number}</button> },
    { key: "customer", header: "Customer", render: (p) => <div><p className="font-medium text-ink">{p.customer_name}</p><p className="text-xs text-ink-muted">{p.customer_code}</p></div> },
    { key: "method", header: "Method", sortable: true, render: (p) => METHOD_LABELS[p.method] ?? p.method },
    { key: "amount", header: "Amount", sortable: true, align: "right", render: (p) => <b className="text-ink">{money(p.amount)}</b> },
    { key: "status", header: "Status", sortable: true, render: (p) => <StatusBadge status={p.status} /> },
    { key: "a", header: "", align: "right", render: (p) => (
      <div className="flex justify-end">
        {p.receipt_number && <IconButton label="Download receipt" onClick={() => downloadFile(`/api/payments/${p.id}/receipt`).catch((e) => toast.error(errorMessage(e)))}><FileDown className="h-4 w-4" /></IconButton>}
        {user?.role === "admin" && p.status === "successful" && <IconButton label="Refund" onClick={() => setRefund(p)}><RotateCcw className="h-4 w-4" /></IconButton>}
      </div>
    ) },
  ];

  return (
    <div>
      <PageHeader title="Payments" subtitle="All payments: online demo checkout and counter payments recorded by staff."
        actions={<Button icon={<Plus className="h-4 w-4" />} onClick={() => setRecordOpen(true)}>Record payment</Button>} />
      {data?.summary && (
        <div className="mb-4 grid grid-cols-2 gap-4 sm:max-w-md">
          <div className="card p-4"><p className="text-xs text-ink-muted">Successful amount (filtered)</p><p className="mt-1 text-xl font-semibold tabular-nums">{money(data.summary.successful_amount)}</p></div>
          <div className="card p-4"><p className="text-xs text-ink-muted">Transactions</p><p className="mt-1 text-xl font-semibold tabular-nums">{data.total}</p></div>
        </div>
      )}
      <Card>
        <Toolbar actions={<Button variant="outline" icon={<Download className="h-4 w-4" />} onClick={() => downloadFile("/api/payments/export", params).catch((e) => toast.error(errorMessage(e)))}>Export CSV</Button>}>
          <SearchInput className="sm:w-64" value={t.filters.search} onChange={(v) => t.setFilter("search", v)} placeholder="Transaction, invoice, customer..." />
          <Select className="sm:w-36" value={t.filters.status} onChange={(e) => t.setFilter("status", e.target.value)} placeholder="All statuses"
            options={["successful", "failed", "pending", "refunded"].map((s) => ({ value: s, label: s[0].toUpperCase() + s.slice(1) }))} />
          <Select className="sm:w-40" value={t.filters.method} onChange={(e) => t.setFilter("method", e.target.value)} placeholder="All methods"
            options={Object.entries(METHOD_LABELS).map(([v, l]) => ({ value: v, label: l }))} />
          <input type="date" aria-label="From date" className="input sm:w-40" value={t.filters.date_from} onChange={(e) => t.setFilter("date_from", e.target.value)} />
          <input type="date" aria-label="To date" className="input sm:w-40" value={t.filters.date_to} onChange={(e) => t.setFilter("date_to", e.target.value)} />
        </Toolbar>
        <DataTable columns={columns} rows={data?.items} loading={loading} error={error} onRetry={reload} sort={t.sort} onSort={t.toggleSort} />
        {data && <Pagination page={data.page} pages={data.pages} total={data.total} pageSize={data.page_size} onPage={t.setPage} onPageSize={t.setPageSize} />}
      </Card>

      <RecordPaymentModal open={recordOpen} onClose={() => setRecordOpen(false)} onDone={reload} />
      <ConfirmDialog open={!!refund} onClose={() => setRefund(null)} loading={busy} title="Refund payment?" confirmLabel="Refund" reasonLabel="Refund reason"
        message={<>Refund <b>{refund && money(refund.amount)}</b> ({refund?.transaction_id}). The bill balance will be restored. Demo mode: no real money moves.</>}
        onConfirm={async (reason) => {
          if (!refund) return;
          setBusy(true);
          try { await api.post(`/api/payments/${refund.id}/refund`, { reason }); toast.success("Payment refunded"); setRefund(null); reload(); }
          catch (e) { toast.error(errorMessage(e)); }
          finally { setBusy(false); }
        }} />
    </div>
  );
}

function RecordPaymentModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [q, setQ] = useState("");
  const dq = useDebounce(q);
  const { data: bills } = useApi<Page<Bill>>(open ? "/api/bills" : null, { search: dq, page_size: 30, sort_by: "due_date", sort_dir: "asc" });
  const payable = (bills?.items ?? []).filter((b) => ["generated", "pending", "partially_paid", "overdue"].includes(b.status) && !b.carried_forward_to_id && b.balance_due > 0);
  const [billId, setBillId] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const [remarks, setRemarks] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const bill = payable.find((b) => String(b.id) === billId);

  const save = async () => {
    setErr(null);
    setBusy(true);
    try {
      const { data } = await api.post("/api/payments", { bill_id: Number(billId), amount: Number(amount), method, remarks: remarks || null });
      toast.success(`Payment ${data.transaction_id} recorded`);
      onDone();
      onClose();
      setBillId(""); setAmount(""); setRemarks("");
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open={open} onClose={onClose} title="Record payment" subtitle="For cash / counter payments or offline transfers."
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button variant="success" loading={busy} disabled={!bill || !amount} onClick={save}>Record payment</Button></>}>
      <div className="space-y-4">
        {err && <Alert tone="error">{err}</Alert>}
        <Field label="Find bill"><Input placeholder="Invoice number or customer..." value={q} onChange={(e) => setQ(e.target.value)} /></Field>
        <Field label="Unpaid bill" required>
          <Select placeholder={payable.length ? "Select bill" : "No unpaid bills match"} value={billId} onChange={(e) => { setBillId(e.target.value); const b = payable.find((x) => String(x.id) === e.target.value); if (b) setAmount(String(b.balance_due)); }}
            options={payable.map((b) => ({ value: b.id, label: `${b.invoice_number} · ${b.customer_name} · ${period(b.billing_period)} · due ${money(b.balance_due)}` }))} />
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Amount (Rs)" hint={bill ? `Balance ${money(bill.balance_due)}` : undefined}><Input type="number" min="1" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
          <Field label="Method"><Select value={method} onChange={(e) => setMethod(e.target.value)} options={Object.entries(METHOD_LABELS).map(([v, l]) => ({ value: v, label: l }))} /></Field>
        </div>
        <Field label="Remarks"><Textarea rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}
