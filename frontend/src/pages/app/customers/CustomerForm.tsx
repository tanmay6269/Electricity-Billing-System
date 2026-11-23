import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { ArrowLeft, Save } from "lucide-react";
import { toast } from "sonner";
import { api, errorMessage } from "@/services/api";
import { useApi } from "@/hooks/useApi";
import { Card, CardBody, CardHeader, PageHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Form";
import { Alert, LoadingBlock } from "@/components/ui/States";
import type { Customer, Tariff } from "@/types";
import { phone, pin, strongPassword } from "@/utils/validation";
import { todayISO } from "@/utils/format";

const STATES = ["Rajasthan", "Delhi", "Gujarat", "Haryana", "Karnataka", "Madhya Pradesh", "Maharashtra", "Punjab", "Tamil Nadu", "Telangana", "Uttar Pradesh", "West Bengal"];

const base = z.object({
  full_name: z.string().trim().min(2, "Name is required").max(120),
  email: z.string().trim().email("Enter a valid email"),
  phone,
  address: z.string().trim().min(5, "Address is required").max(255),
  city: z.string().trim().min(2, "City is required").max(80),
  state: z.string().trim().min(2, "State is required"),
  postal_code: pin,
  customer_type: z.enum(["residential", "commercial", "industrial"]),
  status: z.enum(["active", "inactive", "suspended"]),
  profile_picture_url: z.string().trim().url("Must be a URL").or(z.literal("")).optional(),
  with_connection: z.boolean(),
  meter_number: z.string().optional(),
  tariff_plan_id: z.string().optional(),
  sanctioned_load_kw: z.string().optional(),
  installation_date: z.string().optional(),
  initial_reading: z.string().optional(),
  create_login: z.boolean(),
  login_password: z.string().optional(),
});

const schema = base.superRefine((d, ctx) => {
  if (d.with_connection) {
    if (!d.meter_number || !/^[A-Za-z0-9-]{4,30}$/.test(d.meter_number)) ctx.addIssue({ code: "custom", path: ["meter_number"], message: "4-30 letters, numbers or dashes" });
    if (!d.tariff_plan_id) ctx.addIssue({ code: "custom", path: ["tariff_plan_id"], message: "Choose a tariff" });
    if (!d.sanctioned_load_kw || Number(d.sanctioned_load_kw) <= 0) ctx.addIssue({ code: "custom", path: ["sanctioned_load_kw"], message: "Enter load in kW" });
    if (!d.installation_date) ctx.addIssue({ code: "custom", path: ["installation_date"], message: "Required" });
    if (d.initial_reading && Number(d.initial_reading) < 0) ctx.addIssue({ code: "custom", path: ["initial_reading"], message: "Cannot be negative" });
  }
  if (d.create_login) {
    const r = strongPassword.safeParse(d.login_password ?? "");
    if (!r.success) ctx.addIssue({ code: "custom", path: ["login_password"], message: r.error.issues[0].message });
  }
});
type FormData = z.infer<typeof base>;

export default function CustomerForm() {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const { data: existing, loading } = useApi<Customer>(isEdit ? `/api/customers/${id}` : null);
  const { data: tariffs } = useApi<Tariff[]>("/api/tariffs", { status: "active" });
  const { register, handleSubmit, reset, watch, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: { customer_type: "residential", status: "active", state: "Rajasthan", with_connection: true, create_login: false, installation_date: todayISO(), initial_reading: "0" },
  });

  useEffect(() => {
    if (existing) {
      reset({
        full_name: existing.full_name, email: existing.email, phone: existing.phone, address: existing.address, city: existing.city,
        state: existing.state, postal_code: existing.postal_code, customer_type: existing.customer_type as FormData["customer_type"],
        status: existing.status as FormData["status"], profile_picture_url: existing.profile_picture_url ?? "", with_connection: false, create_login: false,
      });
    }
  }, [existing, reset]);

  const withConn = watch("with_connection");
  const createLogin = watch("create_login");
  const ctype = watch("customer_type");
  const tariffOptions = (tariffs ?? []).filter((t) => t.customer_category === ctype).map((t) => ({ value: t.id, label: `${t.name} (${t.code})` }));

  const onSubmit = async (d: FormData) => {
    setError(null);
    const payload: Record<string, unknown> = {
      full_name: d.full_name, email: d.email, phone: d.phone, address: d.address, city: d.city, state: d.state, postal_code: d.postal_code,
      customer_type: d.customer_type, status: d.status, profile_picture_url: d.profile_picture_url || null,
    };
    try {
      if (isEdit) {
        await api.put(`/api/customers/${id}`, payload);
        toast.success("Customer updated");
        navigate(`/app/customers/${id}`);
      } else {
        if (d.with_connection) {
          payload.connection = {
            meter_number: d.meter_number!.toUpperCase(), tariff_plan_id: Number(d.tariff_plan_id), sanctioned_load_kw: Number(d.sanctioned_load_kw),
            installation_date: d.installation_date, initial_reading: Number(d.initial_reading || 0),
          };
        }
        if (d.create_login) {
          payload.create_login = true;
          payload.login_password = d.login_password;
        }
        const { data } = await api.post<Customer>("/api/customers", payload);
        toast.success(`Customer ${data.customer_code} created`);
        navigate(`/app/customers/${data.id}`);
      }
    } catch (e) {
      setError(errorMessage(e));
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  };

  if (isEdit && loading) return <LoadingBlock />;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        back={<Link to={isEdit ? `/app/customers/${id}` : "/app/customers"} className="mb-2 inline-flex items-center gap-1 text-xs font-medium text-ink-muted hover:text-ink"><ArrowLeft className="h-3.5 w-3.5" /> Back</Link>}
        title={isEdit ? `Edit ${existing?.full_name ?? "customer"}` : "Add customer"}
        subtitle={isEdit ? existing?.customer_code : "Customer ID is generated automatically."}
      />
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" noValidate>
        {error && <Alert tone="error">{error}</Alert>}
        <Card>
          <CardHeader title="Customer details" />
          <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Full name" required error={errors.full_name?.message}><Input invalid={!!errors.full_name} {...register("full_name")} /></Field>
            <Field label="Email" required error={errors.email?.message}><Input type="email" invalid={!!errors.email} {...register("email")} /></Field>
            <Field label="Phone number" required error={errors.phone?.message}><Input inputMode="tel" placeholder="98XXXXXXXX" invalid={!!errors.phone} {...register("phone")} /></Field>
            <Field label="Customer type" required>
              <Select {...register("customer_type")} options={[{ value: "residential", label: "Residential" }, { value: "commercial", label: "Commercial" }, { value: "industrial", label: "Industrial" }]} />
            </Field>
            <Field label="Address" required error={errors.address?.message} className="sm:col-span-2"><Input invalid={!!errors.address} {...register("address")} /></Field>
            <Field label="City" required error={errors.city?.message}><Input invalid={!!errors.city} {...register("city")} /></Field>
            <Field label="State" required error={errors.state?.message}>
              <Select {...register("state")} options={STATES.map((s) => ({ value: s, label: s }))} />
            </Field>
            <Field label="Postal code" required error={errors.postal_code?.message}><Input inputMode="numeric" maxLength={6} invalid={!!errors.postal_code} {...register("postal_code")} /></Field>
            <Field label="Account status">
              <Select {...register("status")} options={[{ value: "active", label: "Active" }, { value: "inactive", label: "Inactive" }, { value: "suspended", label: "Suspended" }]} />
            </Field>
            <Field label="Profile picture URL" hint="Optional" error={errors.profile_picture_url?.message} className="sm:col-span-2"><Input placeholder="https://..." {...register("profile_picture_url")} /></Field>
          </CardBody>
        </Card>

        {!isEdit && (
          <>
            <Card>
              <CardHeader title="Electricity connection" subtitle="Register the first connection and meter now (more can be added later)."
                action={<label className="flex items-center gap-2 text-xs font-medium text-ink-soft"><input type="checkbox" className="h-4 w-4 accent-brand-600" {...register("with_connection")} /> Add connection</label>} />
              {withConn && (
                <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Meter number" required error={errors.meter_number?.message}><Input className="uppercase" placeholder="MTR123456" invalid={!!errors.meter_number} {...register("meter_number")} /></Field>
                  <Field label="Tariff plan" required error={errors.tariff_plan_id?.message} hint={tariffOptions.length ? undefined : "No active tariff for this customer type"}>
                    <Select placeholder="Select tariff" invalid={!!errors.tariff_plan_id} options={tariffOptions} {...register("tariff_plan_id")} />
                  </Field>
                  <Field label="Sanctioned load (kW)" required error={errors.sanctioned_load_kw?.message}><Input type="number" step="0.1" min="0" invalid={!!errors.sanctioned_load_kw} {...register("sanctioned_load_kw")} /></Field>
                  <Field label="Connection / installation date" required error={errors.installation_date?.message}><Input type="date" max={todayISO()} {...register("installation_date")} /></Field>
                  <Field label="Initial meter reading" hint="Reading on the meter at installation" error={errors.initial_reading?.message}><Input type="number" step="0.01" min="0" {...register("initial_reading")} /></Field>
                </CardBody>
              )}
            </Card>
            <Card>
              <CardHeader title="Customer portal login" subtitle="Optionally create a login so the customer can view bills and pay online."
                action={<label className="flex items-center gap-2 text-xs font-medium text-ink-soft"><input type="checkbox" className="h-4 w-4 accent-brand-600" {...register("create_login")} /> Create login</label>} />
              {createLogin && (
                <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Login email"><Input disabled value={watch("email") || ""} /></Field>
                  <Field label="Temporary password" required error={errors.login_password?.message} hint="Share securely; the customer can change it after login.">
                    <Input type="password" autoComplete="new-password" invalid={!!errors.login_password} {...register("login_password")} />
                  </Field>
                </CardBody>
              )}
            </Card>
          </>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => navigate(-1)}>Cancel</Button>
          <Button type="submit" loading={isSubmitting} icon={<Save className="h-4 w-4" />}>{isEdit ? "Save changes" : "Create customer"}</Button>
        </div>
      </form>
    </div>
  );
}
