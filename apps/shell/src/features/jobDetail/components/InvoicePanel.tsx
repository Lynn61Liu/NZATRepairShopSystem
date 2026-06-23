import { useEffect, useMemo, useState } from "react";
import { FileText, Plus, RefreshCcw, X } from "lucide-react";
import { Button, Input, Select } from "@/components/ui";
import { InvoiceDashboard } from "@/features/invoice/components/invoicePanel/InvoiceDashboard";
import type { InvoicePanelModel } from "@/features/invoice/hooks/useInvoiceDashboardState";
import { withApiBase } from "@/utils/api";
import { formatNzDateTime } from "@/utils/date";

type InvoicePanelProps = {
  model?: InvoicePanelModel;
  hasInvoice?: boolean;
  invoiceProcessing?: {
    status: string;
    messageType: string;
    attemptCount: number;
    lastError?: string | null;
    availableAt?: string;
    lockedAt?: string | null;
    createdAt?: string;
    updatedAt?: string;
    processedAt?: string | null;
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
  const [paymentMethod, setPaymentMethod] = useState<"cash" | "partial_cash" | "epost" | "bank_transfer">("cash");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentEditing, setPaymentEditing] = useState(true);
  const [pdfPreviewOpen, setPdfPreviewOpen] = useState(false);

  const invoiceTotal = useMemo(() => {
    if (!model) return 0;
    return Number.isFinite(model.totalAmount) ? model.totalAmount : 0;
  }, [model]);

  const latestPayment = model?.sourceInvoice?.latestPayment ?? model?.persistedInvoice?.latestPayment ?? null;
  const activeInvoice = model?.activeInvoice ?? model?.sourceInvoice ?? model?.persistedInvoice ?? null;
  const pdfUrl = activeInvoice?.pdfUrl ? withApiBase(activeInvoice.pdfUrl) : "";
  const pdfPreviewUrl = activeInvoice?.pdfPreviewUrl ? withApiBase(activeInvoice.pdfPreviewUrl) : "";
  const pdfDownloadedAt = activeInvoice?.pdfDownloadedAt ?? "";
  const pdfPreviewGeneratedAt = activeInvoice?.pdfPreviewGeneratedAt ?? "";
  const hasPdf = Boolean(pdfUrl);
  const canPullPdf = Boolean(activeInvoice?.externalInvoiceId);

  useEffect(() => {
    if (!pdfUrl) {
      setPdfPreviewOpen(false);
    }
  }, [pdfUrl]);

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
        : paymentMethod === "partial_cash"
          ? "PAID_PARTIAL_CASH"
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
              <div className="font-semibold">
                {invoiceProcessing.status === "failed"
                  ? `Invoice background processing failed${invoiceProcessing.lastError ? `: ${invoiceProcessing.lastError}` : "."}`
                  : `Invoice background processing is ${invoiceProcessing.status}.`}
              </div>
              <div className="mt-2 grid gap-1 text-xs opacity-85 sm:grid-cols-2">
                <div>Type: {formatInvoiceProcessingType(invoiceProcessing.messageType)}</div>
                <div>Attempts: {invoiceProcessing.attemptCount}</div>
                <div>Queued: {formatNzDateTime(invoiceProcessing.createdAt)}</div>
                <div>Available: {formatNzDateTime(invoiceProcessing.availableAt)}</div>
                <div>Last update: {formatNzDateTime(invoiceProcessing.updatedAt)}</div>
                <div>
                  {invoiceProcessing.lockedAt
                    ? `Started: ${formatNzDateTime(invoiceProcessing.lockedAt)}`
                    : "Started: not yet"}
                </div>
              </div>
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
          <div className="flex flex-wrap items-start gap-4">
            <div className={["relative min-w-0 flex-1 overflow-visible", hasPdf ? "group" : ""].join(" ")}>
              <button
                type="button"
                onClick={() => {
                  if (hasPdf) setPdfPreviewOpen(true);
                }}
                disabled={!hasPdf}
                className={[
                  "flex w-full items-start gap-4 rounded-[16px] border bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(250,250,250,0.92))] p-4 text-left shadow-sm transition",
                  hasPdf
                    ? "border-[rgba(0,0,0,0.08)] hover:-translate-y-0.5 hover:shadow-md"
                    : "cursor-default border-dashed border-[rgba(0,0,0,0.10)]",
                ].join(" ")}
              >
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[14px] bg-[rgba(220,38,38,0.08)] text-[rgba(220,38,38,0.92)] shadow-inner">
                  <FileText className="h-7 w-7" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold text-[rgba(0,0,0,0.76)]">Invoice PDF</div>
                  <div className="mt-1 text-sm text-[var(--ds-muted)]">
                    {pdfDownloadedAt ? `Saved locally ${formatNzDateTime(pdfDownloadedAt)}` : "PDF has not been cached locally yet."}
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs font-medium">
                    {hasPdf ? (
                      <>
                        <span className="rounded-full bg-[rgba(0,0,0,0.04)] px-2.5 py-1 text-[rgba(0,0,0,0.62)]">Hover to preview</span>
                        {pdfPreviewGeneratedAt ? (
                          <span className="rounded-full bg-[rgba(16,185,129,0.10)] px-2.5 py-1 text-[rgba(6,95,70,0.9)]">
                            Preview generated {formatNzDateTime(pdfPreviewGeneratedAt)}
                          </span>
                        ) : (
                          <span className="rounded-full bg-[rgba(0,0,0,0.04)] px-2.5 py-1 text-[rgba(0,0,0,0.62)]">Preview unavailable</span>
                        )}
                      </>
                    ) : (
                      <span className="rounded-full bg-[rgba(0,0,0,0.04)] px-2.5 py-1 text-[rgba(0,0,0,0.62)]">No PDF cached yet</span>
                    )}
                  </div>
                </div>
              </button>

              {hasPdf ? (
                <div className="pointer-events-none absolute left-0 top-full z-20 mt-3 w-[360px] opacity-0 translate-y-2 transition duration-200 group-hover:opacity-100 group-hover:translate-y-0">
                  <div className="overflow-hidden rounded-2xl border border-[rgba(0,0,0,0.08)] bg-white shadow-2xl">
                    {pdfPreviewUrl ? (
                      <img src={pdfPreviewUrl} alt="Invoice PDF preview" className="h-[420px] w-full object-contain bg-slate-100" />
                    ) : (
                      <div className="flex h-[420px] items-center justify-center bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(250,250,250,0.94))] p-6 text-center">
                        <div>
                          <FileText className="mx-auto h-10 w-10 text-[rgba(220,38,38,0.72)]" />
                          <div className="mt-3 text-sm font-semibold text-[rgba(0,0,0,0.72)]">Preview unavailable</div>
                          <div className="mt-1 text-xs text-[var(--ds-muted)]">
                            Pull the latest invoice PDF to generate a preview thumbnail.
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ) : null}
            </div>

              <div className="flex w-full flex-row gap-2 sm:w-auto sm:flex-col">
                <a
                  href={pdfUrl || "#"}
                  onClick={(event) => {
                    if (!pdfUrl) event.preventDefault();
                  }}
                  target={pdfUrl ? "_blank" : undefined}
                  rel={pdfUrl ? "noreferrer" : undefined}
                  className={[
                    "inline-flex h-10 items-center justify-center rounded-[10px] px-4 text-sm font-medium transition",
                    pdfUrl
                      ? "border border-[rgba(0,0,0,0.08)] bg-white text-[rgba(0,0,0,0.72)] hover:bg-[rgba(0,0,0,0.02)]"
                      : "cursor-not-allowed border border-[rgba(0,0,0,0.08)] bg-[rgba(0,0,0,0.03)] text-[rgba(0,0,0,0.38)]",
                  ].join(" ")}
                >
                  Open
                </a>
                <Button
                  variant="primary"
                  className="h-10 rounded-[10px] px-4"
                  leftIcon={<RefreshCcw className={["h-4 w-4", model.pullingInvoicePdf ? "animate-spin" : ""].join(" ")} />}
                  onClick={() => void model.pullInvoicePdf()}
                  disabled={model.pullingInvoicePdf || !canPullPdf}
                >
                  {model.pullingInvoicePdf ? "Pulling PDF..." : pdfUrl ? "Re-pull PDF" : "Pull PDF"}
                </Button>
              </div>
            </div>
          </div>
        ) : null}
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
              <Select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as "cash" | "partial_cash" | "epost" | "bank_transfer")}>
                <option value="cash">Cash</option>
                <option value="partial_cash">Partial Cash</option>
                <option value="epost">Eftpos</option>
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
                  ? "Eftpos"
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
      {pdfPreviewOpen && pdfUrl ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
          <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div className="min-w-0">
                <div className="truncate text-base font-semibold text-slate-900">Invoice PDF</div>
                <div className="text-xs text-slate-500">Local cached copy</div>
              </div>
              <button
                type="button"
                onClick={() => setPdfPreviewOpen(false)}
                className="rounded-full p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="min-h-[70vh] flex-1 bg-slate-100">
              <iframe title="Invoice PDF preview" src={pdfUrl} className="h-[70vh] w-full border-0" />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function formatInvoiceProcessingType(messageType: string) {
  switch (messageType) {
    case "job_invoice.create_draft":
      return "Create Xero draft";
    case "job_invoice.attach_existing":
      return "Attach existing invoice";
    default:
      return messageType || "Unknown";
  }
}
