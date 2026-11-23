import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { BellRing, CalendarRange, Eye, FileText, ListChecks, Zap } from "lucide-react";
import { toast } from "sonner";
import { api, errorMessage } from "@/services/api";
import { useApi, useDebounce } from "@/hooks/useApi";
import { Card, CardBody, CardHeader, PageHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Form";
import { Alert, EmptyState } from "@/components/ui/States";
import { Badge } from "@/components/ui/Badge";
import type { BillItem, Connection, Page } from "@/types";
import { currentPeriod, date, money, number, period } from "@/utils/format";

interface Preview {
  customer: { id: number; code: string; name: string };
  connection: { id: number; code: string; meter_number: string };
  billing_period: string; previous_reading: number; current_reading: number; units_consumed: number;
  tariff: { name: string; billing_method: string }; issue_date: string; due_date: string; carried_forward_invoices: string[];
  consumption_charge: number; fixed_charge: number; additional_charges: number; tax_amount: number; late_fee: number; discount: number;
  previous_outstanding: number; total_amount: number; items: BillItem[];
}
interface MonthlyResult {
  billing_period: string;
  created: { connection: string; invoice_number: string; total_amount: number }[];
  skipped: { connection: string; reason: string }[];
  failed: { connection: string; reason: string }[];
  missing_readings: { connection: string; reason: string }[];
}

export default function BillingDashboard() {
  return (
    <div>
      <PageHeader title="Billing & Invoices" subtitle="Bills are calculated on the server from meter readings and the tariff assigned to each connection."
        actions={<Link to="/app/bills"><Button variant="outline" icon={<ListChecks className="h-4 w-4" />}>All bills</Button></Link>} />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
        <div className="xl:col-span-3"><SingleBill /></div>
        <div className="space-y-6 xl:col-span-2">
          <MonthlyRun />
          <Reminders />
        </div>
      </div>
    </div>
  );
}

function SingleBill() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const dq = useDebounce(q);
  const { data: conns } = useApi<Page<Connection>>("/api/connections", { search: dq, page_size: 25, sort_by: "connection_code", sort_dir: "asc" });
  const [connectionId, setConnectionId] = useState("");
  const [p, setP] = useState(currentPeriod(-1));
  const [discount, setDiscount] = useState("0");
  const [extra, setExtra] = useState("0");
  const [remarks, setRemarks] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<"" | "preview" | "generate" | "draft">("");

  const body = () => ({ connection_id: Number(connectionId), billing_period: p, discount: Number(discount || 0), extra_charges: Number(extra || 0), remarks: remarks || null });
  const doPreview = async () => {
    setErr(null);
    setPreview(null);
    if (!connectionId) return setErr("Choose a connection.");
    setBusy("preview");
    try {
      const { data } = await api.post<Preview>("/api/billing/preview", body());
      setPreview(data);
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy("");
    }
  };
  const generate = async (asDraft: boolean) => {
    setBusy(asDraft ? "draft" : "generate");
    try {
      const { data } = await api.post("/api/billing/generate", { ...body(), as_draft: asDraft, notify: true });
      toast.success(asDraft ? `Draft ${data.invoice_number} saved` : `Bill ${data.invoice_number} generated`);
      navigate(`/app/bills/${data.id}`);
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy("");
    }
  };

  return (
    <Card>
      <CardHeader title="Generate bill for a customer" subtitle="Preview the calculation before issuing the invoice." />
      <CardBody className="space-y-4">
        {err && <Alert tone="error">{err}</Alert>}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Find connection"><Input placeholder="Connection, meter or customer..." value={q} onChange={(e) => setQ(e.target.value)} /></Field>
          <Field label="Connection" required>
            <Select placeholder="Select connection" value={connectionId} onChange={(e) => { setConnectionId(e.target.value); setPreview(null); }}
              options={(conns?.items ?? []).map((c) => ({ value: c.id, label: `${c.connection_code} · ${c.customer_name}` }))} />
          </Field>
          <Field label="Billing period" required><Input type="month" max={currentPeriod(0)} value={p} onChange={(e) => { setP(e.target.value); setPreview(null); }} /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Discount (Rs)"><Input type="number" min="0" step="0.01" value={discount} onChange={(e) => { setDiscount(e.target.value); setPreview(null); }} /></Field>
            <Field label="Extra charges (Rs)"><Input type="number" min="0" step="0.01" value={extra} onChange={(e) => { setExtra(e.target.value); setPreview(null); }} /></Field>
          </div>
          <Field label="Remarks" className="sm:col-span-2"><Textarea rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} /></Field>
        </div>
        <div className="flex justify-end">
          <Button variant="outline" loading={busy === "preview"} icon={<Eye className="h-4 w-4" />} onClick={doPreview}>Preview bill</Button>
        </div>

        {preview && (
          <div className="rounded-xl border border-brand-200 bg-brand-50/30">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-brand-100 px-4 py-3">
              <div>
                <p className="font-semibold text-ink">{preview.customer.name} <span className="font-normal text-ink-muted">({preview.customer.code})</span></p>
                <p className="text-xs text-ink-muted">{preview.connection.code} · Meter {preview.connection.meter_number} · {period(preview.billing_period)} · {preview.tariff.name}</p>
              </div>
              <Badge tone="blue">Preview</Badge>
            </div>
            <div className="grid grid-cols-3 gap-2 border-b border-brand-100 px-4 py-3 text-center text-xs">
              <div><p className="text-ink-muted">Previous</p><p className="font-semibold tabular-nums">{number(preview.previous_reading)}</p></div>
              <div><p className="text-ink-muted">Current</p><p className="font-semibold tabular-nums">{number(preview.current_reading)}</p></div>
              <div><p className="text-ink-muted">Units</p><p className="font-semibold tabular-nums text-brand-700">{number(preview.units_consumed)} kWh</p></div>
            </div>
            <table className="w-full text-sm">
              <tbody className="divide-y divide-brand-100">
                {preview.items.map((it, i) => (
                  <tr key={i}><td className="px-4 py-2 text-ink-soft">{it.description}</td><td className="px-4 py-2 text-right tabular-nums">{money(it.amount)}</td></tr>
                ))}
                <tr className="bg-white/60"><td className="px-4 py-2.5 font-semibold">Total payable</td><td className="px-4 py-2.5 text-right text-base font-semibold tabular-nums text-ink">{money(preview.total_amount)}</td></tr>
              </tbody>
            </table>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-brand-100 px-4 py-3">
              <p className="text-xs text-ink-muted">Issue {date(preview.issue_date)} · Due {date(preview.due_date)}{preview.carried_forward_invoices.length > 0 && ` · Carries forward ${preview.carried_forward_invoices.join(", ")}`}</p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" loading={busy === "draft"} onClick={() => generate(true)}>Save as draft</Button>
                <Button size="sm" loading={busy === "generate"} icon={<FileText className="h-3.5 w-3.5" />} onClick={() => generate(false)}>Generate & notify</Button>
              </div>
            </div>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function MonthlyRun() {
  const [p, setP] = useState(currentPeriod(-1));
  const [notify, setNotify] = useState(true);
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<MonthlyResult | null>(null);
  const run = async () => {
    setBusy(true);
    setRes(null);
    try {
      const { data } = await api.post<MonthlyResult>("/api/billing/generate-monthly", { billing_period: p, notify });
      setRes(data);
      toast.success(`${data.created.length} bills generated for ${period(p)}`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card>
      <CardHeader title="Monthly billing run" subtitle="Bills every reading in the month that has no bill yet." />
      <CardBody className="space-y-4">
        <Field label="Billing period"><Input type="month" max={currentPeriod(0)} value={p} onChange={(e) => setP(e.target.value)} /></Field>
        <label className="flex items-center gap-2 text-sm text-ink-soft"><input type="checkbox" className="h-4 w-4 accent-brand-600" checked={notify} onChange={(e) => setNotify(e.target.checked)} /> Notify customers</label>
        <Button className="w-full" loading={busy} icon={<CalendarRange className="h-4 w-4" />} onClick={run}>Generate monthly bills</Button>
        {res && (
          <div className="space-y-2 text-sm">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-lg bg-ok-50 p-2"><p className="text-lg font-semibold text-ok-700">{res.created.length}</p><p className="text-[11px] text-ok-700">Created</p></div>
              <div className="rounded-lg bg-slate-100 p-2"><p className="text-lg font-semibold text-ink-soft">{res.skipped.length}</p><p className="text-[11px] text-ink-muted">Already billed</p></div>
              <div className="rounded-lg bg-warn-50 p-2"><p className="text-lg font-semibold text-warn-700">{res.failed.length + res.missing_readings.length}</p><p className="text-[11px] text-warn-700">Need attention</p></div>
            </div>
            {[...res.failed, ...res.missing_readings].length > 0 && (
              <ul className="max-h-40 overflow-auto rounded-lg border border-line text-xs">
                {[...res.failed, ...res.missing_readings].map((x, i) => <li key={i} className="border-b border-line px-3 py-1.5 last:border-0"><b>{x.connection}</b>: {x.reason}</li>)}
              </ul>
            )}
            {res.created.length === 0 && res.failed.length === 0 && <EmptyState icon={<Zap className="h-6 w-6" />} title="Nothing new to bill" message="Enter or simulate readings for this month first." />}
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function Reminders() {
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      const { data } = await api.post("/api/billing/run-reminders");
      toast.success(`${data.marked_overdue} bills marked overdue, ${data.due_soon_reminders} due-soon reminders sent`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card>
      <CardHeader title="Due-date reminders" subtitle="Marks past-due bills overdue and reminds customers whose bills are due soon." />
      <CardBody><Button variant="outline" className="w-full" loading={busy} icon={<BellRing className="h-4 w-4" />} onClick={run}>Run reminders now</Button></CardBody>
    </Card>
  );
}
