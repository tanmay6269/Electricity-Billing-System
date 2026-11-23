const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2 });
const inrShort = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 });
const num = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 2 });

export const money = (v: number | null | undefined) => (v == null ? "-" : inr.format(v));
export const moneyShort = (v: number | null | undefined) => (v == null ? "-" : inrShort.format(v));
export const number = (v: number | null | undefined) => (v == null ? "-" : num.format(v));
export const units = (v: number | null | undefined) => (v == null ? "-" : `${num.format(v)} kWh`);

/** Compact axis labels: 1.2L, 3.4K (Indian lakh / crore). */
export function compact(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e7) return `${(v / 1e7).toFixed(1)}Cr`;
  if (a >= 1e5) return `${(v / 1e5).toFixed(1)}L`;
  if (a >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return `${Math.round(v)}`;
}

export function date(v: string | null | undefined): string {
  if (!v) return "-";
  const d = new Date(v.length === 10 ? `${v}T00:00:00` : v);
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export function dateTime(v: string | null | undefined): string {
  if (!v) return "-";
  return new Date(v).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function period(p: string | null | undefined): string {
  if (!p) return "-";
  const [y, m] = p.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-IN", { month: "short", year: "numeric" });
}

export function periodShort(p: string): string {
  const [y, m] = p.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-IN", { month: "short" }) + ` '${String(y).slice(2)}`;
}

export function timeAgo(v: string): string {
  const s = Math.floor((Date.now() - new Date(v).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
  return date(v);
}

export const label = (v: string | null | undefined) =>
  !v ? "-" : v.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

export const METHOD_LABELS: Record<string, string> = {
  upi: "UPI",
  debit_card: "Debit Card",
  credit_card: "Credit Card",
  net_banking: "Net Banking",
  cash: "Cash",
  demo: "Demo Payment",
};

export const CATEGORY_LABELS: Record<string, string> = {
  incorrect_bill: "Incorrect electricity bill",
  meter_issue: "Meter issue",
  power_supply: "Power supply issue",
  payment_issue: "Payment issue",
  connection_issue: "Connection issue",
  other: "Other",
};

export function currentPeriod(offset = 0): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export const todayISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
