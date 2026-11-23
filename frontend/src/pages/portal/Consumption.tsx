import { Activity, ArrowUpRight, Gauge, Lightbulb, Sigma } from "lucide-react";
import { Card, CardBody, CardHeader, PageHeader } from "@/components/ui/Card";
import { KpiCard } from "@/components/ui/KpiCard";
import { EmptyState, ErrorState, LoadingBlock } from "@/components/ui/States";
import { ChartCard, GroupedBars, SERIES, TrendArea } from "@/components/charts/Charts";
import { useApi } from "@/hooks/useApi";
import { money, number, period, units } from "@/utils/format";
import type { CustomerProfile } from "@/types";

const TIPS = [
  "Set air conditioners to 24-26°C; each degree lower adds roughly 6% to cooling energy.",
  "Switch to LED bulbs and BEE 5-star rated appliances.",
  "Switch off appliances at the plug - standby power adds up over a month.",
  "Run washing machines and pumps with full loads, outside peak evening hours.",
  "Clean AC filters and refrigerator coils regularly for better efficiency.",
];

export default function Consumption() {
  const { data, loading, error, reload } = useApi<CustomerProfile>("/api/customers/me");
  if (loading && !data) return <LoadingBlock />;
  if (error || !data) return <ErrorState message={error ?? "No data"} onRetry={reload} />;

  // Sum across connections per period
  const byPeriod = new Map<string, number>();
  data.consumption_history.forEach((c) => byPeriod.set(c.billing_period, (byPeriod.get(c.billing_period) ?? 0) + c.units));
  const series = [...byPeriod.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([p, u]) => ({ period: p, units: u }));

  const charges = new Map<string, number>();
  data.bills.filter((b) => b.status !== "cancelled" && b.status !== "draft")
    .forEach((b) => charges.set(b.billing_period, (charges.get(b.billing_period) ?? 0) + (b.total_amount - b.previous_outstanding)));
  const chargeSeries = [...charges.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([p, v]) => ({ period: p, amount: Math.round(v * 100) / 100 }));

  if (!series.length) {
    return (
      <div>
        <PageHeader title="Consumption Analytics" />
        <Card><EmptyState title="No consumption data yet" message="Charts appear after your first meter reading." /></Card>
      </div>
    );
  }

  const last6 = series.slice(-6);
  const avg = last6.reduce((a, b) => a + b.units, 0) / last6.length;
  const highest = series.reduce((a, b) => (b.units > a.units ? b : a));
  const latest = series[series.length - 1];
  const prev = series.length > 1 ? series[series.length - 2] : null;
  const change = prev && prev.units ? Math.round(((latest.units - prev.units) / prev.units) * 1000) / 10 : null;

  return (
    <div>
      <PageHeader title="Consumption Analytics" subtitle="Understand your electricity usage month by month." />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Average monthly usage" value={units(Math.round(avg))} icon={<Activity className="h-5 w-5" />} note={`Last ${last6.length} months`} />
        <KpiCard label="Highest month" value={units(highest.units)} icon={<ArrowUpRight className="h-5 w-5" />} iconClass="bg-warn-50 text-warn-600" note={period(highest.period)} />
        <KpiCard label="Latest month" value={units(latest.units)} icon={<Gauge className="h-5 w-5" />} iconClass="bg-sky-50 text-sky-600"
          change={change} goodWhenUp={false} note={prev ? `vs ${period(prev.period)}` : period(latest.period)} />
        <KpiCard label="Total (last 6 months)" value={units(last6.reduce((a, b) => a + b.units, 0))} icon={<Sigma className="h-5 w-5" />} iconClass="bg-ok-50 text-ok-600" />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
        <ChartCard title="Units consumed" subtitle="kWh per billing period"
          table={{ columns: [{ key: "period", label: "Period" }, { key: "units", label: "Units (kWh)", fmt: number }], rows: series }}>
          <GroupedBars data={series} xKey="period" series={[{ key: "units", name: "Units", color: SERIES.s1 }]} valueFmt={(v) => units(v)} />
        </ChartCard>
        <ChartCard title="Monthly charges" subtitle="Current-month charges, excluding carried-forward balances"
          table={{ columns: [{ key: "period", label: "Period" }, { key: "amount", label: "Charges", fmt: money }], rows: chargeSeries }}>
          {chargeSeries.length ? (
            <TrendArea data={chargeSeries} xKey="period" dataKey="amount" name="Charges" valueFmt={money} />
          ) : (
            <EmptyState title="No bills yet" />
          )}
        </ChartCard>
      </div>

      <Card className="mt-6">
        <CardHeader title="Tips to save electricity" />
        <CardBody>
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {TIPS.map((t) => (
              <li key={t} className="flex items-start gap-3 text-sm text-ink-soft">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-warn-50 text-warn-600"><Lightbulb className="h-4 w-4" /></span>
                {t}
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>
    </div>
  );
}
