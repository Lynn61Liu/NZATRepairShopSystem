import { useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { Button, Input, Select } from "@/components/ui";
import { InvoiceDashboard } from "@/features/invoice/components/InvoiceDashboard";
import type { InvoiceDashboardModel } from "@/features/invoice/hooks/useInvoiceDashboardState";

type InvoicePanelProps = {
  model?: InvoiceDashboardModel;
  hasInvoice?: boolean;
  invoiceProcessing?: {
    status: string;
    messageType: string;
    attemptCount: number;
    lastError?: string | null;
  } | null;
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
  invoiceProcessing,
  onCreateInvoice,
  isCreatingInvoice,
  onAttachInvoice,
  isAttachingInvoice,
  onDetachInvoice,
  isDetachingInvoice,
  needsPo,
}: InvoicePanelProps) {
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "epost" | "bank_transfer">("cash");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentEditing, setPaymentEditing] = useState(true);

  const invoiceTotal = useMemo(() => {
    if (!model) return 0;
    return Number.isFinite(model.totalAmount) ? model.totalAmount : 0;
  }, [model]);

  const latestPayment = model?.sourceInvoice?.latestPayment ?? model?.persistedInvoice?.latestPayment ?? null;

  useEffect(() => {
    if (!hasInvoice) {
      setPaymentAmount("");
      setPaymentReference("");
      setPaymentMethod("cash");
      setPaymentEditing(true);
      return;
    }
    setPaymentMethod(
      latestPayment?.method === "epost"
        ? "epost"
        : latestPayment?.method === "bank_transfer"
          ? "bank_transfer"
          : "cash"
    );
    setPaymentAmount((latestPayment?.amount ?? invoiceTotal) > 0 ? (latestPayment?.amount ?? invoiceTotal).toFixed(2) : "");
    setPaymentReference(latestPayment?.reference ?? "");
    setPaymentEditing(!latestPayment);
  }, [hasInvoice, invoiceTotal, latestPayment]);

  const handleAttachInvoice = async () => {
    if (!onAttachInvoice) return;
    const result = await onAttachInvoice(invoiceNumber);
    if (result.success) {
      setInvoiceNumber("");
    }
  };

  const handleSavePayment = async () => {
    if (!model || !hasInvoice) return;

    const parsedAmount = Number(paymentAmount || 0);
    const state =
      paymentMethod === "cash"
        ? "PAID_CASH"
        : paymentMethod === "epost"
          ? "PAID_EPOST"
          : "PAID_BANK_TRANSFER";

    const result = await model.updateXeroState(state, {
      amount: Number.isFinite(parsedAmount) && parsedAmount > 0 ? parsedAmount : invoiceTotal,
      reference: paymentReference,
      epostReferenceId: paymentMethod === "epost" ? paymentReference : undefined,
    });
    if (result.success) {
      setPaymentEditing(false);
    }
  };

  const handleCancelPaymentEdit = () => {
    setPaymentMethod(
      latestPayment?.method === "epost"
        ? "epost"
        : latestPayment?.method === "bank_transfer"
          ? "bank_transfer"
          : "cash"
    );
    setPaymentAmount((latestPayment?.amount ?? invoiceTotal) > 0 ? (latestPayment?.amount ?? invoiceTotal).toFixed(2) : "");
    setPaymentReference(latestPayment?.reference ?? "");
    setPaymentEditing(false);
  };

  return (
    <div className="py-6">
      {!hasInvoice ? (
        <div className="mb-6 rounded-[18px] border border-[rgba(0,0,0,0.08)] bg-white p-5">
          <div className="mb-4 text-sm font-semibold text-[rgba(0,0,0,0.72)]">No linked invoice</div>
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:items-center">
            <Button
              variant="primary"
              leftIcon={<Plus className="h-4 w-4" />}
              className="h-11 w-[200px] max-w-full justify-center self-center justify-self-center rounded-[10px] px-5"
              onClick={() => void onCreateInvoice?.()}
              disabled={isCreatingInvoice || isAttachingInvoice}
            >
              {isCreatingInvoice ? "Creating..." : "New Invoice"}
            </Button>
            <div className="flex items-center justify-center text-xs font-semibold uppercase tracking-[0.18em] text-[var(--ds-muted)]">
              OR
            </div>
            <div className="grid justify-center gap-2 md:grid-cols-[200px_auto]">
              <Input
                value={invoiceNumber}
                onChange={(event) => setInvoiceNumber(event.target.value)}
                placeholder="Input for link, e.g. INV-00123"
                className="h-11 w-[200px]"
              />
              <Button
                variant="primary"
                className="h-11 rounded-[10px] px-5"
                onClick={() => void handleAttachInvoice()}
                disabled={isCreatingInvoice || isAttachingInvoice || !invoiceNumber.trim()}
              >
                {isAttachingInvoice ? "Linking..." : "Link"}
              </Button>
            </div>
          </div>
          {invoiceProcessing ? (
            <div
              className={[
                "mt-4 rounded-[12px] border px-4 py-3 text-sm",
                invoiceProcessing.status === "failed"
                  ? "border-[rgba(220,38,38,0.16)] bg-[rgba(254,242,242,0.95)] text-red-700"
                  : "border-[rgba(37,99,235,0.14)] bg-[rgba(239,246,255,0.9)] text-blue-700",
              ].join(" ")}
            >
              {invoiceProcessing.status === "failed"
                ? `Invoice background processing failed${invoiceProcessing.lastError ? `: ${invoiceProcessing.lastError}` : "."}`
                : `Invoice background processing is ${invoiceProcessing.status}.`}
            </div>
          ) : null}
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
      {hasInvoice && model ? (
        <div className="mt-6 rounded-xl border border-[rgba(0,0,0,0.08)] bg-white p-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="text-xl font-semibold text-[rgba(0,0,0,0.72)]">Payment</div>
            {!paymentEditing && latestPayment ? (
              <Button variant="ghost" onClick={() => setPaymentEditing(true)}>
                Modify
              </Button>
            ) : null}
          </div>
          {paymentEditing ? (
            <div className="grid gap-3 md:grid-cols-[180px_minmax(0,180px)_minmax(0,1fr)_auto_auto]">
              <Select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as "cash" | "epost" | "bank_transfer")}>
                <option value="cash">Cash</option>
                <option value="epost">ePost</option>
                <option value="bank_transfer">Bank transfer</option>
              </Select>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={paymentAmount}
                onChange={(event) => setPaymentAmount(event.target.value)}
                placeholder="Amount"
              />
              <Input
                value={paymentReference}
                onChange={(event) => setPaymentReference(event.target.value)}
                placeholder="Remark"
              />
              {latestPayment ? (
                <Button variant="ghost" onClick={handleCancelPaymentEdit} disabled={model.updatingXeroState}>
                  Cancel
                </Button>
              ) : null}
              <Button onClick={() => void handleSavePayment()} disabled={model.updatingXeroState}>
                {model.updatingXeroState ? "Saving..." : "Save"}
              </Button>
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-[180px_minmax(0,180px)_minmax(0,1fr)]">
              <div className="flex h-11 items-center rounded-[8px] border border-[rgba(0,0,0,0.10)] bg-[rgba(0,0,0,0.02)] px-3 text-sm text-[var(--ds-text)]">
                {latestPayment?.method === "epost"
                  ? "ePost"
                  : latestPayment?.method === "bank_transfer"
                    ? "Bank transfer"
                    : "Cash"}
              </div>
              <div className="flex h-11 items-center rounded-[8px] border border-[rgba(0,0,0,0.10)] bg-[rgba(0,0,0,0.02)] px-3 text-sm text-[var(--ds-text)]">
                {latestPayment?.amount?.toFixed(2) ?? paymentAmount ?? "-"}
              </div>
              <div className="flex min-h-[44px] items-center rounded-[8px] border border-[rgba(0,0,0,0.10)] bg-[rgba(0,0,0,0.02)] px-3 text-sm text-[var(--ds-text)]">
                {latestPayment?.reference || "-"}
              </div>
            </div>
          )}
          <div className="mt-2 text-xs text-[var(--ds-muted)]">
            Cash will delete the Xero draft. ePost and bank transfer will set the invoice to Waiting payment.
          </div>
        </div>
      ) : null}
    </div>
  );
}
