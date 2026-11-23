import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Gauge, Save } from "lucide-react";
import { toast } from "sonner";
import { api, errorMessage } from "@/services/api";
import { useApi, useDebounce } from "@/hooks/useApi";
import { Card, CardBody, CardHeader, PageHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Form";
import { Alert } from "@/components/ui/States";
import type { Connection, Page } from "@/types";
import { currentPeriod, number, todayISO } from "@/utils/format";

interface NextInfo { connection_code: string; meter_number: string; customer_name: string; previous_reading: number; already_recorded: boolean }

export default function AddReading() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const dq = useDebounce(q);
  const [connectionId, setConnectionId] = useState(params.get("connection") ?? "");
  const [billingPeriod, setBillingPeriod] = useState(currentPeriod(-1));
  const [current, setCurrent] = useState("");
  const [readingDate, setReadingDate] = useState(todayISO());
  const [remarks, setRemarks] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [andBill, setAndBill] = useState(false);

  const { data: conns } = useApi<Page<Connection>>("/api/connections", { search: dq, status: "active", page_size: 25, sort_by: "connection_code", sort_dir: "asc" });
  const { data: info, loading: infoLoading } = useApi<NextInfo>(connectionId && billingPeriod ? "/api/readings/next" : null, { connection_id: connectionId, billing_period: billingPeriod });
  const { data: preselected } = useApi<Connection>(params.get("connection") ? `/api/connections/${params.get("connection")}` : null);

  useEffect(() => setError(null), [connectionId, billingPeriod, current]);

  const prev = info?.previous_reading ?? 0;
  const cur = Number(current);
  const units = current !== "" ? cur - prev : null;
  const invalid = units !== null && units < 0;
  const options = [...(conns?.items ?? [])];
  if (preselected && !options.some((c) => c.id === preselected.id)) options.unshift(preselected);

  const submit = async () => {
    setError(null);
    if (!connectionId) return setError("Choose a connection.");
    if (current === "" || isNaN(cur)) return setError("Enter the current meter reading.");
    if (invalid) return setError(`Current reading cannot be lower than the previous reading (${number(prev)}).`);
    setBusy(true);
    try {
      const { data } = await api.post("/api/readings", {
        connection_id: Number(connectionId), billing_period: billingPeriod, current_reading: cur, reading_date: readingDate, reading_type: "manual", remarks: remarks || null,
      });
      toast.success(`Reading saved: ${number(data.units_consumed)} units`);
      if (andBill) {
        const bill = await api.post("/api/billing/generate", { reading_id: data.id });
        toast.success(`Bill ${bill.data.invoice_number} generated`);
        navigate(`/app/bills/${bill.data.id}`);
      } else {
        navigate("/app/readings");
      }
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader back={<Link to="/app/readings" className="mb-2 inline-flex items-center gap-1 text-xs font-medium text-ink-muted hover:text-ink"><ArrowLeft className="h-3.5 w-3.5" /> Meter readings</Link>}
        title="Add meter reading" subtitle="The previous reading is filled in automatically from the last recorded reading." />
      <Card>
        <CardHeader title="Reading details" />
        <CardBody className="space-y-4">
          {error && <Alert tone="error">{error}</Alert>}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Find connection"><Input placeholder="Connection, meter or customer..." value={q} onChange={(e) => setQ(e.target.value)} /></Field>
            <Field label="Connection" required>
              <Select placeholder="Select connection" value={connectionId} onChange={(e) => setConnectionId(e.target.value)}
                options={options.map((c) => ({ value: c.id, label: `${c.connection_code} · ${c.customer_name} · ${c.meter_number}` }))} />
            </Field>
            <Field label="Billing period" required><Input type="month" max={currentPeriod(0)} value={billingPeriod} onChange={(e) => setBillingPeriod(e.target.value)} /></Field>
            <Field label="Reading date" required><Input type="date" max={todayISO()} value={readingDate} onChange={(e) => setReadingDate(e.target.value)} /></Field>
          </div>

          {info && info.already_recorded && <Alert tone="warn">A reading for {info.connection_code} in this period already exists. Duplicate readings are not allowed.</Alert>}

          <div className="grid grid-cols-1 gap-4 rounded-xl border border-line bg-slate-50/60 p-4 sm:grid-cols-3">
            <Field label="Previous reading"><Input disabled value={connectionId ? (infoLoading ? "..." : number(prev)) : "-"} /></Field>
            <Field label="Current reading" required error={invalid ? "Lower than previous" : undefined}>
              <Input type="number" step="0.01" min={prev} invalid={invalid} value={current} onChange={(e) => setCurrent(e.target.value)} />
            </Field>
            <div>
              <p className="label">Units consumed</p>
              <div className={`flex h-10 items-center gap-2 rounded-lg px-3 text-lg font-semibold tabular-nums ${invalid ? "bg-bad-50 text-bad-700" : "bg-white text-ink"}`}>
                <Gauge className="h-4 w-4 text-ink-faint" /> {units === null ? "-" : `${number(units)} kWh`}
              </div>
            </div>
          </div>
          <Field label="Remarks"><Textarea rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Optional notes (e.g. meter accessible, photo taken)" /></Field>
          <label className="flex items-center gap-2 text-sm text-ink-soft">
            <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={andBill} onChange={(e) => setAndBill(e.target.checked)} />
            Generate the bill for this reading right away
          </label>
          <div className="flex justify-end gap-2 border-t border-line pt-4">
            <Button variant="outline" onClick={() => navigate(-1)}>Cancel</Button>
            <Button loading={busy} disabled={invalid || info?.already_recorded} onClick={submit} icon={<Save className="h-4 w-4" />}>Save reading</Button>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
