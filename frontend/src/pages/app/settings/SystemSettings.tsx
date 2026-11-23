import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { toast } from "sonner";
import { api, errorMessage } from "@/services/api";
import { useApi } from "@/hooks/useApi";
import { Card, CardBody, CardHeader, PageHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select, Textarea } from "@/components/ui/Form";
import { Alert, ErrorState, LoadingBlock } from "@/components/ui/States";
import { ChangePasswordCard } from "@/pages/shared/AccountSettings";

interface SettingsResp { settings: { key: string; value: string; description: string }[]; email_enabled: boolean; environment: string }

const GROUPS = [
  { title: "Provider details (shown on invoices)", keys: ["company_name", "company_address", "company_phone", "company_email", "payment_instructions"] },
  { title: "Billing rules", keys: ["invoice_prefix", "bill_due_days", "late_fee_percent", "due_soon_days"] },
  { title: "Security & permissions", keys: ["staff_can_manage_tariffs"] },
];
const LABELS: Record<string, string> = {
  company_name: "Company name", company_address: "Address", company_phone: "Customer care phone", company_email: "Customer care email",
  payment_instructions: "Payment instructions", invoice_prefix: "Invoice prefix", bill_due_days: "Due in (days)", late_fee_percent: "Late fee (%)",
  due_soon_days: "Reminder before due (days)", staff_can_manage_tariffs: "Staff may manage tariffs",
};

export default function SystemSettings() {
  const { data, loading, error, reload } = useApi<SettingsResp>("/api/settings");
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (data) setValues(Object.fromEntries(data.settings.map((s) => [s.key, s.value])));
  }, [data]);

  if (loading && !data) return <LoadingBlock />;
  if (error || !data) return <ErrorState message={error ?? ""} onRetry={reload} />;
  const desc = Object.fromEntries(data.settings.map((s) => [s.key, s.description]));

  const save = async () => {
    setBusy(true);
    try {
      const { data: r } = await api.put("/api/settings", { values });
      toast.success(r.changed.length ? `Saved: ${r.changed.length} setting(s) changed` : "No changes");
      reload();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader title="Settings" subtitle="System-wide configuration. Changes are recorded in the audit log."
        actions={<Button loading={busy} icon={<Save className="h-4 w-4" />} onClick={save}>Save settings</Button>} />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          {GROUPS.map((g) => (
            <Card key={g.title}>
              <CardHeader title={g.title} />
              <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {g.keys.map((k) => (
                  <Field key={k} label={LABELS[k]} hint={desc[k]} className={k === "payment_instructions" || k === "company_address" ? "sm:col-span-2" : undefined}>
                    {k === "staff_can_manage_tariffs" ? (
                      <Select value={values[k] ?? "false"} onChange={(e) => setValues({ ...values, [k]: e.target.value })} options={[{ value: "false", label: "No - administrators only" }, { value: "true", label: "Yes" }]} />
                    ) : k === "payment_instructions" ? (
                      <Textarea rows={3} value={values[k] ?? ""} onChange={(e) => setValues({ ...values, [k]: e.target.value })} />
                    ) : (
                      <Input value={values[k] ?? ""} onChange={(e) => setValues({ ...values, [k]: e.target.value })} />
                    )}
                  </Field>
                ))}
              </CardBody>
            </Card>
          ))}
        </div>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Environment" />
            <CardBody className="space-y-3 text-sm">
              <p>Mode: <b className="capitalize">{data.environment}</b></p>
              <Alert tone={data.email_enabled ? "success" : "info"}>
                Email notifications are <b>{data.email_enabled ? "enabled" : "disabled"}</b>. Configure SMTP in the backend <code>.env</code> file (EMAIL_ENABLED, SMTP_HOST...).
              </Alert>
              <Alert tone="warn">Payments run in Demo Payment Mode. No real gateway is connected.</Alert>
            </CardBody>
          </Card>
          <ChangePasswordCard />
        </div>
      </div>
    </div>
  );
}
