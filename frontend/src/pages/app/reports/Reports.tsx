import { useState } from "react";
import { AlertTriangle, BarChart3, CalendarRange, ClipboardList, Download, FileText, Layers, MessageSquareWarning, Tags, Users, Wallet, Zap } from "lucide-react";
import clsx from "clsx";
import { toast } from "sonner";
import { downloadFile, errorMessage } from "@/services/api";
import { useApi } from "@/hooks/useApi";
import { Card, PageHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Field, Input, Select } from "@/components/ui/Form";
import { ErrorState, LoadingBlock, EmptyState } from "@/components/ui/States";
import type { Tariff } from "@/types";
import { money, number } from "@/utils/format";

const REPORTS = [
  { key: "revenue", title: "Monthly revenue", icon: BarChart3, filters: ["date", "year", "month", "customer_type"] },
  { key: "annual-revenue", title: "Annual revenue", icon: CalendarRange, filters: ["year", "customer_type"] },
  { key: "customers", title: "Customer report", icon: Users, filters: ["customer_type", "customer_status"] },
  { key: "consumption", title: "Electricity consumption", icon: Zap, filters: ["date", "year", "month", "customer_type", "tariff"] },
  { key: "pending", title: "Pending payments", icon: Wallet, filters: ["date", "year", "month", "customer_type", "bill_status", "tariff"] },
  { key: "overdue", title: "Overdue bills", icon: AlertTriangle, filters: ["date", "year", "month", "customer_type", "tariff"] },
  { key: "payments", title: "Payment history", icon: ClipboardList, filters: ["date", "year", "month", "customer_type", "payment_status"] },
  { key: "tariffs", title: "Tariff report", icon: Tags, filters: ["customer_type", "tariff_status", "tariff"] },
  { key: "complaints", title: "Complaint report", icon: MessageSquareWarning, filters: ["date", "year", "customer_type", "complaint_status"] },
  { key: "categories", title: "Customer categories", icon: Layers, filters: ["year", "month", "customer_type"] },
] as const;

const STATUS_OPTIONS: Record<string, string[]> = {
  customer_status: ["active", "inactive", "suspended"],
  bill_status: ["generated", "pending", "partially_paid", "overdue"],
  payment_status: ["successful", "failed", "refunded"],
  tariff_status: ["active", "inactive"],
  complaint_status: ["submitted", "under_review", "assigned", "in_progress", "resolved", "closed"],
};

interface ReportData { title: string; columns: { key: string; label: string; type?: string | null }[]; rows: Record<string, unknown>[]; summary: Record<string, string | number>; filters: string }

export default function Reports() {
  const [active, setActive] = useState<(typeof REPORTS)[number]>(REPORTS[0]);
  const [f, setF] = useState({ date_from: "", date_to: "", year: "", month: "", customer_type: "", status: "", tariff_id: "" });
  const params = { ...f };
  const { data, loading, error, reload } = useApi<ReportData>(`/api/reports/${active.key}`, params);
  const { data: tariffs } = useApi<Tariff[]>("/api/tariffs");
  const [dl, setDl] = useState("");
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((s) => ({ ...s, [k]: e.target.value }));
  const has = (x: string) => (active.filters as readonly string[]).includes(x);
  const statusKey = active.filters.find((x) => x.endsWith("_status"));
  const years = Array.from({ length: 4 }, (_, i) => String(new Date().getFullYear() - i));

  const download = async (format: "csv" | "pdf") => {
    setDl(format);
    try { await downloadFile(`/api/reports/${active.key}`, { ...params, format }); }
    catch (e) { toast.error(errorMessage(e)); }
    finally { setDl(""); }
  };

  return (
    <div>
      <PageHeader title="Reports & Analytics" subtitle="Every report is generated live from the database. Export to CSV or PDF." />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[240px_1fr]">
        <Card className="h-fit p-2">
          <nav className="flex gap-1 overflow-x-auto lg:flex-col">
            {REPORTS.map((r) => (
              <button key={r.key} onClick={() => { setActive(r); setF((s) => ({ ...s, status: "" })); }}
                className={clsx("flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13px] font-medium", active.key === r.key ? "bg-brand-50 text-brand-700" : "text-ink-soft hover:bg-slate-50")}>
                <r.icon className="h-4 w-4" /> {r.title}
              </button>
            ))}
          </nav>
        </Card>
        <div className="min-w-0 space-y-4">
          <Card className="p-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {has("date") && <Field label="From date"><Input type="date" value={f.date_from} onChange={set("date_from")} /></Field>}
              {has("date") && <Field label="To date"><Input type="date" value={f.date_to} onChange={set("date_to")} /></Field>}
              {has("year") && <Field label="Year"><Select value={f.year} onChange={set("year")} placeholder="Any year" options={years.map((y) => ({ value: y, label: y }))} /></Field>}
              {has("month") && <Field label="Month" hint={f.month && !f.year ? "Pick a year too" : undefined}><Select value={f.month} onChange={set("month")} placeholder="Any month" options={Array.from({ length: 12 }, (_, i) => ({ value: String(i + 1), label: new Date(2000, i, 1).toLocaleString("en", { month: "long" }) }))} /></Field>}
              {has("customer_type") && <Field label="Customer type"><Select value={f.customer_type} onChange={set("customer_type")} placeholder="All types" options={["residential", "commercial", "industrial"].map((s) => ({ value: s, label: s[0].toUpperCase() + s.slice(1) }))} /></Field>}
              {statusKey && <Field label="Status"><Select value={f.status} onChange={set("status")} placeholder="Any status" options={STATUS_OPTIONS[statusKey].map((s) => ({ value: s, label: s.replace("_", " ").replace(/^\w/, (x) => x.toUpperCase()) }))} /></Field>}
              {has("tariff") && <Field label="Tariff"><Select value={f.tariff_id} onChange={set("tariff_id")} placeholder="All tariffs" options={(tariffs ?? []).map((t) => ({ value: t.id, label: t.name }))} /></Field>}
            </div>
            <div className="mt-3 flex flex-wrap justify-between gap-2">
              <Button variant="ghost" size="sm" onClick={() => setF({ date_from: "", date_to: "", year: "", month: "", customer_type: "", status: "", tariff_id: "" })}>Clear filters</Button>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" loading={dl === "csv"} icon={<Download className="h-3.5 w-3.5" />} onClick={() => download("csv")}>CSV</Button>
                <Button size="sm" loading={dl === "pdf"} icon={<FileText className="h-3.5 w-3.5" />} onClick={() => download("pdf")}>PDF</Button>
              </div>
            </div>
          </Card>
          <Card>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-4">
              <div><h3 className="text-[15px]">{data?.title ?? active.title}</h3><p className="text-xs text-ink-muted">{data?.filters || "No filters applied"}</p></div>
              {data?.summary && <div className="flex flex-wrap gap-2">{Object.entries(data.summary).map(([k, v]) => <span key={k} className="rounded-md bg-slate-100 px-2 py-1 text-xs"><span className="text-ink-muted">{k}:</span> <b>{v}</b></span>)}</div>}
            </div>
            {error ? <ErrorState message={error} onRetry={reload} /> : loading && !data ? <LoadingBlock /> : !data?.rows.length ? <EmptyState title="No records for these filters" /> : (
              <div className="max-h-[560px] overflow-auto">
                <table className="min-w-full divide-y divide-line">
                  <thead className="sticky top-0 bg-slate-50"><tr>{data.columns.map((c) => <th key={c.key} className={clsx("table-th", c.type === "money" && "text-right")}>{c.label}</th>)}</tr></thead>
                  <tbody className="divide-y divide-line">
                    {data.rows.map((r, i) => (
                      <tr key={i} className="hover:bg-slate-50/60">
                        {data.columns.map((c) => {
                          const v = r[c.key];
                          return <td key={c.key} className={clsx("table-td", (c.type === "money" || typeof v === "number") && "text-right tabular-nums")}>{v == null ? "-" : c.type === "money" ? money(Number(v)) : typeof v === "number" ? number(v) : String(v).replace(/_/g, " ")}</td>;
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
