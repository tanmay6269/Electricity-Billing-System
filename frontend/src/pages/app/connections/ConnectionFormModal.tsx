import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { api, errorMessage } from "@/services/api";
import { useApi, useDebounce } from "@/hooks/useApi";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Form";
import { Alert } from "@/components/ui/States";
import type { Customer, Page, Tariff } from "@/types";
import { todayISO } from "@/utils/format";

const schema = z.object({
  customer_id: z.string().min(1, "Choose a customer"),
  meter_number: z.string().trim().regex(/^[A-Za-z0-9-]{4,30}$/, "4-30 letters, numbers or dashes"),
  meter_manufacturer: z.string().max(80).optional(),
  initial_reading: z.coerce.number().min(0, "Cannot be negative"),
  connection_type: z.enum(["residential", "commercial", "industrial"]),
  sanctioned_load_kw: z.coerce.number().positive("Enter load in kW").max(10000),
  tariff_plan_id: z.string().min(1, "Choose a tariff"),
  installation_date: z.string().min(1, "Required"),
  status: z.enum(["active", "pending", "suspended", "disconnected"]),
  address: z.string().max(500).optional(),
});
type FormData = z.infer<typeof schema>;

/** Register a new connection + meter. If customerId is given the customer is fixed. */
export default function ConnectionFormModal({ open, onClose, customerId, customerType, onSaved }: {
  open: boolean; onClose: () => void; customerId?: number; customerType?: string; onSaved: (id: number) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const dq = useDebounce(q);
  const { data: tariffs } = useApi<Tariff[]>(open ? "/api/tariffs" : null, { status: "active" });
  const { data: customers } = useApi<Page<Customer>>(open && !customerId ? "/api/customers" : null, { search: dq, page_size: 20, sort_by: "full_name", sort_dir: "asc" });
  const { register, handleSubmit, reset, watch, setValue, formState: { errors, isSubmitting } } = useForm<FormData>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (open) {
      setError(null);
      reset({
        customer_id: customerId ? String(customerId) : "", connection_type: (customerType as FormData["connection_type"]) || "residential",
        initial_reading: 0, installation_date: todayISO(), status: "active", tariff_plan_id: "", meter_number: "", sanctioned_load_kw: undefined as unknown as number,
      });
    }
  }, [open, customerId, customerType, reset]);

  const ctype = watch("connection_type");
  const tariffOptions = (tariffs ?? []).filter((t) => t.customer_category === ctype).map((t) => ({ value: t.id, label: `${t.name} (${t.code})` }));

  const onSubmit = async (d: FormData) => {
    setError(null);
    try {
      const { data } = await api.post("/api/connections", {
        ...d, customer_id: Number(d.customer_id), tariff_plan_id: Number(d.tariff_plan_id), meter_number: d.meter_number.toUpperCase(),
        meter_manufacturer: d.meter_manufacturer || null, address: d.address || null,
      });
      toast.success(`Connection ${data.connection_code} registered`);
      onSaved(data.id);
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="New electricity connection" subtitle="Registers a meter and links it to a tariff." size="lg"
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button loading={isSubmitting} onClick={handleSubmit(onSubmit)}>Register connection</Button></>}>
      <form className="grid grid-cols-1 gap-4 sm:grid-cols-2" onSubmit={handleSubmit(onSubmit)} noValidate>
        {error && <div className="sm:col-span-2"><Alert tone="error">{error}</Alert></div>}
        {!customerId && (
          <>
            <Field label="Find customer" className="sm:col-span-1"><Input placeholder="Search name or ID..." value={q} onChange={(e) => setQ(e.target.value)} /></Field>
            <Field label="Customer" required error={errors.customer_id?.message}>
              <Select placeholder="Select customer" invalid={!!errors.customer_id} {...register("customer_id", {
                onChange: (e) => {
                  const c = customers?.items.find((x) => String(x.id) === e.target.value);
                  if (c) setValue("connection_type", c.customer_type as FormData["connection_type"]);
                },
              })} options={(customers?.items ?? []).map((c) => ({ value: c.id, label: `${c.full_name} (${c.customer_code})` }))} />
            </Field>
          </>
        )}
        <Field label="Meter number" required error={errors.meter_number?.message}><Input className="uppercase" invalid={!!errors.meter_number} {...register("meter_number")} /></Field>
        <Field label="Meter manufacturer"><Input {...register("meter_manufacturer")} /></Field>
        <Field label="Connection type" required>
          <Select {...register("connection_type")} options={[{ value: "residential", label: "Residential" }, { value: "commercial", label: "Commercial" }, { value: "industrial", label: "Industrial" }]} />
        </Field>
        <Field label="Tariff plan" required error={errors.tariff_plan_id?.message}>
          <Select placeholder="Select tariff" invalid={!!errors.tariff_plan_id} options={tariffOptions} {...register("tariff_plan_id")} />
        </Field>
        <Field label="Sanctioned load (kW)" required error={errors.sanctioned_load_kw?.message}><Input type="number" step="0.1" invalid={!!errors.sanctioned_load_kw} {...register("sanctioned_load_kw")} /></Field>
        <Field label="Initial meter reading" error={errors.initial_reading?.message}><Input type="number" step="0.01" {...register("initial_reading")} /></Field>
        <Field label="Installation date" required error={errors.installation_date?.message}><Input type="date" max={todayISO()} {...register("installation_date")} /></Field>
        <Field label="Status">
          <Select {...register("status")} options={[{ value: "active", label: "Active" }, { value: "pending", label: "Pending" }, { value: "suspended", label: "Suspended" }]} />
        </Field>
        <Field label="Supply address" hint="Leave empty to use the customer's address" className="sm:col-span-2"><Input {...register("address")} /></Field>
      </form>
    </Modal>
  );
}
