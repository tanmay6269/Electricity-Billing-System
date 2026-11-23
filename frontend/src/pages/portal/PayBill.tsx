import { Link } from "react-router-dom";
import { CheckCircle2, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card, PageHeader } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/Badge";
import { Alert, EmptyState, ErrorState, LoadingBlock } from "@/components/ui/States";
import { useApi } from "@/hooks/useApi";
import { date, money, period, units } from "@/utils/format";
import type { Bill, Page } from "@/types";
import { isPayable } from "./CurrentBill";

export default function PayBill() {
  const { data, loading, error, reload } = useApi<Page<Bill>>("/api/bills", { page_size: 50, sort_by: "billing_period", sort_dir: "desc" });
  if (loading && !data) return <LoadingBlock />;
  if (error || !data) return <ErrorState message={error ?? "No data"} onRetry={reload} />;
  const payable = data.items.filter(isPayable);
  const total = payable.reduce((a, b) => a + b.balance_due, 0);

  return (
    <div>
      <PageHeader title="Pay Bill" subtitle={payable.length ? `Total due ${money(total)}` : "Your account is up to date."} />
      <div className="mb-4">
        <Alert tone="info" title="Demo Payment Mode">Payments are simulated for demonstration. No real money is transferred.</Alert>
      </div>
      {payable.length === 0 ? (
        <Card>
          <EmptyState icon={<CheckCircle2 className="h-6 w-6 text-ok-600" />} title="No dues" message="You have no unpaid bills. Thank you for paying on time!" />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {payable.map((b) => (
            <Card key={b.id} className="flex flex-col p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs text-ink-muted">{b.invoice_number}</p>
                  <p className="mt-0.5 text-base font-semibold">{period(b.billing_period)}</p>
                </div>
                <StatusBadge status={b.status} />
              </div>
              <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
                <div><p className="text-xs text-ink-muted">Units</p><p className="font-medium">{units(b.units_consumed)}</p></div>
                <div><p className="text-xs text-ink-muted">Due date</p><p className="font-medium">{date(b.due_date)}</p></div>
                <div><p className="text-xs text-ink-muted">Balance</p><p className="text-lg font-semibold tabular-nums">{money(b.balance_due)}</p></div>
              </div>
              <div className="mt-4 flex gap-2">
                <Link to={`/portal/bills/${b.id}`} className="flex-1"><Button variant="outline" className="w-full">View bill</Button></Link>
                <Link to={`/portal/pay/${b.id}`} className="flex-1"><Button className="w-full" icon={<CreditCard className="h-4 w-4" />}>Pay</Button></Link>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
