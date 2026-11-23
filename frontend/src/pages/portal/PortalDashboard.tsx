import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CalendarClock, CreditCard, Gauge, IndianRupee, Wallet } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, CardHeader, PageHeader } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/Badge";
import { KpiCard } from "@/components/ui/KpiCard";
import { Alert, EmptyState, ErrorState, LoadingBlock } from "@/components/ui/States";
import { ChartCard, GroupedBars, SERIES } from "@/components/charts/Charts";
import { useApi } from "@/hooks/useApi";
import { date, dateTime, METHOD_LABELS, money, number, period, units } from "@/utils/format";
import type { CustomerProfile } from "@/types";

export default function PortalDashboard() {
  const { data, loading, error, reload } = useApi<CustomerProfile>("/api/customers/me");
  const navigate = useNavigate();

  if (loading && !data) return <LoadingBlock />;
  if (error || !data) return <ErrorState message={error ?? "No data"} onRetry={reload} />;

  const { customer, current_bill: bill, latest_reading: reading } = data;
  const lastPayment = data.payments.find((p) => p.status === "successful");
  const payable = bill && bill.balance_due > 0 && !bill.carried_forward_to_id && !["paid", "cancelled", "draft"].includes(bill.status);
  const chartData = data.consumption_history.map((c) => ({ period: c.billing_period, units: c.units }));

  return (
    <div>
      <PageHeader
        title={`Welcome, ${customer.full_name.split(" ")[0]}`}
        subtitle={
          <>
            Customer ID <b className="text-ink">{customer.customer_code}</b>
            {customer.connection_code && (
              <>
                {" "}· Connection <b className="text-ink">{customer.connection_code}</b>
              </>
            )}
            {bill && <> · Current period <b className="text-ink">{period(bill.billing_period)}</b></>}
          </>
        }
        actions={
          payable ? (
            <Button size="lg" icon={<CreditCard className="h-4 w-4" />} onClick={() => navigate(`/portal/pay/${bill.id}`)}>
              Pay {money(bill.balance_due)} now
            </Button>
          ) : undefined
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Current Payable" value={money(data.outstanding_balance)} icon={<IndianRupee className="h-5 w-5" />}
          note={data.outstanding_balance > 0 ? "Outstanding balance" : "No dues - thank you!"} />
        <KpiCard label="Due Date" value={bill ? date(bill.due_date) : "-"} icon={<CalendarClock className="h-5 w-5" />}
          iconClass="bg-warn-50 text-warn-600" note={bill ? <StatusBadge status={bill.status} carried={!!bill.carried_forward_to_id} /> : "No bill yet"} />
        <KpiCard label="Latest Consumption" value={reading ? units(reading.units_consumed) : "-"} icon={<Gauge className="h-5 w-5" />}
          iconClass="bg-sky-50 text-sky-600" note={reading ? period(reading.billing_period) : undefined} />
        <KpiCard label="Last Payment" value={lastPayment ? money(lastPayment.amount) : "-"} icon={<Wallet className="h-5 w-5" />}
          iconClass="bg-ok-50 text-ok-600" note={lastPayment ? date(lastPayment.payment_date) : "No payments yet"} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <ChartCard
            title="Monthly consumption"
            subtitle="Units (kWh) per billing period"
            table={{ columns: [{ key: "period", label: "Period" }, { key: "units", label: "Units (kWh)", fmt: number }], rows: chartData }}
          >
            {chartData.length ? (
              <GroupedBars data={chartData} xKey="period" series={[{ key: "units", name: "Units", color: SERIES.s1 }]} valueFmt={(v) => units(v)} />
            ) : (
              <EmptyState title="No readings yet" />
            )}
          </ChartCard>
        </div>
        <Card>
          <CardHeader title="Current bill" subtitle={bill ? bill.invoice_number : undefined} />
          {bill ? (
            <div className="space-y-3 p-5 text-sm">
              <Row k="Billing period" v={period(bill.billing_period)} />
              <Row k="Units consumed" v={units(bill.units_consumed)} />
              <Row k="Total amount" v={money(bill.total_amount)} />
              <Row k="Amount paid" v={money(bill.amount_paid)} />
              <Row k="Balance due" v={<b className="text-ink">{money(bill.balance_due)}</b>} />
              <Row k="Status" v={<StatusBadge status={bill.status} carried={!!bill.carried_forward_to_id} />} />
              <div className="flex gap-2 pt-2">
                <Link to="/portal/current-bill" className="flex-1"><Button variant="outline" className="w-full">View bill</Button></Link>
                {payable && <Link to={`/portal/pay/${bill.id}`} className="flex-1"><Button className="w-full">Pay now</Button></Link>}
              </div>
            </div>
          ) : (
            <EmptyState title="No bill yet" message="Your first bill will appear here after the meter reading." />
          )}
        </Card>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title="Recent bills" action={<Link to="/portal/bills" className="text-xs font-medium text-brand-600">View all</Link>} />
          {data.bills.length ? (
            <ul className="divide-y divide-line">
              {data.bills.slice(0, 5).map((b) => (
                <li key={b.id}>
                  <Link to={`/portal/bills/${b.id}`} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-slate-50">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">{period(b.billing_period)}</p>
                      <p className="text-xs text-ink-muted">{b.invoice_number} · {units(b.units_consumed)}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium tabular-nums">{money(b.total_amount)}</span>
                      <StatusBadge status={b.status} carried={!!b.carried_forward_to_id} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No bills yet" />
          )}
        </Card>
        <Card>
          <CardHeader title="Recent transactions" action={<Link to="/portal/payments" className="text-xs font-medium text-brand-600">View all</Link>} />
          {data.payments.length ? (
            <ul className="divide-y divide-line">
              {data.payments.slice(0, 5).map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-ink">{METHOD_LABELS[p.method] ?? p.method}</p>
                    <p className="truncate text-xs text-ink-muted">{p.transaction_id} · {dateTime(p.payment_date)}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium tabular-nums">{money(p.amount)}</span>
                    <StatusBadge status={p.status} />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState title="No transactions yet" />
          )}
        </Card>
      </div>

      <div className="mt-6">
        <Alert tone="info" title="Demo Payment Mode">Online payments in this portal are simulated for demonstration. No real money is transferred.</Alert>
      </div>
    </div>
  );
}

function Row({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-ink-muted">{k}</span>
      <span className="tabular-nums text-ink-soft">{v}</span>
    </div>
  );
}
