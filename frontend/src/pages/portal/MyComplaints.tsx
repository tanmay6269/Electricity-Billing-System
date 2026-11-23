import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Plus, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Card, PageHeader } from "@/components/ui/Card";
import { Field, Input, Select, Textarea, Toolbar } from "@/components/ui/Form";
import { StatusBadge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { EmptyState } from "@/components/ui/States";
import { DataTable, Pagination, type Column } from "@/components/ui/DataTable";
import { useApi, useTableState } from "@/hooks/useApi";
import { api, errorMessage } from "@/services/api";
import { CATEGORY_LABELS, date, label } from "@/utils/format";
import type { Complaint, CustomerProfile, Page } from "@/types";

const schema = z.object({
  category: z.string().min(1, "Choose a category"),
  connection_id: z.string(),
  subject: z.string().trim().min(5, "At least 5 characters").max(200),
  description: z.string().trim().min(10, "At least 10 characters").max(4000),
  priority: z.enum(["low", "medium", "high"]),
});
type FormData = z.infer<typeof schema>;

const STATUSES = ["submitted", "under_review", "assigned", "in_progress", "resolved", "closed"].map((s) => ({ value: s, label: label(s) }));

export default function MyComplaints() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const t = useTableState({ status: "" }, { by: "created_at", dir: "desc" });
  const { data, loading, error, reload } = useApi<Page<Complaint>>("/api/complaints", {
    page: t.page, page_size: t.pageSize, sort_by: t.sort.by, sort_dir: t.sort.dir, status: t.filters.status,
  });
  const { data: profile } = useApi<CustomerProfile>("/api/customers/me");
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<FormData>({
    resolver: zodResolver(schema), defaultValues: { category: "", connection_id: "", subject: "", description: "", priority: "medium" },
  });

  const onSubmit = async (d: FormData) => {
    try {
      const { data: c } = await api.post<Complaint>("/api/complaints", { ...d, connection_id: d.connection_id ? Number(d.connection_id) : null });
      toast.success(`Complaint ${c.complaint_code} submitted`);
      setOpen(false);
      reset();
      window.dispatchEvent(new Event("notifications:changed"));
      navigate(`/portal/complaints/${c.id}`);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  const columns: Column<Complaint>[] = [
    { key: "complaint_code", header: "ID", render: (c) => <span className="font-medium text-ink">{c.complaint_code}</span> },
    { key: "subject", header: "Subject", render: (c) => <span className="block max-w-xs truncate">{c.subject}</span> },
    { key: "category", header: "Category", hideOnMobile: true, render: (c) => CATEGORY_LABELS[c.category] ?? c.category },
    { key: "priority", header: "Priority", sortable: true, hideOnMobile: true, render: (c) => <StatusBadge status={c.priority} /> },
    { key: "created_at", header: "Submitted", sortable: true, hideOnMobile: true, render: (c) => date(c.created_at) },
    { key: "status", header: "Status", sortable: true, render: (c) => <StatusBadge status={c.status} /> },
  ];

  return (
    <div>
      <PageHeader title="Complaints" subtitle="Report an issue and track its progress."
        actions={<Button icon={<Plus className="h-4 w-4" />} onClick={() => setOpen(true)}>New complaint</Button>} />
      <Card>
        <Toolbar>
          <Select className="sm:w-52" placeholder="All statuses" options={STATUSES} value={t.filters.status} onChange={(e) => t.setFilter("status", e.target.value)} aria-label="Status" />
        </Toolbar>
        <DataTable columns={columns} rows={data?.items} loading={loading} error={error} onRetry={reload} sort={t.sort} onSort={t.toggleSort}
          onRowClick={(c) => navigate(`/portal/complaints/${c.id}`)}
          empty={<EmptyState title="No complaints" message="If something is wrong with your supply, meter or bill, let us know."
            action={<Button size="sm" onClick={() => setOpen(true)}>Submit a complaint</Button>} />} />
        {data && <Pagination page={data.page} pages={data.pages} total={data.total} pageSize={data.page_size} onPage={t.setPage} onPageSize={t.setPageSize} />}
      </Card>

      <Modal open={open} onClose={() => setOpen(false)} title="New complaint" subtitle="Our team will respond as soon as possible." size="lg"
        footer={<>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button loading={isSubmitting} icon={<Send className="h-4 w-4" />} onClick={handleSubmit(onSubmit)}>Submit complaint</Button>
        </>}>
        <form className="grid grid-cols-1 gap-4 sm:grid-cols-2" onSubmit={handleSubmit(onSubmit)} noValidate>
          <Field label="Category" required error={errors.category?.message}>
            <Select placeholder="Select category" invalid={!!errors.category} options={Object.entries(CATEGORY_LABELS).map(([value, l]) => ({ value, label: l }))} {...register("category")} />
          </Field>
          <Field label="Connection" hint="Optional">
            <Select placeholder="Not specific to a connection" options={(profile?.connections ?? []).map((c) => ({ value: c.id, label: `${c.connection_code} · ${c.meter_number}` }))} {...register("connection_id")} />
          </Field>
          <Field label="Subject" required error={errors.subject?.message} className="sm:col-span-2">
            <Input invalid={!!errors.subject} {...register("subject")} />
          </Field>
          <Field label="Description" required error={errors.description?.message} className="sm:col-span-2">
            <Textarea rows={5} invalid={!!errors.description} {...register("description")} />
          </Field>
          <Field label="Priority">
            <Select options={[{ value: "low", label: "Low" }, { value: "medium", label: "Medium" }, { value: "high", label: "High" }]} {...register("priority")} />
          </Field>
        </form>
      </Modal>
    </div>
  );
}
