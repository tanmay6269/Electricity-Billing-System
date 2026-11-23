import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle, Cable, FileText, Gauge, IndianRupee, MessageSquareWarning, Plus, RefreshCw, Users, Wallet, Zap,
} from "lucide-react";
import clsx from "clsx";
import { useApi } from "@/hooks/useApi";
import { useAuth } from "@/context/AuthContext";
import { KpiCard } from "@/components/ui/KpiCard";
import { Card, CardHeader, PageHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/Badge";
import { ErrorState, LoadingBlock } from "@/components/ui/States";
import { ChartCard, Donut, GroupedBars, HBars, StackedBars, STATUS_COLORS, SERIES, TrendArea, TrendLines } from "@/components/charts/Charts";
import { compact, currentPeriod, label, money, moneyShort, number, period, timeAgo } from "@/utils/format";

interface DashboardData {
  range: { from: string; to: string };
  kpis: {
    current_period: string;
    total_customers: { value: number; new_this_month: number; change_pct: number | null; note: string };
    active_connections: { value: number; total: number; note: string };
    bills_this_month: { value: number; previous: number; change_pct: number | null };
    total_revenue: { value: number; this_month: number; previous: number; change_pct: number | null };
    pending_payments: { value: number; count: number };
    overdue_bills: { value: number; amount: number };
    units_consumed: { value: number; latest_period: string; latest: number; previous: number; change_pct: number | null };
    open_complaints: { value: number; new_this_month: number; change_pct: number | null };
  };
  consumption: { period: string; residential: number; commercial: number; industrial: number; total: number }[];
  revenue: { period: string; revenue: number; payments: number }[];
  billing: { period: string; billed: number; collected: number; bills: number }[];
  bill_status: { status: string; count: number; amount: number }[];
  customer_growth: { period: string; new_customers: number; total_customers: number }[];
  distribution: { by_type: { customer_type: string; units: number; connections: number }[]; by_band: { band: string; readings: number }[] };
  recent_bills: { id: number; invoice_number: string; customer_name: string; total_amount: number; status: string; billing_period: string }[];
  recent_payments: { id: number; transaction_id: string; customer_name: string; amount: number; status: string; method: string; payment_date: string }[];
}

const PRESETS = [
  { key: "6m", label: "6 months", months: 6 },
  { key: "12m", label: "12 months", months: 12 },
];

export default function Dashboard() {
  const { user } = useAuth();
  const [preset, setPreset] = useState<string>("12m");
  const [from, setFrom] = useState(currentPeriod(-11));
  const [to, setTo] = useState(currentPeriod(0));
  const [year, setYear] = useState("");
  const params = year ? { year } : { period_from: from, period_to: to };
  const { data, loading, error, reload } = useApi<DashboardData>("/api/analytics/dashboard", params);
  const years = useMemo(() => {
    const y = new Date().getFullYear();
    return [y, y - 1, y - 2].map(String);
  }, []);

  const applyPreset = (key: string, months: number) => {
    setPreset(key);
    setYear("");
    setFrom(currentPeriod(-(months - 1)));
    setTo(currentPeriod(0));
  };

  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  const k = data?.kpis;
  const isAdmin = user?.role === "admin";

  return (
    <div>
      <PageHeader
        title={isAdmin ? "Admin Dashboard" : "Staff Dashboard"}
        subtitle={`Welcome back, ${user?.full_name.split(" ")[0]}. Here is how the network is performing.`}
        actions={
          <>
            <Link to="/app/readings/new"><Button variant="outline" icon={<Gauge className="h-4 w-4" />}>Add reading</Button></Link>
            <Link to="/app/billing"><Button icon={<FileText className="h-4 w-4" />}>Generate bills</Button></Link>
          </>
        }
      />

      {/* Filters: one row above the charts */}
      <div className="card mb-6 flex flex-col gap-3 p-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="flex rounded-lg border border-line p-0.5">
          {PRESETS.map((p) => (
            <button key={p.key} onClick={() => applyPreset(p.key, p.months)}
              className={clsx("rounded-md px-3 py-1.5 text-xs font-medium", preset === p.key && !year ? "bg-navy-800 text-white" : "text-ink-soft hover:bg-slate-100")}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex min-w-0 items-center gap-2 text-xs text-ink-muted">
          <span>From</span>
          <input type="month" aria-label="From month" className="input h-8 min-w-0 flex-1 sm:w-[175px] sm:flex-none" value={from} max={to}
            onChange={(e) => { setFrom(e.target.value); setPreset(""); setYear(""); }} />
          <span>to</span>
          <input type="month" aria-label="To month" className="input h-8 min-w-0 flex-1 sm:w-[175px] sm:flex-none" value={to} min={from}
            onChange={(e) => { setTo(e.target.value); setPreset(""); setYear(""); }} />
        </div>
        <select aria-label="Year" className="input h-8 w-[160px]" value={year} onChange={(e) => { setYear(e.target.value); setPreset(""); }}>
          <option value="">Monthly range</option>
          {years.map((y) => <option key={y} value={y}>Year {y}</option>)}
        </select>
        <div className="flex-1" />
        <Button variant="ghost" size="sm" onClick={reload} loading={loading} icon={<RefreshCw className="h-3.5 w-3.5" />}>Refresh</Button>
      </div>

      {!data ? (
        <LoadingBlock />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard label="Total Customers" value={number(k!.total_customers.value)} icon={<Users className="h-[18px] w-[18px]" />}
              change={k!.total_customers.change_pct} note={`${k!.total_customers.new_this_month} new this month`} />
            <KpiCard label="Active Connections" value={number(k!.active_connections.value)} icon={<Cable className="h-[18px] w-[18px]" />}
              iconClass="bg-sky-50 text-sky-600" note={k!.active_connections.note} />
            <KpiCard label="Bills Generated This Month" value={number(k!.bills_this_month.value)} icon={<FileText className="h-[18px] w-[18px]" />}
              iconClass="bg-indigo-50 text-indigo-600" change={k!.bills_this_month.change_pct} note={`vs ${k!.bills_this_month.previous} last month`} />
            <KpiCard label="Total Revenue" value={moneyShort(k!.total_revenue.value)} icon={<IndianRupee className="h-[18px] w-[18px]" />}
              iconClass="bg-ok-50 text-ok-600" change={k!.total_revenue.change_pct} note={`${moneyShort(k!.total_revenue.this_month)} this month`} />
            <KpiCard label="Pending Payments" value={moneyShort(k!.pending_payments.value)} icon={<Wallet className="h-[18px] w-[18px]" />}
              iconClass="bg-warn-50 text-warn-600" note={`${k!.pending_payments.count} open bills`} />
            <KpiCard label="Overdue Bills" value={number(k!.overdue_bills.value)} icon={<AlertTriangle className="h-[18px] w-[18px]" />}
              iconClass="bg-bad-50 text-bad-600" note={`${moneyShort(k!.overdue_bills.amount)} overdue`} />
            <KpiCard label="Units Consumed (all time)" value={`${compact(k!.units_consumed.value)} kWh`} icon={<Zap className="h-[18px] w-[18px]" />}
              iconClass="bg-amber-50 text-amber-600" change={k!.units_consumed.change_pct} goodWhenUp={false}
              note={`${period(k!.units_consumed.latest_period)}: ${compact(k!.units_consumed.latest)} kWh`} />
            <KpiCard label="Open Complaints" value={number(k!.open_complaints.value)} icon={<MessageSquareWarning className="h-[18px] w-[18px]" />}
              iconClass="bg-rose-50 text-rose-600" change={k!.open_complaints.change_pct} goodWhenUp={false}
              note={`${k!.open_complaints.new_this_month} new this month`} />
          </div>

          <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
            <div className="xl:col-span-2">
              <ChartCard title="Monthly electricity consumption" subtitle="Units (kWh) by customer category"
                table={{ columns: [{ key: "period", label: "Month" }, { key: "residential", label: "Residential", fmt: number }, { key: "commercial", label: "Commercial", fmt: number }, { key: "industrial", label: "Industrial", fmt: number }, { key: "total", label: "Total", fmt: number }], rows: data.consumption }}>
                <StackedBars data={data.consumption} xKey="period" valueFmt={(v) => `${number(v)} kWh`}
                  series={[{ key: "residential", name: "Residential", color: SERIES.residential }, { key: "commercial", name: "Commercial", color: SERIES.commercial }, { key: "industrial", name: "Industrial", color: SERIES.industrial }]} />
              </ChartCard>
            </div>
            <ChartCard title="Paid vs unpaid bills" subtitle="Bill count by payment status"
              table={{ columns: [{ key: "status", label: "Status" }, { key: "count", label: "Bills", fmt: number }, { key: "amount", label: "Amount", fmt: money }], rows: data.bill_status.map((s) => ({ ...s, status: label(s.status) })) }}>
              <Donut
                data={data.bill_status.map((s) => ({ name: label(s.status), value: s.count, color: STATUS_COLORS[s.status] ?? "#94A3B8" }))}
                valueFmt={(v) => `${number(v)} bills`}
                centerValue={number(data.bill_status.reduce((a, b) => a + b.count, 0))}
                centerLabel="bills"
              />
            </ChartCard>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <ChartCard title="Monthly revenue" subtitle="Successful payments collected"
              table={{ columns: [{ key: "period", label: "Month" }, { key: "revenue", label: "Revenue", fmt: money }, { key: "payments", label: "Payments", fmt: number }], rows: data.revenue }}>
              <TrendArea data={data.revenue} xKey="period" dataKey="revenue" name="Revenue" valueFmt={money} />
            </ChartCard>
            <ChartCard title="Revenue by billing period" subtitle="Amount billed vs collected for each period"
              table={{ columns: [{ key: "period", label: "Period" }, { key: "billed", label: "Billed", fmt: money }, { key: "collected", label: "Collected", fmt: money }, { key: "bills", label: "Bills", fmt: number }], rows: data.billing }}>
              <GroupedBars data={data.billing} xKey="period" valueFmt={money}
                series={[{ key: "billed", name: "Billed", color: SERIES.s1 }, { key: "collected", name: "Collected", color: SERIES.s3 }]} />
            </ChartCard>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
            <ChartCard title="Customer growth" subtitle="Total registered customers"
              table={{ columns: [{ key: "period", label: "Month" }, { key: "new_customers", label: "New", fmt: number }, { key: "total_customers", label: "Total", fmt: number }], rows: data.customer_growth }}>
              <TrendLines data={data.customer_growth} xKey="period" valueFmt={number}
                series={[{ key: "total_customers", name: "Customers", color: SERIES.s1 }]} />
            </ChartCard>
            <ChartCard title="Consumption distribution" subtitle="Share of units by category"
              table={{ columns: [{ key: "customer_type", label: "Category" }, { key: "units", label: "Units", fmt: number }, { key: "connections", label: "Connections", fmt: number }], rows: data.distribution.by_type }}>
              <Donut
                data={data.distribution.by_type.map((d) => ({ name: label(d.customer_type), value: d.units, color: SERIES[d.customer_type as keyof typeof SERIES] ?? "#94A3B8" }))}
                valueFmt={(v) => `${compact(v)} kWh`}
              />
            </ChartCard>
            <ChartCard title="Monthly usage bands" subtitle="Readings grouped by units consumed"
              table={{ columns: [{ key: "band", label: "Units band" }, { key: "readings", label: "Readings", fmt: number }], rows: data.distribution.by_band }}>
              <HBars data={data.distribution.by_band.map((b) => ({ name: b.band, value: b.readings }))} valueFmt={(v) => `${v} readings`} />
            </ChartCard>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader title="Recent bills" action={<Link to="/app/bills" className="text-xs font-medium text-brand-600">View all</Link>} />
              <ul className="divide-y divide-line">
                {data.recent_bills.map((b) => (
                  <li key={b.id}>
                    <Link to={`/app/bills/${b.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-slate-50">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-ink">{b.customer_name}</p>
                        <p className="text-xs text-ink-muted">{b.invoice_number} · {period(b.billing_period)}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-medium tabular-nums">{money(b.total_amount)}</span>
                        <StatusBadge status={b.status} />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </Card>
            <Card>
              <CardHeader title="Recent transactions" action={<Link to="/app/payments" className="text-xs font-medium text-brand-600">View all</Link>} />
              <ul className="divide-y divide-line">
                {data.recent_payments.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">{p.customer_name}</p>
                      <p className="truncate text-xs text-ink-muted">{p.transaction_id} · {timeAgo(p.payment_date)}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium tabular-nums">{money(p.amount)}</span>
                      <StatusBadge status={p.status} />
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          </div>

          {!isAdmin && (
            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { to: "/app/customers/new", label: "Add customer", icon: Plus },
                { to: "/app/readings/new", label: "Enter reading", icon: Gauge },
                { to: "/app/billing", label: "Generate bills", icon: FileText },
                { to: "/app/complaints", label: "Handle complaints", icon: MessageSquareWarning },
              ].map((q) => (
                <Link key={q.to} to={q.to} className="card flex items-center gap-3 p-4 text-sm font-medium text-ink-soft transition hover:border-brand-200 hover:text-brand-700">
                  <q.icon className="h-5 w-5 text-brand-600" /> {q.label}
                </Link>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
