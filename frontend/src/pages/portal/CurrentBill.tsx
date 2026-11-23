import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { CreditCard, Download, Printer, Receipt } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, InfoGrid, PageHeader } from "@/components/ui/Card";
import { StatusBadge } from "@/components/ui/Badge";
import { Alert, EmptyState, ErrorState, LoadingBlock } from "@/components/ui/States";
import { useApi } from "@/hooks/useApi";
import { downloadFile, errorMessage, openPdf } from "@/services/api";
import { date, money, number, period, units } from "@/utils/format";
import type { Bill, CustomerProfile } from "@/types";

export function isPayable(b: Bill) {
  return b.balance_due > 0 && !b.carried_forward_to_id && ["generated", "pending", "partially_paid", "overdue"].includes(b.status);
}

/** Bill detail block, reused by the current bill page. */
export function BillView({ billId }: { billId: number }) {
  const { data: bill, loading, error, reload } = useApi<Bill>(`/api/bills/${billId}`);
  const [busy, setBusy] = useState(false);
  if (loading && !bill) return <LoadingBlock />;
  if (error || !bill) return <ErrorState message={error ?? "Not found"} onRetry={reload} />;

  const dl = async () => {
    setBusy(true);
    try {
      await downloadFile(`/api/bills/${bill.id}/pdf`, undefined, `${bill.invoice_number}.pdf`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {bill.carried_forward_to_id && (
        <Alert tone="warn" title="Balance carried forward">
          The unpaid balance of this bill was added to a newer bill.{" "}
          <Link to={`/portal/bills/${bill.carried_forward_to_id}`} className="font-medium underline">
            View {bill.carried_forward_to_invoice ?? "newer bill"}
          </Link>
        </Alert>
      )}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader
            title={`Invoice ${bill.invoice_number}`}
            subtitle={`Billing period ${period(bill.billing_period)} · Issued ${date(bill.issue_date)}`}
            action={<StatusBadge status={bill.status} carried={!!bill.carried_forward_to_id} />}
          />
          <CardBody>
            <InfoGrid cols={3} items={[
              { label: "Connection", value: bill.connection_code },
              { label: "Meter number", value: bill.meter_number },
              { label: "Tariff", value: bill.tariff_name },
              { label: "Previous reading", value: number(bill.previous_reading) },
              { label: "Current reading", value: number(bill.current_reading) },
              { label: "Units consumed", value: units(bill.units_consumed) },
            ]} />
            <div className="mt-6 overflow-x-auto rounded-lg border border-line">
              <table className="min-w-full">
                <thead className="bg-slate-50">
                  <tr><th className="table-th">Description</th><th className="table-th text-right">Amount</th></tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {bill.items?.map((it, i) => (
                    <tr key={i}>
                      <td className="table-td whitespace-normal">{it.description}</td>
                      <td className="table-td text-right tabular-nums">{money(it.amount)}</td>
                    </tr>
                  ))}
                  <tr className="bg-slate-50 font-semibold">
                    <td className="table-td text-ink">Total payable</td>
                    <td className="table-td text-right tabular-nums text-ink">{money(bill.total_amount)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title="Payment summary" />
          <CardBody className="space-y-3 text-sm">
            <Line k="Total amount" v={money(bill.total_amount)} />
            <Line k="Amount paid" v={money(bill.amount_paid)} />
            <Line k="Balance due" v={<b className="text-lg text-ink">{money(bill.balance_due)}</b>} />
            <Line k="Due date" v={date(bill.due_date)} />
            <div className="space-y-2 pt-3">
              {isPayable(bill) && (
                <Link to={`/portal/pay/${bill.id}`} className="block">
                  <Button className="w-full" size="lg" icon={<CreditCard className="h-4 w-4" />}>Pay now</Button>
                </Link>
              )}
              <div className="grid grid-cols-2 gap-2">
                <Button variant="outline" loading={busy} icon={<Download className="h-4 w-4" />} onClick={dl}>PDF</Button>
                <Button variant="outline" icon={<Printer className="h-4 w-4" />} onClick={() => openPdf(`/api/bills/${bill.id}/pdf`).catch((e) => toast.error(errorMessage(e)))}>Print</Button>
              </div>
            </div>
          </CardBody>
          {bill.payments && bill.payments.length > 0 && (
            <div className="border-t border-line px-5 py-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">Payments on this bill</p>
              <ul className="space-y-2 text-xs">
                {bill.payments.map((p) => (
                  <li key={p.id} className="flex items-center justify-between gap-2">
                    <span className="text-ink-muted">{date(p.payment_date)} · {p.transaction_id}</span>
                    <span className="flex items-center gap-2"><span className="tabular-nums">{money(p.amount)}</span><StatusBadge status={p.status} /></span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

function Line({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-ink-muted">{k}</span>
      <span className="tabular-nums">{v}</span>
    </div>
  );
}

export default function CurrentBill() {
  const { data, loading, error, reload } = useApi<CustomerProfile>("/api/customers/me");
  if (loading && !data) return <LoadingBlock />;
  if (error || !data) return <ErrorState message={error ?? "No data"} onRetry={reload} />;
  return (
    <div>
      <PageHeader title="Current Bill" subtitle="Your latest electricity bill." />
      {data.current_bill ? (
        <BillView billId={data.current_bill.id} />
      ) : (
        <Card><EmptyState icon={<Receipt className="h-6 w-6" />} title="No bill yet" message="Your bill will appear here once it is generated." /></Card>
      )}
    </div>
  );
}
