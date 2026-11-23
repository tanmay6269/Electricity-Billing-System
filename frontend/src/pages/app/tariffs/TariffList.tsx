import { useEffect, useState } from "react";
import { Calculator, History, Pencil, Plus, Power, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, errorMessage } from "@/services/api";
import { useApi } from "@/hooks/useApi";
import { useAuth } from "@/context/AuthContext";
import { Card, CardBody, PageHeader } from "@/components/ui/Card";
import { Button, IconButton } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Form";
import { Badge, StatusBadge, TypeBadge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { Alert, EmptyState, ErrorState, LoadingBlock } from "@/components/ui/States";
import type { AuditEntry, BillItem, Slab, Tariff } from "@/types";
import { date, dateTime, money, todayISO } from "@/utils/format";

interface FormState {
  code: string; name: string; customer_category: string; billing_method: "slab" | "flat"; flat_rate: string; fixed_charge: string; tax_rate: string;
  additional_charges: string; additional_charges_label: string; effective_from: string; effective_to: string; status: string; description: string; slabs: { from_unit: string; to_unit: string; rate: string }[];
}
const EMPTY: FormState = {
  code: "", name: "", customer_category: "residential", billing_method: "slab", flat_rate: "", fixed_charge: "0", tax_rate: "5", additional_charges: "0",
  additional_charges_label: "", effective_from: todayISO(), effective_to: "", status: "active", description: "",
  slabs: [{ from_unit: "0", to_unit: "100", rate: "4" }, { from_unit: "100", to_unit: "", rate: "6" }],
};

function slabLabel(s: Slab) {
  return s.to_unit == null ? `Above ${s.from_unit}` : `${s.from_unit === 0 ? 0 : s.from_unit + 1}-${s.to_unit}`;
}

export default function TariffList() {
  const { user } = useAuth();
  const [cat, setCat] = useState("");
  const [status, setStatus] = useState("");
  const { data, loading, error, reload } = useApi<Tariff[]>("/api/tariffs", { customer_category: cat, status });
  const { data: settings } = useApi<{ settings: { key: string; value: string }[] }>("/api/settings");
  const canManage = user?.role === "admin" || settings?.settings.find((s) => s.key === "staff_can_manage_tariffs")?.value === "true";
  const [editing, setEditing] = useState<Tariff | "new" | null>(null);
  const [historyFor, setHistoryFor] = useState<Tariff | null>(null);
  const [calcFor, setCalcFor] = useState<Tariff | null>(null);

  const toggle = async (t: Tariff) => {
    try {
      await api.put(`/api/tariffs/${t.id}/status`, { status: t.status === "active" ? "inactive" : "active" });
      toast.success(`Tariff ${t.status === "active" ? "deactivated" : "activated"}`);
      reload();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <div>
      <PageHeader title="Tariff Management" subtitle="Tariffs drive the billing engine. Changes apply to future bills only - issued invoices keep their frozen rates."
        actions={canManage ? <Button icon={<Plus className="h-4 w-4" />} onClick={() => setEditing("new")}>New tariff</Button> : undefined} />
      {!canManage && <div className="mb-4"><Alert tone="info">You can view tariffs. Only administrators (or staff when allowed in Settings) can change them.</Alert></div>}
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <Select className="sm:w-48" value={cat} onChange={(e) => setCat(e.target.value)} placeholder="All categories"
          options={["residential", "commercial", "industrial"].map((s) => ({ value: s, label: s[0].toUpperCase() + s.slice(1) }))} />
        <Select className="sm:w-40" value={status} onChange={(e) => setStatus(e.target.value)} placeholder="All statuses" options={[{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }]} />
      </div>
      {error ? <ErrorState message={error} onRetry={reload} /> : loading && !data ? <LoadingBlock /> : !data?.length ? <EmptyState title="No tariffs" /> : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 2xl:grid-cols-3">
          {data.map((t) => (
            <Card key={t.id} className={t.status !== "active" ? "opacity-75" : ""}>
              <div className="flex items-start justify-between gap-3 border-b border-line px-5 py-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2"><h3 className="text-[15px]">{t.name}</h3><StatusBadge status={t.status} /></div>
                  <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-muted">{t.code} <TypeBadge type={t.customer_category} /> <Badge tone="navy">{t.billing_method === "slab" ? "Slab-based" : "Flat rate"}</Badge></p>
                </div>
                <div className="flex shrink-0">
                  <IconButton label="Bill estimator" onClick={() => setCalcFor(t)}><Calculator className="h-4 w-4" /></IconButton>
                  <IconButton label="History" onClick={() => setHistoryFor(t)}><History className="h-4 w-4" /></IconButton>
                  {canManage && <IconButton label="Edit" onClick={() => setEditing(t)}><Pencil className="h-4 w-4" /></IconButton>}
                  {canManage && <IconButton label={t.status === "active" ? "Deactivate" : "Activate"} onClick={() => toggle(t)}><Power className="h-4 w-4" /></IconButton>}
                </div>
              </div>
              <CardBody className="space-y-4">
                {t.billing_method === "slab" ? (
                  <table className="w-full text-sm">
                    <thead><tr className="text-xs text-ink-muted"><th className="pb-1.5 text-left font-medium">Units</th><th className="pb-1.5 text-right font-medium">Rate / unit</th></tr></thead>
                    <tbody className="divide-y divide-line">
                      {t.slabs.map((s) => <tr key={s.id}><td className="py-1.5 text-ink-soft">{slabLabel(s)}</td><td className="py-1.5 text-right font-medium tabular-nums">{money(s.rate)}</td></tr>)}
                    </tbody>
                  </table>
                ) : (
                  <p className="text-sm">Flat energy charge: <b>{money(t.flat_rate)}</b> per unit</p>
                )}
                <div className="grid grid-cols-3 gap-2 rounded-lg bg-slate-50 p-3 text-center">
                  <div><p className="text-[11px] text-ink-muted">Fixed charge</p><p className="font-semibold tabular-nums">{money(t.fixed_charge)}</p></div>
                  <div><p className="text-[11px] text-ink-muted">Electricity duty</p><p className="font-semibold tabular-nums">{t.tax_rate}%</p></div>
                  <div><p className="text-[11px] text-ink-muted">{t.additional_charges_label || "Additional"}</p><p className="font-semibold tabular-nums">{money(t.additional_charges)}</p></div>
                </div>
                <div className="flex flex-wrap justify-between gap-2 text-xs text-ink-muted">
                  <span>Effective {date(t.effective_from)}{t.effective_to ? ` to ${date(t.effective_to)}` : ""}</span>
                  <span>{t.connections_using ?? 0} connections</span>
                </div>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
      <TariffFormModal tariff={editing} onClose={() => setEditing(null)} onSaved={reload} />
      <HistoryModal tariff={historyFor} onClose={() => setHistoryFor(null)} />
      <CalculatorModal tariff={calcFor} onClose={() => setCalcFor(null)} />
    </div>
  );
}

function TariffFormModal({ tariff, onClose, onSaved }: { tariff: Tariff | "new" | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<FormState>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    setErr(null);
    if (tariff === "new") setF(EMPTY);
    else if (tariff) setF({
      code: tariff.code, name: tariff.name, customer_category: tariff.customer_category, billing_method: tariff.billing_method, flat_rate: tariff.flat_rate?.toString() ?? "",
      fixed_charge: String(tariff.fixed_charge), tax_rate: String(tariff.tax_rate), additional_charges: String(tariff.additional_charges), additional_charges_label: tariff.additional_charges_label ?? "",
      effective_from: tariff.effective_from, effective_to: tariff.effective_to ?? "", status: tariff.status, description: tariff.description ?? "",
      slabs: tariff.slabs.map((s) => ({ from_unit: String(s.from_unit), to_unit: s.to_unit == null ? "" : String(s.to_unit), rate: String(s.rate) })),
    });
  }, [tariff]);
  const set = (k: keyof FormState) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));
  const setSlab = (i: number, k: "from_unit" | "to_unit" | "rate", v: string) => setF((s) => {
    const slabs = s.slabs.map((x, j) => (j === i ? { ...x, [k]: v } : x));
    if (k === "to_unit" && slabs[i + 1]) slabs[i + 1] = { ...slabs[i + 1], from_unit: v };
    return { ...s, slabs };
  });
  const addSlab = () => setF((s) => {
    const last = s.slabs[s.slabs.length - 1];
    const lastFrom = Number(last?.from_unit || 0);
    const newTo = String(lastFrom + 100);
    const slabs = s.slabs.map((x, j) => (j === s.slabs.length - 1 ? { ...x, to_unit: x.to_unit || newTo } : x));
    return { ...s, slabs: [...slabs, { from_unit: slabs[slabs.length - 1]?.to_unit || "0", to_unit: "", rate: "" }] };
  });

  const save = async () => {
    setErr(null);
    setBusy(true);
    const payload = {
      code: f.code.trim().toUpperCase(), name: f.name.trim(), customer_category: f.customer_category, billing_method: f.billing_method,
      flat_rate: f.billing_method === "flat" ? Number(f.flat_rate) : null, fixed_charge: Number(f.fixed_charge || 0), tax_rate: Number(f.tax_rate || 0),
      additional_charges: Number(f.additional_charges || 0), additional_charges_label: f.additional_charges_label || null, effective_from: f.effective_from,
      effective_to: f.effective_to || null, status: f.status, description: f.description || null,
      slabs: f.billing_method === "slab" ? f.slabs.map((s) => ({ from_unit: Number(s.from_unit), to_unit: s.to_unit === "" ? null : Number(s.to_unit), rate: Number(s.rate) })) : [],
    };
    try {
      if (tariff === "new") await api.post("/api/tariffs", payload);
      else if (tariff) await api.put(`/api/tariffs/${tariff.id}`, payload);
      toast.success("Tariff saved");
      onSaved();
      onClose();
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={!!tariff} onClose={onClose} size="xl" title={tariff === "new" ? "Create tariff" : "Edit tariff"} subtitle="Slabs are progressive: each portion of consumption is billed at its own slab rate."
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button loading={busy} onClick={save}>Save tariff</Button></>}>
      <div className="space-y-5">
        {err && <Alert tone="error">{err}</Alert>}
        {tariff !== "new" && tariff && (tariff.connections_using ?? 0) > 0 && <Alert tone="warn">{tariff.connections_using} connections use this tariff. New rates apply to bills generated from now on.</Alert>}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Code" required hint="Upper case, e.g. RES-STD"><Input className="uppercase" value={f.code} onChange={set("code")} /></Field>
          <Field label="Name" required className="sm:col-span-2"><Input value={f.name} onChange={set("name")} /></Field>
          <Field label="Customer category"><Select value={f.customer_category} onChange={set("customer_category")} options={["residential", "commercial", "industrial"].map((s) => ({ value: s, label: s[0].toUpperCase() + s.slice(1) }))} /></Field>
          <Field label="Billing method"><Select value={f.billing_method} onChange={set("billing_method")} options={[{ value: "slab", label: "Slab-based (progressive)" }, { value: "flat", label: "Flat rate" }]} /></Field>
          <Field label="Status"><Select value={f.status} onChange={set("status")} options={[{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }]} /></Field>
          <Field label="Fixed charge (Rs / month)"><Input type="number" step="0.01" min="0" value={f.fixed_charge} onChange={set("fixed_charge")} /></Field>
          <Field label="Electricity duty / tax (%)"><Input type="number" step="0.01" min="0" max="100" value={f.tax_rate} onChange={set("tax_rate")} /></Field>
          <Field label="Additional charges (Rs)"><Input type="number" step="0.01" min="0" value={f.additional_charges} onChange={set("additional_charges")} /></Field>
          <Field label="Additional charges label"><Input placeholder="e.g. Meter rent" value={f.additional_charges_label} onChange={set("additional_charges_label")} /></Field>
          <Field label="Effective from" required><Input type="date" value={f.effective_from} onChange={set("effective_from")} /></Field>
          <Field label="Expires on"><Input type="date" value={f.effective_to} onChange={set("effective_to")} /></Field>
        </div>
        {f.billing_method === "flat" ? (
          <Field label="Rate per unit (Rs)" required className="sm:w-60"><Input type="number" step="0.0001" min="0" value={f.flat_rate} onChange={set("flat_rate")} /></Field>
        ) : (
          <div>
            <div className="mb-2 flex items-center justify-between"><p className="text-sm font-semibold">Slab configuration</p><Button size="sm" variant="outline" icon={<Plus className="h-3.5 w-3.5" />} onClick={addSlab}>Add slab</Button></div>
            <div className="overflow-x-auto rounded-lg border border-line">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-xs text-ink-muted"><tr><th className="px-3 py-2 text-left font-medium">From (units, exclusive)</th><th className="px-3 py-2 text-left font-medium">To (units, inclusive)</th><th className="px-3 py-2 text-left font-medium">Rate / unit (Rs)</th><th /></tr></thead>
                <tbody className="divide-y divide-line">
                  {f.slabs.map((s, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2"><Input type="number" min="0" value={s.from_unit} disabled={i > 0} onChange={(e) => setSlab(i, "from_unit", e.target.value)} /></td>
                      <td className="px-3 py-2"><Input type="number" min="0" placeholder={i === f.slabs.length - 1 ? "No limit" : ""} value={s.to_unit} onChange={(e) => setSlab(i, "to_unit", e.target.value)} /></td>
                      <td className="px-3 py-2"><Input type="number" step="0.0001" min="0" value={s.rate} onChange={(e) => setSlab(i, "rate", e.target.value)} /></td>
                      <td className="px-2"><IconButton label="Remove slab" disabled={f.slabs.length <= 1} onClick={() => setF((x) => ({ ...x, slabs: x.slabs.filter((_, j) => j !== i).map((y, j, arr) => (j > 0 ? { ...y, from_unit: arr[j - 1].to_unit } : { ...y, from_unit: "0" })) }))}><Trash2 className="h-4 w-4" /></IconButton></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-1.5 text-xs text-ink-muted">The first slab starts at 0, each slab starts where the previous ends, and leave "To" empty on the last slab for "and above".</p>
          </div>
        )}
        <Field label="Description"><Textarea rows={2} value={f.description} onChange={set("description")} /></Field>
      </div>
    </Modal>
  );
}

function HistoryModal({ tariff, onClose }: { tariff: Tariff | null; onClose: () => void }) {
  const { data, loading } = useApi<AuditEntry[]>(tariff ? `/api/tariffs/${tariff.id}/history` : null);
  return (
    <Modal open={!!tariff} onClose={onClose} title={`Tariff history · ${tariff?.code ?? ""}`} size="lg">
      {loading ? <LoadingBlock /> : !data?.length ? <EmptyState title="No changes recorded" message="Changes made through the dashboard appear here." /> : (
        <ol className="space-y-3">
          {data.map((h) => (
            <li key={h.id} className="rounded-lg border border-line p-3 text-xs">
              <div className="flex justify-between gap-2"><b className="text-sm text-ink">{h.action.replace("tariff.", "").replace(/^\w/, (c) => c.toUpperCase())}</b><span className="text-ink-muted">{h.by} · {dateTime(h.created_at)}</span></div>
              <p className="mt-1 text-ink-soft">{h.summary}</p>
              {h.old_values && h.new_values && (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {(["fixed_charge", "tax_rate", "additional_charges", "flat_rate"] as const).filter((k) => String(h.old_values?.[k]) !== String(h.new_values?.[k])).map((k) => (
                    <p key={k} className="text-ink-muted">{k.replace(/_/g, " ")}: {String(h.old_values?.[k])} → <b className="text-ink">{String(h.new_values?.[k])}</b></p>
                  ))}
                  {JSON.stringify(h.old_values.slabs) !== JSON.stringify(h.new_values.slabs) && <p className="col-span-2 text-ink-muted">Slab rates changed</p>}
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
    </Modal>
  );
}

function CalculatorModal({ tariff, onClose }: { tariff: Tariff | null; onClose: () => void }) {
  const [u, setU] = useState("160");
  const { data, loading, error } = useApi<{ items: BillItem[]; total_amount: number }>(tariff && u !== "" ? `/api/tariffs/${tariff.id}/calculate` : null, { units: u });
  return (
    <Modal open={!!tariff} onClose={onClose} title="Bill estimator" subtitle={tariff?.name}>
      <Field label="Units consumed (kWh)"><Input type="number" min="0" value={u} onChange={(e) => setU(e.target.value)} /></Field>
      <div className="mt-4">
        {loading ? <LoadingBlock className="py-6" /> : error ? <Alert tone="error">{error}</Alert> : data && (
          <table className="w-full text-sm">
            <tbody className="divide-y divide-line">
              {data.items.map((it, i) => <tr key={i}><td className="py-2 text-ink-soft">{it.description}</td><td className="py-2 text-right tabular-nums">{money(it.amount)}</td></tr>)}
              <tr><td className="py-2 font-semibold">Estimated bill</td><td className="py-2 text-right text-base font-semibold tabular-nums text-brand-700">{money(data.total_amount)}</td></tr>
            </tbody>
          </table>
        )}
      </div>
    </Modal>
  );
}
