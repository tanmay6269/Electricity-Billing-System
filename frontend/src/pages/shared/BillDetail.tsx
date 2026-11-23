import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Ban, BellRing, CheckCircle2, FileDown, Pencil, Printer, Send, Wallet } from "lucide-react";
import { toast } from "sonner";
import { api, downloadFile, errorMessage, openPdf } from "@/services/api";
import { useApi } from "@/hooks/useApi";
import { Card, CardBody, CardHeader, InfoGrid, PageHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/Badge";
import { ConfirmDialog, Modal } from "@/components/ui/Modal";
import { Field, Input, Select, Textarea } from "@/components/ui/Form";
import { Alert, ErrorState, LoadingBlock } from "@/components/ui/States";
import type { Bill } from "@/types";
import { date, dateTime, METHOD_LABELS, money, number, period } from "@/utils/format";

const OPEN = ["generated", "pending", "partially_paid", "overdue"];

/** Staff / admin view of one bill, with all bill actions. */
export default function BillDetail() {
  const { id } = useParams();
  const { data: b, loading, error, reload } = useApi<Bill>(`/api/bills/${id}`);
  const [modal, setModal] = useState<"" | "cancel" | "pay" | "draft">("");
  const [busy, setBusy] = useState(false);
  const [pay, setPay] = useState({ amount: "", method: "cash", remarks: "" });
  const [draft, setDraft] = useState({ discount: "", extra_charges: "", remarks: "" });

  if (loading && !b) return <LoadingBlock />;
  if (error || !b) return <ErrorState message={error ?? "Not found"} onRetry={reload} />;
  const payable = OPEN.includes(b.status) && !b.carried_forward_to_id && b.balance_due > 0;

  const act = async (fn: () => Promise<unknown>, msg: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(msg);
      setModal("");
      reload();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const snapExtra = Number((b.tariff_snapshot as { additional_charges?: string } | undefined)?.additional_charges ?? 0);

  return (
    <div>
      <PageHeader
        back={<Link to="/app/bills" className="mb-2 inline-flex items-center gap-1 text-xs font-medium text-ink-muted hover:text-ink"><ArrowLeft className="h-3.5 w-3.5" /> Bills</Link>}
        title={`Invoice ${b.invoice_number}`}
        subtitle={<span className="flex flex-wrap items-center gap-2">{b.customer_name} · {period(b.billing_period)} <StatusBadge status={b.status} carried={!!b.carried_forward_to_id} /></span>}
        actions={
          <>
            <Button variant="outline" icon={<FileDown className="h-4 w-4" />} onClick={() => downloadFile(`/api/bills/${b.id}/pdf`).catch((e) => toast.error(errorMessage(e)))}>PDF</Button>
            <Button variant="outline" icon={<Printer className="h-4 w-4" />} onClick={() => openPdf(`/api/bills/${b.id}/pdf`).catch((e) => toast.error(errorMessage(e)))}>Print</Button>
            {b.status === "draft" && (
              <>
                <Button variant="outline" icon={<Pencil className="h-4 w-4" />} onClick={() => { setDraft({ discount: String(b.discount), extra_charges: String(Math.max(0, b.additional_charges - snapExtra)), remarks: b.remarks ?? "" }); setModal("draft"); }}>Edit draft</Button>
                <Button icon={<Send className="h-4 w-4" />} loading={busy} onClick={() => act(() => api.post(`/api/bills/${b.id}/issue`), "Bill issued and customer notified")}>Issue bill</Button>
              </>
            )}
            {!["draft", "cancelled"].includes(b.status) && (
              <Button variant="outline" icon={<BellRing className="h-4 w-4" />} loading={busy} onClick={() => act(() => api.post(`/api/bills/${b.id}/notify`), "Notification sent")}>Notify</Button>
            )}
            {payable && <Button variant="success" icon={<Wallet className="h-4 w-4" />} onClick={() => { setPay({ amount: String(b.balance_due), method: "cash", remarks: "" }); setModal("pay"); }}>Record payment</Button>}
            {b.status !== "cancelled" && b.amount_paid === 0 && <Button variant="danger" icon={<Ban className="h-4 w-4" />} onClick={() => setModal("cancel")}>Cancel</Button>}
          </>
        }
      />

      {b.status === "cancelled" && <div className="mb-4"><Alert tone="error" title="Cancelled">{b.cancel_reason}</Alert></div>}
      {b.carried_forward_to_id && (
        <div className="mb-4"><Alert tone="info">The unpaid balance of this bill was carried forward to <Link className="font-semibold underline" to={`/app/bills/${b.carried_forward_to_id}`}>{b.carried_forward_to_invoice}</Link>. Collect payment on that bill.</Alert></div>
      )}
      {b.status === "draft" && <div className="mb-4"><Alert tone="warn">Draft bill: not visible to the customer until it is issued. Figures are recalculated on issue.</Alert></div>}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card>
            <CardHeader title="Charges breakdown" subtitle={`Tariff: ${b.tariff_name} (rates frozen at generation)`} />
            <div className="grid grid-cols-3 gap-2 border-b border-line bg-slate-50/60 px-5 py-3 text-center text-xs">
              <div><p className="text-ink-muted">Previous reading</p><p className="text-sm font-semibold tabular-nums">{number(b.previous_reading)}</p></div>
              <div><p className="text-ink-muted">Current reading</p><p className="text-sm font-semibold tabular-nums">{number(b.current_reading)}</p></div>
              <div><p className="text-ink-muted">Units consumed</p><p className="text-sm font-semibold tabular-nums text-brand-700">{number(b.units_consumed)} kWh</p></div>
            </div>
            <table className="w-full text-sm">
              <thead className="text-xs text-ink-muted"><tr><th className="px-5 py-2 text-left font-medium">Description</th><th className="px-5 py-2 text-right font-medium">Amount</th></tr></thead>
              <tbody className="divide-y divide-line">
                {b.items?.map((it, i) => <tr key={i}><td className="px-5 py-2.5 text-ink-soft">{it.description}</td><td className={`px-5 py-2.5 text-right tabular-nums ${it.amount < 0 ? "text-ok-700" : ""}`}>{money(it.amount)}</td></tr>)}
                <tr className="bg-slate-50"><td className="px-5 py-3 font-semibold">Total amount</td><td className="px-5 py-3 text-right text-base font-semibold tabular-nums">{money(b.total_amount)}</td></tr>
                <tr><td className="px-5 py-2 text-ink-soft">Amount paid</td><td className="px-5 py-2 text-right tabular-nums text-ok-700">- {money(b.amount_paid)}</td></tr>
                <tr><td className="px-5 py-3 font-semibold">Balance due</td><td className="px-5 py-3 text-right text-base font-semibold tabular-nums text-bad-700">{money(b.carried_forward_to_id ? 0 : b.balance_due)}</td></tr>
              </tbody>
            </table>
          </Card>
          <Card>
            <CardHeader title="Payments" />
            {!b.payments?.length ? <p className="px-5 py-6 text-sm text-ink-muted">No payments recorded for this bill.</p> : (
              <ul className="divide-y divide-line">
                {b.payments.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                    <div><p className="font-mono text-xs text-ink">{p.transaction_id}</p><p className="text-xs text-ink-muted">{dateTime(p.payment_date)} · {METHOD_LABELS[p.method]}</p></div>
                    <div className="flex items-center gap-3">
                      <span className="font-medium tabular-nums">{money(p.amount)}</span><StatusBadge status={p.status} />
                      {p.receipt_number && <Button size="sm" variant="ghost" icon={<FileDown className="h-3.5 w-3.5" />} onClick={() => downloadFile(`/api/payments/${p.id}/receipt`)}>Receipt</Button>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Bill information" />
            <CardBody>
              <InfoGrid cols={2} items={[
                { label: "Invoice", value: b.invoice_number }, { label: "Period", value: period(b.billing_period) },
                { label: "Issue date", value: date(b.issue_date) }, { label: "Due date", value: date(b.due_date) },
                { label: "Status", value: <StatusBadge status={b.status} carried={!!b.carried_forward_to_id} /> }, { label: "Total", value: money(b.total_amount) },
              ]} />
              {b.carried_from && b.carried_from.length > 0 && (
                <p className="mt-4 text-xs text-ink-muted">Includes balance from: {b.carried_from.map((x, i) => <Link key={x.id} to={`/app/bills/${x.id}`} className="text-brand-600">{i ? ", " : ""}{x.invoice_number}</Link>)}</p>
              )}
              {b.remarks && <p className="mt-4 text-xs text-ink-muted">Remarks: {b.remarks}</p>}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Customer & connection" />
            <CardBody>
              <p className="font-semibold text-ink">{b.customer_name}</p>
              <p className="text-xs text-ink-muted">{b.customer_code}</p>
              <p className="mt-3 text-sm text-ink-soft">{b.customer_address}</p>
              <p className="mt-1 text-sm text-ink-soft">{b.customer_phone}</p>
              <div className="mt-4 border-t border-line pt-4">
                <InfoGrid items={[{ label: "Connection", value: b.connection_code }, { label: "Meter", value: b.meter_number }]} />
              </div>
              <div className="mt-4 flex gap-2">
                <Link to={`/app/customers/${b.customer_id}`}><Button size="sm" variant="outline">Customer</Button></Link>
                <Link to={`/app/connections/${b.connection_id}`}><Button size="sm" variant="outline">Connection</Button></Link>
              </div>
            </CardBody>
          </Card>
        </div>
      </div>

      <ConfirmDialog open={modal === "cancel"} onClose={() => setModal("")} loading={busy} title="Cancel this bill?" confirmLabel="Cancel bill" reasonLabel="Cancellation reason"
        message={<>Bill <b>{b.invoice_number}</b> will be cancelled. You can then correct the reading and generate a new bill for {period(b.billing_period)}.</>}
        onConfirm={(reason) => act(() => api.post(`/api/bills/${b.id}/cancel`, { reason }), "Bill cancelled")} />

      <Modal open={modal === "pay"} onClose={() => setModal("")} title="Record payment" subtitle={`Balance due: ${money(b.balance_due)}`}
        footer={<>
          <Button variant="outline" onClick={() => setModal("")}>Cancel</Button>
          <Button variant="outline" icon={<CheckCircle2 className="h-4 w-4" />} loading={busy} onClick={() => act(() => api.post(`/api/payments/mark-paid/${b.id}`, { method: pay.method, remarks: pay.remarks || null }), "Bill marked as paid")}>Mark fully paid</Button>
          <Button variant="success" loading={busy} onClick={() => act(() => api.post("/api/payments", { bill_id: b.id, amount: Number(pay.amount), method: pay.method, remarks: pay.remarks || null }), "Payment recorded")}>Record amount</Button>
        </>}>
        <div className="space-y-4">
          <Field label="Amount (Rs)" hint="Partial payments are allowed."><Input type="number" min="1" max={b.balance_due} step="0.01" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} /></Field>
          <Field label="Method"><Select value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })} options={Object.entries(METHOD_LABELS).map(([v, l]) => ({ value: v, label: l }))} /></Field>
          <Field label="Remarks"><Textarea rows={2} value={pay.remarks} onChange={(e) => setPay({ ...pay, remarks: e.target.value })} /></Field>
        </div>
      </Modal>

      <Modal open={modal === "draft"} onClose={() => setModal("")} title="Edit draft bill"
        footer={<><Button variant="outline" onClick={() => setModal("")}>Cancel</Button><Button loading={busy} onClick={() => act(() => api.put(`/api/bills/${b.id}`, { discount: Number(draft.discount || 0), extra_charges: Number(draft.extra_charges || 0), remarks: draft.remarks }), "Draft recalculated")}>Save & recalculate</Button></>}>
        <div className="space-y-4">
          <Field label="Discount (Rs)"><Input type="number" min="0" step="0.01" value={draft.discount} onChange={(e) => setDraft({ ...draft, discount: e.target.value })} /></Field>
          <Field label="Extra charges (Rs)" hint="On top of the tariff's own additional charges"><Input type="number" min="0" step="0.01" value={draft.extra_charges} onChange={(e) => setDraft({ ...draft, extra_charges: e.target.value })} /></Field>
          <Field label="Remarks"><Textarea rows={2} value={draft.remarks} onChange={(e) => setDraft({ ...draft, remarks: e.target.value })} /></Field>
        </div>
      </Modal>
    </div>
  );
}
