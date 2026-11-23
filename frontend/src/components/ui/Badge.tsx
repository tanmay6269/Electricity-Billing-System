import clsx from "clsx";
import { AlertTriangle, CheckCircle2, Circle, Clock, FileEdit, Forward, MinusCircle, XCircle } from "lucide-react";
import type { ReactNode } from "react";

type Tone = "green" | "orange" | "red" | "blue" | "gray" | "navy" | "sky";

const tones: Record<Tone, string> = {
  green: "bg-ok-50 text-ok-700 ring-ok-600/20",
  orange: "bg-warn-50 text-warn-700 ring-warn-600/20",
  red: "bg-bad-50 text-bad-700 ring-bad-600/20",
  blue: "bg-brand-50 text-brand-700 ring-brand-600/20",
  sky: "bg-sky-50 text-sky-700 ring-sky-600/20",
  gray: "bg-slate-100 text-slate-600 ring-slate-500/20",
  navy: "bg-navy-800 text-white ring-navy-800",
};

export function Badge({ tone = "gray", children, icon, className }: { tone?: Tone; children: ReactNode; icon?: ReactNode; className?: string }) {
  return (
    <span className={clsx("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset", tones[tone], className)}>
      {icon}
      {children}
    </span>
  );
}

const STATUS: Record<string, { tone: Tone; label: string; icon?: typeof Circle }> = {
  // bills
  draft: { tone: "gray", label: "Draft", icon: FileEdit },
  generated: { tone: "blue", label: "Generated", icon: Circle },
  pending: { tone: "orange", label: "Pending", icon: Clock },
  partially_paid: { tone: "orange", label: "Partially Paid", icon: Clock },
  paid: { tone: "green", label: "Paid", icon: CheckCircle2 },
  overdue: { tone: "red", label: "Overdue", icon: AlertTriangle },
  cancelled: { tone: "gray", label: "Cancelled", icon: XCircle },
  carried: { tone: "gray", label: "Carried Fwd", icon: Forward },
  // payments
  successful: { tone: "green", label: "Successful", icon: CheckCircle2 },
  failed: { tone: "red", label: "Failed", icon: XCircle },
  refunded: { tone: "gray", label: "Refunded", icon: MinusCircle },
  // customers / connections / tariffs / users
  active: { tone: "green", label: "Active" },
  inactive: { tone: "gray", label: "Inactive" },
  suspended: { tone: "orange", label: "Suspended" },
  disconnected: { tone: "red", label: "Disconnected" },
  working: { tone: "green", label: "Working" },
  faulty: { tone: "red", label: "Faulty" },
  replaced: { tone: "gray", label: "Replaced" },
  removed: { tone: "gray", label: "Removed" },
  // complaints
  submitted: { tone: "blue", label: "Submitted" },
  under_review: { tone: "sky", label: "Under Review" },
  assigned: { tone: "sky", label: "Assigned" },
  in_progress: { tone: "orange", label: "In Progress" },
  resolved: { tone: "green", label: "Resolved", icon: CheckCircle2 },
  closed: { tone: "gray", label: "Closed" },
  // priority
  low: { tone: "gray", label: "Low" },
  medium: { tone: "blue", label: "Medium" },
  high: { tone: "orange", label: "High" },
  critical: { tone: "red", label: "Critical", icon: AlertTriangle },
};

/** Status pill: colour always comes with a text label (and an icon for money states). */
export function StatusBadge({ status, carried }: { status: string; carried?: boolean }) {
  const s = carried && status !== "paid" && status !== "cancelled" ? STATUS.carried : STATUS[status] ?? { tone: "gray" as Tone, label: status };
  const Icon = s.icon;
  return (
    <Badge tone={s.tone} icon={Icon ? <Icon className="h-3 w-3" /> : undefined}>
      {s.label}
    </Badge>
  );
}

const TYPE_TONE: Record<string, Tone> = { residential: "blue", commercial: "orange", industrial: "sky" };
export function TypeBadge({ type }: { type: string }) {
  return <Badge tone={TYPE_TONE[type] ?? "gray"}>{type.charAt(0).toUpperCase() + type.slice(1)}</Badge>;
}
