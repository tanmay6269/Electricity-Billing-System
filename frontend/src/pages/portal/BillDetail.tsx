import { Link, useParams } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/Card";
import { BillView } from "./CurrentBill";

export default function PortalBillDetail() {
  const { id } = useParams();
  return (
    <div>
      <PageHeader
        title="Bill Details"
        back={
          <Link to="/portal/bills" className="mb-2 inline-flex items-center gap-1 text-xs font-medium text-ink-muted hover:text-ink">
            <ArrowLeft className="h-3.5 w-3.5" /> Bill history
          </Link>
        }
      />
      <BillView key={id} billId={Number(id)} />
    </div>
  );
}
