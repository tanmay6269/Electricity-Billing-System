import { useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Building2, CheckCircle2, CreditCard, Download, FlaskConical, ShieldCheck, Smartphone, XCircle } from "lucide-react";
import clsx from "clsx";
import { toast } from "sonner";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, PageHeader } from "@/components/ui/Card";
import { Field, Input, Select } from "@/components/ui/Form";
import { StatusBadge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { Alert, ErrorState, LoadingBlock } from "@/components/ui/States";
import { useApi } from "@/hooks/useApi";
import { api, downloadFile, errorMessage } from "@/services/api";
import { date, METHOD_LABELS, money, period } from "@/utils/format";
import type { Bill, Payment } from "@/types";
import { isPayable } from "./CurrentBill";

type Method = "upi" | "debit_card" | "credit_card" | "net_banking" | "demo";
const METHODS: { id: Method; icon: typeof CreditCard; hint: string }[] = [
  { id: "upi", icon: Smartphone, hint: "Any UPI app" },
  { id: "debit_card", icon: CreditCard, hint: "Visa / RuPay / Mastercard" },
  { id: "credit_card", icon: CreditCard, hint: "Visa / Mastercard" },
  { id: "net_banking", icon: Building2, hint: "All major banks" },
  { id: "demo", icon: FlaskConical, hint: "Instant test payment" },
];
const BANKS = ["State Bank of India", "HDFC Bank", "ICICI Bank", "Axis Bank", "Punjab National Bank", "Bank of Baroda"];

export default function Checkout() {
  const { billId } = useParams();
  const navigate = useNavigate();
  const { data: bill, loading, error, reload } = useApi<Bill>(`/api/bills/${billId}`);
  const [amount, setAmount] = useState<string | null>(null);
  const [method, setMethod] = useState<Method>("upi");
  const [simulate, setSimulate] = useState<"success" | "failure">("success");
  // Payment-instrument fields are for the demo UI only. They are never sent to the server.
  const [upi, setUpi] = useState("");
  const [card, setCard] = useState({ number: "", expiry: "", cvv: "", name: "" });
  const [bank, setBank] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [confirm, setConfirm] = useState(false);
  const [paying, setPaying] = useState(false);
  const [result, setResult] = useState<Payment | null>(null);

  if (loading && !bill) return <LoadingBlock />;
  if (error || !bill) return <ErrorState message={error ?? "Bill not found"} onRetry={reload} />;

  const amt = amount ?? String(bill.balance_due);
  const back = (
    <Link to="/portal/pay" className="mb-2 inline-flex items-center gap-1 text-xs font-medium text-ink-muted hover:text-ink">
      <ArrowLeft className="h-3.5 w-3.5" /> Back to bills
    </Link>
  );

  if (result) {
    const ok = result.status === "successful";
    return (
      <div className="mx-auto max-w-lg">
        <Card className="p-8 text-center">
          <div className={clsx("mx-auto flex h-14 w-14 items-center justify-center rounded-full", ok ? "bg-ok-50 text-ok-600" : "bg-bad-50 text-bad-600")}>
            {ok ? <CheckCircle2 className="h-8 w-8" /> : <XCircle className="h-8 w-8" />}
          </div>
          <h2 className="mt-4 text-xl">{ok ? "Payment successful" : "Payment failed"}</h2>
          <p className="mt-1 text-sm text-ink-muted">
            {ok ? "Your payment has been recorded (Demo Payment Mode)." : "The simulated payment was declined. No amount was deducted."}
          </p>
          <dl className="mt-6 space-y-2 rounded-lg bg-slate-50 p-4 text-left text-sm">
            <Row k="Transaction ID" v={result.transaction_id} />
            {result.receipt_number && <Row k="Receipt number" v={result.receipt_number} />}
            <Row k="Invoice" v={result.invoice_number} />
            <Row k="Method" v={METHOD_LABELS[result.method] ?? result.method} />
            <Row k="Amount" v={money(result.amount)} />
            <Row k="Remaining balance" v={money(result.bill_balance_due)} />
          </dl>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row">
            {ok ? (
              <>
                <Button className="flex-1" icon={<Download className="h-4 w-4" />}
                  onClick={() => downloadFile(`/api/payments/${result.id}/receipt`, undefined, `${result.receipt_number}.pdf`).catch((e) => toast.error(errorMessage(e)))}>
                  Download receipt
                </Button>
                <Button variant="outline" className="flex-1" onClick={() => navigate(`/portal/bills/${bill.id}`)}>View bill</Button>
              </>
            ) : (
              <Button className="flex-1" onClick={() => { setResult(null); void reload(); }}>Try again</Button>
            )}
            <Button variant="ghost" className="flex-1" onClick={() => navigate("/portal")}>Dashboard</Button>
          </div>
        </Card>
      </div>
    );
  }

  if (!isPayable(bill)) {
    return (
      <div>
        <PageHeader title="Checkout" back={back} />
        <Alert tone="info" title="Nothing to pay">
          Bill {bill.invoice_number} is {bill.carried_forward_to_id ? "carried forward to a newer bill" : bill.status.replace("_", " ")}.{" "}
          <Link to="/portal/pay" className="underline">See payable bills</Link>
        </Alert>
      </div>
    );
  }

  const validate = () => {
    const e: Record<string, string> = {};
    const n = Number(amt);
    if (!Number.isFinite(n) || n < 1) e.amount = "Enter at least Rs 1";
    else if (n > bill.balance_due) e.amount = `Cannot exceed ${money(bill.balance_due)}`;
    else if (!/^\d+(\.\d{1,2})?$/.test(amt)) e.amount = "Up to 2 decimal places";
    if (method === "upi" && !/^[\w.-]{2,}@[a-zA-Z]{2,}$/.test(upi)) e.upi = "Enter a UPI ID like name@bank";
    if (method === "debit_card" || method === "credit_card") {
      if (!/^\d{16}$/.test(card.number.replace(/\s/g, ""))) e.number = "16-digit card number";
      if (!/^(0[1-9]|1[0-2])\/\d{2}$/.test(card.expiry)) e.expiry = "MM/YY";
      if (!/^\d{3}$/.test(card.cvv)) e.cvv = "3 digits";
      if (card.name.trim().length < 2) e.name = "Name on card";
    }
    if (method === "net_banking" && !bank) e.bank = "Choose your bank";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const pay = async () => {
    setPaying(true);
    try {
      const { data } = await api.post<Payment>("/api/payments/demo", { bill_id: bill.id, amount: Number(amt), method, simulate });
      setResult(data);
      setConfirm(false);
      window.dispatchEvent(new Event("notifications:changed"));
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setPaying(false);
    }
  };

  return (
    <div>
      <PageHeader title="Checkout" subtitle={`Invoice ${bill.invoice_number} · ${period(bill.billing_period)}`} back={back} />
      <div className="mb-6 flex items-start gap-3 rounded-xl border-2 border-dashed border-warn-600/40 bg-warn-50 px-4 py-3 text-sm text-warn-700">
        <FlaskConical className="mt-0.5 h-5 w-5 shrink-0" />
        <div>
          <p className="font-semibold">Demo Payment Mode — no real money is transferred</p>
          <p className="text-xs">This checkout simulates a payment gateway. Card, UPI and bank details you type are not stored or sent anywhere.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Payment details" />
          <CardBody className="space-y-6">
            <Field label="Amount to pay (Rs)" error={errors.amount} hint={`Full balance ${money(bill.balance_due)}. You may pay part of it.`}>
              <div className="flex gap-2">
                <Input type="number" step="0.01" min={1} max={bill.balance_due} value={amt} onChange={(e) => setAmount(e.target.value)} invalid={!!errors.amount} />
                <Button variant="outline" onClick={() => setAmount(String(bill.balance_due))}>Full</Button>
              </div>
            </Field>

            <div>
              <p className="label">Payment method</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                {METHODS.map((m) => (
                  <button key={m.id} type="button" onClick={() => { setMethod(m.id); setErrors({}); }}
                    className={clsx("flex flex-col items-start gap-1 rounded-lg border p-3 text-left transition",
                      method === m.id ? "border-brand-600 bg-brand-50 ring-2 ring-brand-100" : "border-line bg-white hover:border-brand-200")}
                    aria-pressed={method === m.id}>
                    <m.icon className={clsx("h-5 w-5", method === m.id ? "text-brand-600" : "text-ink-muted")} />
                    <span className="text-xs font-semibold text-ink">{METHOD_LABELS[m.id]}</span>
                    <span className="text-[11px] text-ink-muted">{m.hint}</span>
                  </button>
                ))}
              </div>
            </div>

            {method === "upi" && (
              <Field label="UPI ID" error={errors.upi}>
                <Input placeholder="yourname@okbank" value={upi} onChange={(e) => setUpi(e.target.value)} invalid={!!errors.upi} autoComplete="off" />
              </Field>
            )}
            {(method === "debit_card" || method === "credit_card") && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Card number" error={errors.number} className="sm:col-span-2">
                  <Input inputMode="numeric" placeholder="4111 1111 1111 1111" maxLength={19} value={card.number} autoComplete="off"
                    onChange={(e) => setCard({ ...card, number: e.target.value.replace(/[^\d]/g, "").slice(0, 16).replace(/(\d{4})(?=\d)/g, "$1 ") })} invalid={!!errors.number} />
                </Field>
                <Field label="Name on card" error={errors.name} className="sm:col-span-2">
                  <Input value={card.name} onChange={(e) => setCard({ ...card, name: e.target.value })} invalid={!!errors.name} autoComplete="off" />
                </Field>
                <Field label="Expiry (MM/YY)" error={errors.expiry}>
                  <Input placeholder="12/28" maxLength={5} value={card.expiry} onChange={(e) => setCard({ ...card, expiry: e.target.value })} invalid={!!errors.expiry} autoComplete="off" />
                </Field>
                <Field label="CVV" error={errors.cvv}>
                  <Input type="password" inputMode="numeric" maxLength={3} value={card.cvv} onChange={(e) => setCard({ ...card, cvv: e.target.value.replace(/\D/g, "") })} invalid={!!errors.cvv} autoComplete="off" />
                </Field>
              </div>
            )}
            {method === "net_banking" && (
              <Field label="Bank" error={errors.bank}>
                <Select placeholder="Select your bank" options={BANKS.map((b) => ({ value: b, label: b }))} value={bank} onChange={(e) => setBank(e.target.value)} invalid={!!errors.bank} />
              </Field>
            )}
            {method === "demo" && <Alert tone="info">Demo Payment completes instantly without any instrument details.</Alert>}

            <div>
              <p className="label">Simulate outcome</p>
              <div className="inline-flex rounded-lg border border-line p-0.5" role="group">
                {(["success", "failure"] as const).map((o) => (
                  <button key={o} type="button" onClick={() => setSimulate(o)}
                    className={clsx("rounded-md px-4 py-1.5 text-xs font-medium", simulate === o ? (o === "success" ? "bg-ok-600 text-white" : "bg-bad-600 text-white") : "text-ink-soft")}>
                    {o === "success" ? "Success" : "Failure"}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-xs text-ink-muted">Choose "Failure" to see how a declined payment is handled.</p>
            </div>
          </CardBody>
        </Card>

        <Card className="h-fit">
          <CardHeader title="Order summary" action={<StatusBadge status={bill.status} />} />
          <CardBody className="space-y-3 text-sm">
            <Row k="Invoice" v={bill.invoice_number} />
            <Row k="Billing period" v={period(bill.billing_period)} />
            <Row k="Due date" v={date(bill.due_date)} />
            <Row k="Bill total" v={money(bill.total_amount)} />
            <Row k="Already paid" v={money(bill.amount_paid)} />
            <div className="border-t border-line pt-3">
              <Row k="Paying now" v={<b className="text-lg text-ink">{money(Number(amt) || 0)}</b>} />
            </div>
            <Button size="lg" className="w-full" icon={<ShieldCheck className="h-4 w-4" />} onClick={() => validate() && setConfirm(true)}>
              Continue to pay
            </Button>
          </CardBody>
        </Card>
      </div>

      <Modal open={confirm} onClose={() => setConfirm(false)} title="Confirm payment" subtitle="Demo Payment Mode — no real money is transferred" size="sm"
        footer={<>
          <Button variant="outline" onClick={() => setConfirm(false)}>Cancel</Button>
          <Button loading={paying} onClick={pay}>Pay {money(Number(amt))}</Button>
        </>}>
        <dl className="space-y-2 text-sm">
          <Row k="Invoice" v={bill.invoice_number} />
          <Row k="Method" v={METHOD_LABELS[method]} />
          <Row k="Amount" v={money(Number(amt))} />
          <Row k="Balance after payment" v={money(Math.max(0, bill.balance_due - Number(amt)))} />
          <Row k="Simulated outcome" v={simulate === "success" ? "Success" : "Failure"} />
        </dl>
      </Modal>
    </div>
  );
}

function Row({ k, v }: { k: string; v: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-ink-muted">{k}</dt>
      <dd className="text-right font-medium tabular-nums text-ink-soft">{v}</dd>
    </div>
  );
}
