import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Gauge, History, Pencil, Power, Tags } from "lucide-react";
import { toast } from "sonner";
import { api, errorMessage } from "@/services/api";
import { useApi } from "@/hooks/useApi";
import { Card, CardBody, CardHeader, InfoGrid, PageHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { StatusBadge, TypeBadge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { Field, Input, Select, Textarea } from "@/components/ui/Form";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { EmptyState, ErrorState, LoadingBlock } from "@/components/ui/States";
import type { AuditEntry, Connection, Page, Reading, Tariff } from "@/types";
import { date, dateTime, number, period } from "@/utils/format";

export default function ConnectionDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: c, loading, error, reload, setData } = useApi<Connection>(`/api/connections/${id}`);
  const { data: history, reload: reloadHistory } = useApi<AuditEntry[]>(`/api/connections/${id}/history`);
  const { data: readings } = useApi<Page<Reading>>("/api/readings", { connection_id: id, page_size: 12 });
  const { data: tariffs } = useApi<Tariff[]>("/api/tariffs", { status: "active" });
  const [modal, setModal] = useState<"status" | "tariff" | "edit" | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!c || !modal) return;
    if (modal === "status") setForm({ status: c.status === "active" ? "suspended" : "active", reason: "" });
    if (modal === "tariff") setForm({ tariff_plan_id: "", reason: "" });
    if (modal === "edit") setForm({ connection_type: c.connection_type, sanctioned_load_kw: String(c.sanctioned_load_kw), address: c.address, meter_status: c.meter_status });
  }, [modal, c]);

  if (loading && !c) return <LoadingBlock />;
  if (error || !c) return <ErrorState message={error ?? "Not found"} onRetry={reload} />;

  const save = async () => {
    setBusy(true);
    try {
      let res;
      if (modal === "status") res = await api.put(`/api/connections/${c.id}/status`, form);
      else if (modal === "tariff") res = await api.put(`/api/connections/${c.id}/tariff`, { tariff_plan_id: Number(form.tariff_plan_id), reason: form.reason || null });
      else res = await api.put(`/api/connections/${c.id}`, { ...form, sanctioned_load_kw: Number(form.sanctioned_load_kw) });
      setData(res.data);
      toast.success("Connection updated");
      setModal(null);
      reloadHistory();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const f = (k: string) => ({ value: form[k] ?? "", onChange: (e: { target: { value: string } }) => setForm((s) => ({ ...s, [k]: e.target.value })) });

  const readingCols: Column<Reading>[] = [
    { key: "billing_period", header: "Period", render: (r) => period(r.billing_period) },
    { key: "previous_reading", header: "Previous", align: "right", render: (r) => number(r.previous_reading) },
    { key: "current_reading", header: "Current", align: "right", render: (r) => number(r.current_reading) },
    { key: "units_consumed", header: "Units", align: "right", render: (r) => <b className="text-ink">{number(r.units_consumed)}</b> },
    { key: "reading_type", header: "Type", render: (r) => <span className="capitalize">{r.reading_type}</span> },
    { key: "reading_date", header: "Date", render: (r) => date(r.reading_date) },
  ];

  return (
    <div>
      <PageHeader
        back={<Link to="/app/connections" className="mb-2 inline-flex items-center gap-1 text-xs font-medium text-ink-muted hover:text-ink"><ArrowLeft className="h-3.5 w-3.5" /> Connections</Link>}
        title={`Connection ${c.connection_code}`}
        subtitle={<span className="flex items-center gap-2">Meter {c.meter_number} <StatusBadge status={c.status} /></span>}
        actions={
          <>
            <Button variant="outline" icon={<Pencil className="h-4 w-4" />} onClick={() => setModal("edit")}>Edit</Button>
            <Button variant="outline" icon={<Tags className="h-4 w-4" />} onClick={() => setModal("tariff")}>Change tariff</Button>
            <Button variant={c.status === "active" ? "danger" : "success"} icon={<Power className="h-4 w-4" />} onClick={() => setModal("status")}>
              {c.status === "active" ? "Deactivate" : "Activate"}
            </Button>
          </>
        }
      />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Connection details" />
          <CardBody>
            <InfoGrid cols={3} items={[
              { label: "Connection ID", value: c.connection_code },
              { label: "Connection type", value: <TypeBadge type={c.connection_type} /> },
              { label: "Status", value: <StatusBadge status={c.status} /> },
              { label: "Meter number", value: c.meter_number },
              { label: "Meter status", value: <StatusBadge status={c.meter_status} /> },
              { label: "Meter make", value: c.meter_manufacturer ?? "-" },
              { label: "Sanctioned load", value: `${c.sanctioned_load_kw} kW` },
              { label: "Tariff", value: c.tariff_plan },
              { label: "Installation date", value: date(c.installation_date) },
              { label: "Initial reading", value: number(c.initial_reading) },
              { label: "Supply address", value: c.address },
            ]} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Customer" />
          <CardBody>
            <p className="font-semibold text-ink">{c.customer_name}</p>
            <p className="text-xs text-ink-muted">{c.customer_code}</p>
            <Button variant="outline" size="sm" className="mt-4" onClick={() => navigate(`/app/customers/${c.customer_id}`)}>View customer profile</Button>
            <Button variant="outline" size="sm" className="ml-2 mt-4" icon={<Gauge className="h-3.5 w-3.5" />} onClick={() => navigate(`/app/readings/new?connection=${c.id}`)}>Add reading</Button>
          </CardBody>
        </Card>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader title="Recent meter readings" />
          <DataTable columns={readingCols} rows={readings?.items} empty={<EmptyState title="No readings yet" />} />
        </Card>
        <Card>
          <CardHeader title="Connection history" subtitle="Status, tariff and detail changes" />
          <CardBody>
            {!history?.length ? (
              <EmptyState icon={<History className="h-6 w-6" />} title="No changes recorded" />
            ) : (
              <ol className="relative space-y-4 border-l border-line pl-5">
                {history.map((h, i) => (
                  <li key={i}>
                    <span className="absolute -left-[5px] mt-1.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-brand-600" />
                    <p className="text-sm font-medium text-ink">{h.summary}</p>
                    <p className="text-xs text-ink-muted">{h.by} · {dateTime(h.created_at)}</p>
                  </li>
                ))}
              </ol>
            )}
          </CardBody>
        </Card>
      </div>

      <Modal open={!!modal} onClose={() => setModal(null)} size="md"
        title={modal === "status" ? "Change connection status" : modal === "tariff" ? "Change tariff" : "Edit connection"}
        footer={<><Button variant="outline" onClick={() => setModal(null)}>Cancel</Button><Button loading={busy} onClick={save}>Save</Button></>}>
        <div className="space-y-4">
          {modal === "status" && (
            <>
              <Field label="New status"><Select {...f("status")} options={["active", "pending", "suspended", "disconnected"].filter((s) => s !== c.status).map((s) => ({ value: s, label: s[0].toUpperCase() + s.slice(1) }))} /></Field>
              <Field label="Reason" required hint="The customer is notified of this change."><Textarea {...f("reason")} rows={3} /></Field>
            </>
          )}
          {modal === "tariff" && (
            <>
              <p className="text-xs text-ink-muted">Current tariff: <b className="text-ink">{c.tariff_plan}</b>. Issued bills keep their original rates.</p>
              <Field label="New tariff" required>
                <Select placeholder="Select tariff" {...f("tariff_plan_id")} options={(tariffs ?? []).filter((t) => t.id !== c.tariff_plan_id).map((t) => ({ value: t.id, label: `${t.name} (${t.customer_category})` }))} />
              </Field>
              <Field label="Reason"><Input {...f("reason")} /></Field>
            </>
          )}
          {modal === "edit" && (
            <>
              <Field label="Connection type"><Select {...f("connection_type")} options={["residential", "commercial", "industrial"].map((s) => ({ value: s, label: s[0].toUpperCase() + s.slice(1) }))} /></Field>
              <Field label="Sanctioned load (kW)"><Input type="number" step="0.1" {...f("sanctioned_load_kw")} /></Field>
              <Field label="Meter status"><Select {...f("meter_status")} options={["working", "faulty", "replaced", "removed"].map((s) => ({ value: s, label: s[0].toUpperCase() + s.slice(1) }))} /></Field>
              <Field label="Supply address"><Textarea {...f("address")} rows={2} /></Field>
            </>
          )}
        </div>
      </Modal>
    </div>
  );
}
