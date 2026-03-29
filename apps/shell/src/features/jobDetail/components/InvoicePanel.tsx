import { useState } from "react";
import { Button, Input } from "@/components/ui";
import { InvoiceDashboard } from "@/features/invoice/components/InvoiceDashboard";
import type { InvoiceDashboardModel } from "@/features/invoice/hooks/useInvoiceDashboardState";

type InvoicePanelProps = {
  model?: InvoiceDashboardModel;
  hasInvoice?: boolean;
  onCreateInvoice?: () => Promise<{ success: boolean; message?: string }>;
  isCreatingInvoice?: boolean;
  onAttachInvoice?: (invoiceNumber: string) => Promise<{ success: boolean; message?: string }>;
  isAttachingInvoice?: boolean;
  onDetachInvoice?: () => Promise<{ success: boolean; message?: string }>;
  isDetachingInvoice?: boolean;
  needsPo?: boolean;
};

export function InvoicePanel({
  model,
  hasInvoice,
  onCreateInvoice,
  isCreatingInvoice,
  onAttachInvoice,
  isAttachingInvoice,
  onDetachInvoice,
  isDetachingInvoice,
  needsPo,
}: InvoicePanelProps) {
  const [invoiceNumber, setInvoiceNumber] = useState("");

  const handleAttachInvoice = async () => {
    if (!onAttachInvoice) return;
    const result = await onAttachInvoice(invoiceNumber);
    if (result.success) {
      setInvoiceNumber("");
    }
  };

  return (
    <div className="py-6">
      {!hasInvoice ? (
        <div className="mb-6 rounded-xl border border-[rgba(0,0,0,0.08)] bg-white p-4">
          <div className="mb-3 text-sm font-semibold text-[rgba(0,0,0,0.72)]">No linked invoice</div>
          <div className="flex flex-col gap-3 md:flex-row">
            <Button onClick={() => void onCreateInvoice?.()} disabled={isCreatingInvoice || isAttachingInvoice}>
              {isCreatingInvoice ? "Creating..." : "Create New Invoice"}
            </Button>
            <div className="flex flex-1 gap-2">
              <Input
                value={invoiceNumber}
                onChange={(event) => setInvoiceNumber(event.target.value)}
                placeholder="Invoice Number, e.g. INV-00123"
              />
              <Button
                onClick={() => void handleAttachInvoice()}
                disabled={isCreatingInvoice || isAttachingInvoice || !invoiceNumber.trim()}
              >
                {isAttachingInvoice ? "Linking..." : "Link Existing"}
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <div className="mb-4 flex justify-end">
          <Button
            variant="ghost"
            onClick={() => void onDetachInvoice?.()}
            disabled={isDetachingInvoice}
          >
            {isDetachingInvoice ? "Unlinking..." : "Unlink Invoice"}
          </Button>
        </div>
      )}
      <InvoiceDashboard
        model={model}
        hasInvoice={hasInvoice}
        onCreateInvoice={onCreateInvoice}
        isCreatingInvoice={isCreatingInvoice}
        needsPo={needsPo}
      />
    </div>
  );
}
