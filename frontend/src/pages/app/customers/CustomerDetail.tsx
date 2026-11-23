import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Cable, Gauge, IndianRupee, Mail, MapPin, Pencil, Phone, Plus, Receipt, Wallet } from "lucide-react";
import clsx from "clsx";
import { useApi } from "@/hooks/useApi";
import { Card, CardBody, CardHeader, InfoGrid, PageHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { StatusBadge, TypeBadge } from "@/components/ui/Badge";
import { KpiCard } from "@/components/ui/KpiCard";
import { DataTable, type Column } from "@/components/ui/DataTable";
import { EmptyState, ErrorState, LoadingBlock } from "@/components/ui/States";
import { ChartCard, GroupedBars, SERIES } from "@/components/charts/Charts";
import type { Bill, Complaint, CustomerProfile, Payment } from "@/types";
import { CATEGORY_LABELS, date, dateTime, METHOD_LABELS, money, number, period, units } from "@/utils/format";
import ConnectionFormModal from "@/pages/app/connections/ConnectionFormModal";

const TABS = ["Bills", "Payments", "Complaints"] as const;

export default function CustomerDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, loading, error, reload } = useApi<CustomerProfile>(`/api/customers/${id}/profile`);
  const [tab, setTab] = useState<(typeof TABS)[number]>("Bills");
  const [addConn, setAddConn] = useState(false);

  if (loading && !data) return <LoadingBlock />;
  if (error || !data) return <ErrorState message={error ?? "Not found"} onRetry={reload} />;
  const c = data.customer;

  const billCols: Column<Bill>[] = [
    { key: "invoice_number", header: "Invoice", render: (b) => <span className="font-medium text-ink">{b.invoice_number}</span> },
    { key: "billing_period", header: "Period", render: (b) => period(b.billing_period) },
    { key: "units_consumed", header: "Units", align: "right", render: (b) => number(b.units_consumed) },
    { key: "total_amount", header: "Total", align: "right", render: (b) => money(b.total_amount) },
    { key: "balance_due", header: "Balance", align: "right", render: (b) => money(b.balance_due) },
    { key: "due_date", header: "Due", render: (b) => date(b.due_date) },
    { key: "status", header: "Status", render: (b) => <StatusBadge status={b.status} carried={!!b.carried_forward_to_id} /> },
  ];
  const payCols: Column<Payment>[] = [
    { key: "payment_date", header: "Date", render: (p) => dateTime(p.payment_date) },
    { key: "transaction_id", header: "Transaction", render: (p) => <span className="font-mono text-xs">{p.transaction_id}</span> },
    { key: "invoice_number", header: "Invoice" },
    { key: "method", header: "Method", render: (p) => METHOD_LABELS[p.method] ?? p.method },
    { key: "amount", header: "Amount", align: "right", render: (p) => money(p.amount) },
    { key: "status", header: "Status", render: (p) => <StatusBadge status={p.status} /> },
  ];
  const compCols: Column<Complaint>[] = [
    { key: "complaint_code", header: "ID", render: (x) => <span className="font-medium text-ink">{x.complaint_code}</span> },
    { key: "subject", header: "Subject" },
    { key: "category", header: "Category", render: (x) => CATEGORY_LABELS[x.category] },
    { key: "status", header: "Status", render: (x) => <StatusBadge status={x.status} /> },
    { key: "created_at", header: "Submitted", render: (x) => date(x.created_at) },
  ];

  return (
    <div>
      <PageHeader
        back={<Link to="/app/customers" className="mb-2 inline-flex items-center gap-1 text-xs font-medium text-ink-muted hover:text-ink"><ArrowLeft className="h-3.5 w-3.5" /> Customers</Link>}
        title={c.full_name}
        subtitle={<span className="flex flex-wrap items-center gap-2">{c.customer_code} <TypeBadge type={c.customer_type} /> <StatusBadge status={c.status} /> {c.has_login && <span className="text-xs text-ink-muted">· Portal login enabled</span>}</span>}
        actions={
          <>
            <Button variant="outline" icon={<Plus className="h-4 w-4" />} onClick={() => setAddConn(true)}>Add connection</Button>
            <Link to={`/app/customers/${c.id}/edit`}><Button icon={<Pencil className="h-4 w-4" />}>Edit</Button></Link>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Current bill" value={data.current_bill ? money(data.current_bill.total_amount) : "-"} icon={<Receipt className="h-[18px] w-[18px]" />}
          note={data.current_bill ? <span className="flex items-center gap-1.5">{period(data.current_bill.billing_period)} <StatusBadge status={data.current_bill.status} carried={!!data.current_bill.carried_forward_to_id} /></span> : "No bills yet"} />
        <KpiCard label="Outstanding balance" value={money(data.outstanding_balance)} icon={<Wallet className="h-[18px] w-[18px]" />} iconClass={data.outstanding_balance > 0 ? "bg-bad-50 text-bad-600" : "bg-ok-50 text-ok-600"} />
        <KpiCard label="Total paid" value={money(data.total_paid)} icon={<IndianRupee className="h-[18px] w-[18px]" />} iconClass="bg-ok-50 text-ok-600" note={`${data.payments.filter((p) => p.status === "successful").length} payments`} />
        <KpiCard label="Latest reading" value={data.latest_reading ? units(data.latest_reading.units_consumed) : "-"} icon={<Gauge className="h-[18px] w-[18px]" />} iconClass="bg-amber-50 text-amber-600"
          note={data.latest_reading ? `${period(data.latest_reading.billing_period)} · meter ${number(data.latest_reading.current_reading)}` : "No readings"} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Card>
          <CardHeader title="Customer information" />
          <CardBody>
            <ul className="space-y-3 text-sm">
              <li className="flex gap-3"><Mail className="h-4 w-4 shrink-0 text-ink-faint" /> <span className="break-all">{c.email}</span></li>
              <li className="flex gap-3"><Phone className="h-4 w-4 shrink-0 text-ink-faint" /> {c.phone}</li>
              <li className="flex gap-3"><MapPin className="h-4 w-4 shrink-0 text-ink-faint" /> <span>{c.address}, {c.city}, {c.state} {c.postal_code}</span></li>
            </ul>
            <div className="mt-5 border-t border-line pt-4">
              <InfoGrid items={[{ label: "Customer since", value: date(c.created_at) }, { label: "Connections", value: c.connection_count }]} />
            </div>
          </CardBody>
        </Card>
        <div className="xl:col-span-2">
          <ChartCard title="Consumption history" subtitle="Units consumed per billing period" height={250}
            table={{ columns: [{ key: "billing_period", label: "Period" }, { key: "connection_code", label: "Connection" }, { key: "units", label: "Units", fmt: number }], rows: data.consumption_history }}>
            {data.consumption_history.length ? (
              <GroupedBars data={data.consumption_history} xKey="billing_period" valueFmt={(v) => `${number(v)} kWh`} series={[{ key: "units", name: "Units", color: SERIES.s1 }]} />
            ) : (
              <EmptyState title="No readings yet" />
            )}
          </ChartCard>
        </div>
      </div>

      <Card className="mt-6">
        <CardHeader title="Connections" subtitle="Meters and tariffs assigned to this customer" />
        {data.connections.length === 0 ? (
          <EmptyState icon={<Cable className="h-6 w-6" />} title="No connections" action={<Button size="sm" onClick={() => setAddConn(true)}>Add connection</Button>} />
        ) : (
          <div className="grid grid-cols-1 gap-4 p-5 md:grid-cols-2">
            {data.connections.map((x) => (
              <button key={x.id} onClick={() => navigate(`/app/connections/${x.id}`)} className="rounded-lg border border-line p-4 text-left transition hover:border-brand-200 hover:bg-brand-50/30">
                <div className="flex items-center justify-between">
                  <p className="font-semibold text-ink">{x.connection_code}</p>
                  <StatusBadge status={x.status} />
                </div>
                <div className="mt-3">
                  <InfoGrid items={[
                    { label: "Meter", value: x.meter_number }, { label: "Tariff", value: x.tariff_plan },
                    { label: "Sanctioned load", value: `${x.sanctioned_load_kw} kW` }, { label: "Installed", value: date(x.installation_date) },
                  ]} />
                </div>
              </button>
            ))}
          </div>
        )}
      </Card>

      <Card className="mt-6">
        <div className="flex gap-1 border-b border-line px-3 pt-2">
          {TABS.map((t) => (
            <button key={t} onClick={() => setTab(t)} className={clsx("-mb-px border-b-2 px-3 py-2.5 text-sm font-medium", tab === t ? "border-brand-600 text-brand-700" : "border-transparent text-ink-muted hover:text-ink")}>
              {t} <span className="ml-1 text-xs text-ink-faint">{t === "Bills" ? data.bills.length : t === "Payments" ? data.payments.length : data.complaints.length}</span>
            </button>
          ))}
        </div>
        {tab === "Bills" && <DataTable columns={billCols} rows={data.bills} onRowClick={(b) => navigate(`/app/bills/${b.id}`)} />}
        {tab === "Payments" && <DataTable columns={payCols} rows={data.payments} />}
        {tab === "Complaints" && <DataTable columns={compCols} rows={data.complaints} onRowClick={(x) => navigate(`/app/complaints/${x.id}`)} />}
      </Card>

      <ConnectionFormModal open={addConn} onClose={() => setAddConn(false)} customerId={c.id} customerType={c.customer_type} onSaved={reload} />
    </div>
  );
}
