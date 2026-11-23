import type { ReactNode } from "react";
import { TrendingDown, TrendingUp } from "lucide-react";
import clsx from "clsx";

/** Stat tile: value, comparison with previous month and an icon. `goodWhenUp` decides the trend colour. */
export function KpiCard({ label, value, icon, change, note, goodWhenUp = true, iconClass = "bg-brand-50 text-brand-600" }: {
  label: string; value: ReactNode; icon: ReactNode; change?: number | null; note?: ReactNode; goodWhenUp?: boolean; iconClass?: string;
}) {
  const hasChange = change !== undefined && change !== null;
  const up = (change ?? 0) >= 0;
  const good = up === goodWhenUp;
  return (
    <div className="card flex flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium text-ink-muted">{label}</p>
        <div className={clsx("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", iconClass)}>{icon}</div>
      </div>
      <p className="text-2xl font-semibold tabular-nums tracking-tight text-ink">{value}</p>
      <div className="flex min-h-[18px] flex-wrap items-center gap-1.5 text-xs">
        {hasChange && (
          <span className={clsx("inline-flex items-center gap-0.5 font-medium", good ? "text-ok-700" : "text-bad-700")}>
            {up ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
            {up ? "+" : ""}
            {change}%
          </span>
        )}
        {note && <span className="text-ink-muted">{note}</span>}
      </div>
    </div>
  );
}
