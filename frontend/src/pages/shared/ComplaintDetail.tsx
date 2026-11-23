import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, CheckCircle2, Circle, UserPlus } from "lucide-react";
import clsx from "clsx";
import { toast } from "sonner";
import { api, errorMessage } from "@/services/api";
import { useApi } from "@/hooks/useApi";
import { useAuth } from "@/context/AuthContext";
import { Card, CardBody, CardHeader, InfoGrid, PageHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/Badge";
import { Field, Select, Textarea } from "@/components/ui/Form";
import { Alert, ErrorState, LoadingBlock } from "@/components/ui/States";
import type { Complaint } from "@/types";
import { CATEGORY_LABELS, dateTime, label } from "@/utils/format";

const FLOW = ["submitted", "under_review", "assigned", "in_progress", "resolved", "closed"];
const NEXT: Record<string, string[]> = {
  submitted: ["under_review", "assigned", "in_progress", "resolved", "closed"],
  under_review: ["assigned", "in_progress", "resolved", "closed"],
  assigned: ["in_progress", "under_review", "resolved", "closed"],
  in_progress: ["resolved", "assigned", "closed"],
  resolved: ["closed", "in_progress"],
  closed: [],
};

export default function ComplaintDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const isStaff = user?.role !== "customer";
  const { data: c, loading, error, reload, setData } = useApi<Complaint>(`/api/complaints/${id}`);
  const { data: staff } = useApi<{ id: number; full_name: string; role: string }[]>(isStaff ? "/api/users/assignable" : null);
  const [status, setStatus] = useState("");
  const [note, setNote] = useState("");
  const [resolution, setResolution] = useState("");
  const [assignee, setAssignee] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (c) {
      setStatus(NEXT[c.status][0] ?? "");
      setResolution(c.resolution_notes ?? "");
      setAssignee(c.assigned_to ? String(c.assigned_to) : "");
    }
  }, [c]);

  if (loading && !c) return <LoadingBlock />;
  if (error || !c) return <ErrorState message={error ?? "Not found"} onRetry={reload} />;
  const back = isStaff ? "/app/complaints" : "/portal/complaints";
  const reached = FLOW.indexOf(c.status);

  const updateStatus = async () => {
    setBusy(true);
    try {
      const { data } = await api.put(`/api/complaints/${c.id}/status`, { status, note: note || null, resolution_notes: resolution || null });
      setData(data);
      setNote("");
      toast.success("Status updated - customer notified");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const assign = async () => {
    setBusy(true);
    try {
      const { data } = await api.put(`/api/complaints/${c.id}/assign`, { assigned_to: Number(assignee) });
      setData(data);
      toast.success("Complaint assigned");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader
        back={<Link to={back} className="mb-2 inline-flex items-center gap-1 text-xs font-medium text-ink-muted hover:text-ink"><ArrowLeft className="h-3.5 w-3.5" /> Complaints</Link>}
        title={c.subject}
        subtitle={<span className="flex flex-wrap items-center gap-2">{c.complaint_code} · {CATEGORY_LABELS[c.category]} <StatusBadge status={c.status} /> <StatusBadge status={c.priority} /></span>}
      />

      {/* progress tracker */}
      <Card className="mb-6 overflow-x-auto">
        <ol className="flex min-w-[640px] items-center px-5 py-4">
          {FLOW.map((s, i) => (
            <li key={s} className="flex flex-1 items-center">
              <div className="flex flex-col items-center gap-1">
                {i <= reached ? <CheckCircle2 className="h-5 w-5 text-brand-600" /> : <Circle className="h-5 w-5 text-slate-300" />}
                <span className={clsx("text-[11px] font-medium", i <= reached ? "text-ink" : "text-ink-faint")}>{label(s)}</span>
              </div>
              {i < FLOW.length - 1 && <div className={clsx("mx-2 h-0.5 flex-1", i < reached ? "bg-brand-600" : "bg-slate-200")} />}
            </li>
          ))}
        </ol>
      </Card>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card>
            <CardHeader title="Description" />
            <CardBody>
              <p className="whitespace-pre-line text-sm text-ink-soft">{c.description}</p>
              {c.resolution_notes && <div className="mt-4"><Alert tone="success" title="Resolution">{c.resolution_notes}</Alert></div>}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Timeline" subtitle="Every status change is recorded" />
            <CardBody>
              <ol className="relative space-y-5 border-l border-line pl-6">
                {c.timeline?.map((u) => (
                  <li key={u.id}>
                    <span className="absolute -left-[7px] mt-1 h-3.5 w-3.5 rounded-full border-2 border-white bg-brand-600 ring-1 ring-brand-200" />
                    <div className="flex flex-wrap items-center gap-2"><StatusBadge status={u.status} /><span className="text-xs text-ink-muted">{u.by}{u.by_role ? ` (${u.by_role})` : ""} · {dateTime(u.created_at)}</span></div>
                    {u.note && <p className="mt-1.5 text-sm text-ink-soft">{u.note}</p>}
                  </li>
                ))}
              </ol>
            </CardBody>
          </Card>
        </div>
        <div className="space-y-6">
          <Card>
            <CardHeader title="Details" />
            <CardBody>
              <InfoGrid items={[
                { label: "Customer", value: isStaff ? <Link className="text-brand-600" to={`/app/customers/${c.customer_id}`}>{c.customer_name}</Link> : c.customer_name },
                { label: "Connection", value: c.connection_code ?? "-" },
                { label: "Submitted", value: dateTime(c.created_at) },
                { label: "Assigned to", value: c.assigned_to_name ?? "Not yet" },
                { label: "Last update", value: dateTime(c.updated_at) },
                { label: "Resolved", value: dateTime(c.resolved_at) },
              ]} />
            </CardBody>
          </Card>
          {isStaff && c.status !== "closed" && (
            <>
              <Card>
                <CardHeader title="Assign staff" />
                <CardBody className="space-y-3">
                  <Select placeholder="Select staff member" value={assignee} onChange={(e) => setAssignee(e.target.value)} options={(staff ?? []).map((s) => ({ value: s.id, label: `${s.full_name} (${s.role})` }))} />
                  <Button variant="outline" className="w-full" icon={<UserPlus className="h-4 w-4" />} disabled={!assignee || String(c.assigned_to) === assignee} loading={busy} onClick={assign}>Assign</Button>
                </CardBody>
              </Card>
              <Card>
                <CardHeader title="Update status" subtitle="The customer is notified automatically." />
                <CardBody className="space-y-3">
                  <Field label="New status"><Select value={status} onChange={(e) => setStatus(e.target.value)} options={NEXT[c.status].map((s) => ({ value: s, label: label(s) }))} /></Field>
                  <Field label="Note to customer"><Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
                  {(status === "resolved" || status === "closed") && (
                    <Field label="Resolution notes" required><Textarea rows={3} value={resolution} onChange={(e) => setResolution(e.target.value)} /></Field>
                  )}
                  <Button className="w-full" loading={busy} disabled={!status} onClick={updateStatus}>Update status</Button>
                </CardBody>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
