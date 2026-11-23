import type { ReactNode } from "react";
import { AlertCircle, Inbox, Loader2, RefreshCw } from "lucide-react";
import { Button } from "./Button";

export function Spinner({ className = "h-5 w-5" }: { className?: string }) {
  return <Loader2 className={`animate-spin text-brand-600 ${className}`} />;
}

export function LoadingBlock({ label = "Loading...", className = "py-16" }: { label?: string; className?: string }) {
  return (
    <div className={`flex flex-col items-center justify-center gap-3 text-ink-muted ${className}`}>
      <Spinner className="h-6 w-6" />
      <span className="text-xs">{label}</span>
    </div>
  );
}

export function Skeleton({ className = "h-4 w-full" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-slate-100 ${className}`} />;
}

export function EmptyState({ title = "Nothing here yet", message, action, icon }: { title?: string; message?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-ink-faint">{icon ?? <Inbox className="h-6 w-6" />}</div>
      <p className="font-medium text-ink">{title}</p>
      {message && <p className="mt-1 max-w-sm text-sm text-ink-muted">{message}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-bad-50 text-bad-600">
        <AlertCircle className="h-6 w-6" />
      </div>
      <p className="font-medium text-ink">Could not load data</p>
      <p className="mt-1 max-w-sm text-sm text-ink-muted">{message}</p>
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-4" icon={<RefreshCw className="h-3.5 w-3.5" />} onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}

export function Alert({ tone = "info", title, children }: { tone?: "info" | "warn" | "error" | "success"; title?: string; children: ReactNode }) {
  const t = {
    info: "border-brand-200 bg-brand-50 text-brand-700",
    warn: "border-warn-600/30 bg-warn-50 text-warn-700",
    error: "border-bad-600/30 bg-bad-50 text-bad-700",
    success: "border-ok-600/30 bg-ok-50 text-ok-700",
  }[tone];
  return (
    <div className={`rounded-lg border px-4 py-3 text-sm ${t}`}>
      {title && <p className="font-semibold">{title}</p>}
      <div className={title ? "mt-0.5" : ""}>{children}</div>
    </div>
  );
}
