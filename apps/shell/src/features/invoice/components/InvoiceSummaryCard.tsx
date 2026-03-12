import { ExternalLink, RefreshCcw } from "lucide-react";
import { Button, Card } from "@/components/ui";
import { StatusBadge } from "./StatusBadge";
import type { InvoiceDashboardState } from "../types";
import type React from "react";

type Props = {
  invoice: InvoiceDashboardState;
  subtotal: number;
  taxTotal: number;
  totalAmount: number;
  canSync: boolean;
  onSync: () => void;
  onOpenXero: () => void;
  children?: React.ReactNode;
};

function SummaryField({ label, value, className = "" }: { label: string; value: string; className?: string }) {
  return (
    <div>
      <div className="text-sm text-[var(--ds-muted)]">{label}</div>
      <div className={["mt-1 text-base font-semibold text-[var(--ds-text)]", className].join(" ")}>{value}</div>
    </div>
  );
}

export function InvoiceSummaryCard({ invoice, canSync, onSync, onOpenXero, children }: Props) {
  return (
    <Card className="rounded-[18px] p-6">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--ds-border)] pb-5">
        <div>
          <div className="text-2xl font-semibold text-[var(--ds-text)]">Invoice Summary</div>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-[var(--ds-muted)]">
            <span>Xero ID: {invoice.xeroInvoiceId}</span>
            <StatusBadge kind="invoice" value={invoice.status} />
          </div>
        </div>
        <Button
          leftIcon={<ExternalLink className="h-4 w-4" />}
          className="h-11 border-[var(--ds-primary)] bg-white px-5 text-[var(--ds-primary)] hover:bg-red-50"
          onClick={onOpenXero}
        >
          Open in Xero
        </Button>
      </div>

      <div className="mt-6 grid gap-5 md:grid-cols-3 xl:grid-cols-4">
        <SummaryField label="Contact" value={invoice.contact} />
        <SummaryField label="Issue date" value={invoice.issueDate} />
        <SummaryField label="Due date" value={invoice.dueDate} />
        <SummaryField label="Invoice number" value={invoice.invoiceNumber} />
        <SummaryField label="Reference" value={invoice.reference} />
        <SummaryField label="Last Sync Time" value={invoice.lastSyncTime} />
        <SummaryField label="Sync Direction" value={invoice.lastSyncDirection} className="text-[var(--ds-primary)]" />
      </div>

      {children}

      <div className="mt-6 flex justify-end gap-3 border-t border-[var(--ds-border)] pt-5">
        <Button
          variant={canSync ? "primary" : "ghost"}
          leftIcon={<RefreshCcw className="h-4 w-4" />}
          className={[
            "h-11 px-5",
            !canSync ? "border-[var(--ds-border)] bg-[rgba(0,0,0,0.04)] text-[var(--ds-muted)] hover:bg-[rgba(0,0,0,0.04)]" : "",
          ].join(" ")}
          onClick={onSync}
          disabled={!canSync}
        >
          Sync with Xero
        </Button>
      </div>
    </Card>
  );
}
