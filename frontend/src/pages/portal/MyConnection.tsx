import { useState } from "react";
import { Calculator, PlugZap } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, InfoGrid, PageHeader } from "@/components/ui/Card";
import { Field, Input } from "@/components/ui/Form";
import { StatusBadge, TypeBadge } from "@/components/ui/Badge";
import { EmptyState, ErrorState, LoadingBlock } from "@/components/ui/States";
import { useApi } from "@/hooks/useApi";
import { api, errorMessage } from "@/services/api";
import { date, label, money, number } from "@/utils/format";
import type { Connection, CustomerProfile, Tariff } from "@/types";

interface Estimate { total_amount: number; items: { description: string; amount: number }[] }

export default function MyConnection() {
  const { data, loading, error, reload } = useApi<CustomerProfile>("/api/customers/me");
  if (loading && !data) return <LoadingBlock />;
  if (error || !data) return <ErrorState message={error ?? "No data"} onRetry={reload} />;

  return (
    <div>
      <PageHeader title="My Electricity Connection" subtitle="Connection, meter and tariff details." />
      {data.connections.length === 0 ? (
        <Card><EmptyState icon={<PlugZap className="h-6 w-6" />} title="No connection yet" message="Your connection details will appear once it is registered." /></Card>
      ) : (
        <div className="space-y-6">
          {data.connections.map((c) => <ConnectionCard key={c.id} conn={c} />)}
        </div>
      )}
    </div>
  );
}

function ConnectionCard({ conn }: { conn: Connection }) {
  const { data: tariff } = useApi<Tariff>(`/api/tariffs/${conn.tariff_plan_id}`);
  const [unitsIn, setUnitsIn] = useState("150");
  const [est, setEst] = useState<Estimate | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const estimate = async () => {
    const n = Number(unitsIn);
    if (!Number.isFinite(n) || n < 0) return setErr("Enter a valid number of units");
    setErr(null);
    setBusy(true);
    try {
      const { data } = await api.get<Estimate>(`/api/tariffs/${conn.tariff_plan_id}/calculate`, { params: { units: n } });
      setEst(data);
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
      <Card className="xl:col-span-2">
        <CardHeader title={conn.connection_code} subtitle={conn.address} action={<StatusBadge status={conn.status} />} />
        <CardBody>
          <InfoGrid cols={3} items={[
            { label: "Meter number", value: conn.meter_number },
            { label: "Meter status", value: <StatusBadge status={conn.meter_status} /> },
            { label: "Connection type", value: <TypeBadge type={conn.connection_type} /> },
            { label: "Sanctioned load", value: `${number(conn.sanctioned_load_kw)} kW` },
            { label: "Tariff plan", value: conn.tariff_plan },
            { label: "Installation date", value: date(conn.installation_date) },
          ]} />
          {tariff && (
            <div className="mt-6">
              <h4 className="text-sm">Tariff rates - {tariff.name}</h4>
              <div className="mt-3 overflow-x-auto rounded-lg border border-line">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr><th className="table-th">Units</th><th className="table-th text-right">Rate per unit</th></tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {tariff.billing_method === "flat" ? (
                      <tr><td className="table-td">All units (flat rate)</td><td className="table-td text-right">{money(tariff.flat_rate)}</td></tr>
                    ) : (
                      tariff.slabs.map((s) => (
                        <tr key={`${s.from_unit}`}>
                          <td className="table-td">{s.to_unit ? `${s.from_unit + 1} - ${s.to_unit}` : `Above ${s.from_unit}`}</td>
                          <td className="table-td text-right">{money(s.rate)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs text-ink-muted">
                <span>Method: <b className="text-ink">{label(tariff.billing_method)}</b></span>
                <span>Fixed charge: <b className="text-ink">{money(tariff.fixed_charge)}</b>/month</span>
                <span>Electricity duty: <b className="text-ink">{tariff.tax_rate}%</b></span>
                {tariff.additional_charges > 0 && <span>{tariff.additional_charges_label || "Additional"}: <b className="text-ink">{money(tariff.additional_charges)}</b></span>}
              </div>
            </div>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Bill estimator" subtitle="Estimate a monthly bill on your tariff" />
        <CardBody>
          <div className="flex items-end gap-2">
            <Field label="Units (kWh)" error={err ?? undefined} className="flex-1">
              <Input type="number" min={0} value={unitsIn} onChange={(e) => setUnitsIn(e.target.value)} onKeyDown={(e) => e.key === "Enter" && estimate()} />
            </Field>
            <Button onClick={estimate} loading={busy} icon={<Calculator className="h-4 w-4" />}>Estimate</Button>
          </div>
          {est && (
            <div className="mt-4 space-y-2 text-sm">
              {est.items.map((i, idx) => (
                <div key={idx} className="flex justify-between gap-3">
                  <span className="text-ink-muted">{i.description}</span>
                  <span className="tabular-nums">{money(i.amount)}</span>
                </div>
              ))}
              <div className="flex justify-between border-t border-line pt-2 font-semibold">
                <span>Estimated total</span>
                <span className="tabular-nums">{money(est.total_amount)}</span>
              </div>
              <p className="text-xs text-ink-faint">Excludes any previous outstanding balance or late fees.</p>
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
