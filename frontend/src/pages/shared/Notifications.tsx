import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertTriangle, Bell, CheckCheck, CreditCard, FileText, MessageSquareWarning, PlugZap, XCircle } from "lucide-react";
import clsx from "clsx";
import { toast } from "sonner";
import { api, errorMessage } from "@/services/api";
import { useApi } from "@/hooks/useApi";
import { Card, PageHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Pagination } from "@/components/ui/DataTable";
import { EmptyState, ErrorState, LoadingBlock } from "@/components/ui/States";
import type { Notification, Page } from "@/types";
import { dateTime, timeAgo } from "@/utils/format";

const ICONS: Record<string, { icon: typeof Bell; cls: string }> = {
  bill_generated: { icon: FileText, cls: "bg-brand-50 text-brand-600" },
  bill_due_soon: { icon: Bell, cls: "bg-warn-50 text-warn-600" },
  bill_overdue: { icon: AlertTriangle, cls: "bg-bad-50 text-bad-600" },
  payment_successful: { icon: CreditCard, cls: "bg-ok-50 text-ok-600" },
  payment_failed: { icon: XCircle, cls: "bg-bad-50 text-bad-600" },
  payment_refunded: { icon: CreditCard, cls: "bg-slate-100 text-slate-600" },
  complaint_status: { icon: MessageSquareWarning, cls: "bg-sky-50 text-sky-600" },
  complaint_new: { icon: MessageSquareWarning, cls: "bg-sky-50 text-sky-600" },
  complaint_assigned: { icon: MessageSquareWarning, cls: "bg-indigo-50 text-indigo-600" },
  connection_status: { icon: PlugZap, cls: "bg-amber-50 text-amber-600" },
};

export default function Notifications() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const { data, loading, error, reload, setData } = useApi<Page<Notification>>("/api/notifications", { page, page_size: 15, unread_only: unreadOnly || undefined });

  const changed = () => window.dispatchEvent(new Event("notifications:changed"));
  const markAll = async () => {
    try {
      await api.put("/api/notifications/read-all");
      toast.success("All notifications marked as read");
      changed();
      reload();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  const open = async (n: Notification) => {
    if (!n.is_read) {
      try {
        await api.put(`/api/notifications/${n.id}/read`);
        setData((d) => (d ? { ...d, items: d.items.map((x) => (x.id === n.id ? { ...x, is_read: true } : x)) } : d));
        changed();
      } catch {
        /* ignore */
      }
    }
    if (n.link) navigate(n.link);
  };

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Notifications" subtitle="Bills, payments, complaints and connection updates."
        actions={<Button variant="outline" icon={<CheckCheck className="h-4 w-4" />} onClick={markAll}>Mark all as read</Button>} />
      <Card>
        <div className="flex gap-1 border-b border-line px-3 pt-2">
          {[["All", false], ["Unread", true]].map(([l, v]) => (
            <button key={String(l)} onClick={() => { setUnreadOnly(v as boolean); setPage(1); }}
              className={clsx("-mb-px border-b-2 px-3 py-2.5 text-sm font-medium", unreadOnly === v ? "border-brand-600 text-brand-700" : "border-transparent text-ink-muted hover:text-ink")}>{l as string}</button>
          ))}
        </div>
        {error ? <ErrorState message={error} onRetry={reload} /> : loading && !data ? <LoadingBlock /> : !data?.items.length ? (
          <EmptyState icon={<Bell className="h-6 w-6" />} title={unreadOnly ? "You're all caught up" : "No notifications yet"} />
        ) : (
          <ul className="divide-y divide-line">
            {data.items.map((n) => {
              const meta = ICONS[n.type] ?? { icon: Bell, cls: "bg-slate-100 text-slate-600" };
              return (
                <li key={n.id}>
                  <button onClick={() => open(n)} className={clsx("flex w-full gap-3 px-5 py-4 text-left transition hover:bg-slate-50", !n.is_read && "bg-brand-50/40")}>
                    <span className={clsx("flex h-9 w-9 shrink-0 items-center justify-center rounded-full", meta.cls)}><meta.icon className="h-4 w-4" /></span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-start justify-between gap-2">
                        <span className={clsx("text-sm", n.is_read ? "font-medium text-ink-soft" : "font-semibold text-ink")}>{n.title}</span>
                        <span className="shrink-0 text-xs text-ink-faint" title={dateTime(n.created_at)}>{timeAgo(n.created_at)}</span>
                      </span>
                      <span className="mt-0.5 block text-sm text-ink-muted">{n.message}</span>
                    </span>
                    {!n.is_read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-600" aria-label="Unread" />}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {data && <Pagination page={data.page} pages={data.pages} total={data.total} pageSize={data.page_size} onPage={setPage} />}
      </Card>
    </div>
  );
}
