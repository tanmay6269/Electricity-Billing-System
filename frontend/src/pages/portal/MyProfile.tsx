import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Save } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, InfoGrid, PageHeader } from "@/components/ui/Card";
import { Field, Input } from "@/components/ui/Form";
import { StatusBadge, TypeBadge } from "@/components/ui/Badge";
import { ErrorState, LoadingBlock } from "@/components/ui/States";
import { useApi } from "@/hooks/useApi";
import { api, errorMessage } from "@/services/api";
import { date } from "@/utils/format";
import { phone, pin } from "@/utils/validation";
import type { CustomerProfile } from "@/types";

const schema = z.object({
  phone,
  address: z.string().trim().min(5, "At least 5 characters").max(255),
  city: z.string().trim().min(2, "Required").max(80),
  state: z.string().trim().min(2, "Required").max(80),
  postal_code: pin,
  profile_picture_url: z.string().trim().max(500).url("Enter a valid URL").or(z.literal("")),
});
type FormData = z.infer<typeof schema>;

export default function MyProfile() {
  const { data, loading, error, reload } = useApi<CustomerProfile>("/api/customers/me");
  const { register, handleSubmit, reset, formState: { errors, isSubmitting, isDirty } } = useForm<FormData>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (data) {
      const c = data.customer;
      reset({ phone: c.phone, address: c.address, city: c.city, state: c.state, postal_code: c.postal_code, profile_picture_url: c.profile_picture_url ?? "" });
    }
  }, [data, reset]);

  if (loading && !data) return <LoadingBlock />;
  if (error || !data) return <ErrorState message={error ?? "No data"} onRetry={reload} />;
  const c = data.customer;

  const onSubmit = async (d: FormData) => {
    try {
      await api.put("/api/customers/me", { ...d, profile_picture_url: d.profile_picture_url || null });
      toast.success("Profile updated");
      await reload();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <div>
      <PageHeader title="My Profile" subtitle="Your account details with PowerGrid Utility Services." />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card>
          <CardBody className="flex flex-col items-center text-center">
            {c.profile_picture_url ? (
              <img src={c.profile_picture_url} alt="" className="h-20 w-20 rounded-full object-cover ring-4 ring-brand-50" />
            ) : (
              <span className="flex h-20 w-20 items-center justify-center rounded-full bg-navy-800 text-2xl font-semibold text-white">
                {c.full_name.split(" ").map((p) => p[0]).slice(0, 2).join("")}
              </span>
            )}
            <p className="mt-3 text-base font-semibold">{c.full_name}</p>
            <p className="text-xs text-ink-muted">{c.customer_code}</p>
            <div className="mt-3 flex gap-2">
              <TypeBadge type={c.customer_type} />
              <StatusBadge status={c.status} />
            </div>
          </CardBody>
          <div className="border-t border-line p-5">
            <InfoGrid cols={2} items={[
              { label: "Email", value: c.email },
              { label: "Customer since", value: date(c.created_at) },
              { label: "Connections", value: c.connection_count },
              { label: "Tariff", value: c.tariff_plan },
            ]} />
            <p className="mt-4 text-xs text-ink-muted">Name, email and category can only be changed by contacting the office.</p>
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader title="Contact details" subtitle="You can update these yourself." />
          <form onSubmit={handleSubmit(onSubmit)} noValidate>
            <CardBody className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Mobile number" error={errors.phone?.message} required>
                <Input invalid={!!errors.phone} {...register("phone")} />
              </Field>
              <Field label="Profile picture URL" error={errors.profile_picture_url?.message} hint="Optional">
                <Input placeholder="https://..." invalid={!!errors.profile_picture_url} {...register("profile_picture_url")} />
              </Field>
              <Field label="Address" error={errors.address?.message} required className="sm:col-span-2">
                <Input invalid={!!errors.address} {...register("address")} />
              </Field>
              <Field label="City" error={errors.city?.message} required>
                <Input invalid={!!errors.city} {...register("city")} />
              </Field>
              <Field label="State" error={errors.state?.message} required>
                <Input invalid={!!errors.state} {...register("state")} />
              </Field>
              <Field label="Postal code" error={errors.postal_code?.message} required>
                <Input invalid={!!errors.postal_code} {...register("postal_code")} />
              </Field>
            </CardBody>
            <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
              <Button type="submit" loading={isSubmitting} disabled={!isDirty} icon={<Save className="h-4 w-4" />}>Save changes</Button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}
