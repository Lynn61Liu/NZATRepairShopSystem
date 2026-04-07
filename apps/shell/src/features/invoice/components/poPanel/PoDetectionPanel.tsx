import { useState } from "react";
import { Check, ExternalLink, Link2, X } from "lucide-react";
import { Button, Card, Input } from "@/components/ui";
import { withApiBase } from "@/utils/api";
import { StatusBadge } from "./StatusBadge";
import type { PoDetection } from "../../types";

type Props = {
  detections: PoDetection[];
  selectedDetectionId: string | null;
  onSelect: (id: string) => void;
  onConfirm: (id: string) => void;
  manualPoNumber: string;
  currentInvoiceReference: string;
  onManualPoNumberChange: (value: string) => void;
  onSyncManualPoToReference: () => void;
  embedded?: boolean;
  readOnly?: boolean;
  readOnlyReason?: string;
};

export function PoDetectionPanel({
  detections,
  selectedDetectionId,
  onSelect,
  onConfirm,
  manualPoNumber,
  currentInvoiceReference,
  onManualPoNumberChange,
  onSyncManualPoToReference,
  embedded = false,
  readOnly = false,
  readOnlyReason,
}: Props) {
  const normalizedManualPo = manualPoNumber.trim();
  const canSyncManualPo =
    !readOnly && normalizedManualPo.length > 0 && !currentInvoiceReference.toLowerCase().includes(normalizedManualPo.toLowerCase());
  const [previewDetection, setPreviewDetection] = useState<PoDetection | null>(null);

  const canPreview = (detection: PoDetection) =>
    (detection.previewType === "pdf" || detection.previewType === "image") &&
    Boolean(detection.gmailMessageId && detection.attachmentId && detection.attachmentFileName && detection.attachmentMimeType);

  const buildPreviewUrl = (detection: PoDetection, inline: boolean) =>
    withApiBase(
      `/api/gmail/attachment?${new URLSearchParams({
        messageId: detection.gmailMessageId ?? "",
        attachmentId: detection.attachmentId ?? "",
        fileName: detection.attachmentFileName ?? "",
        mimeType: detection.attachmentMimeType ?? "",
        inline: inline ? "true" : "false",
      }).toString()}`
    );

  const content = (
    <>
      {embedded ? null : <div className="text-[28px] font-semibold tracking-[-0.03em] text-slate-900">PO Detection Panel</div>}

      {readOnly ? (
        <div className={`${embedded ? "" : "mt-5 "} rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800`}>
          {readOnlyReason || "PO detection actions are locked for this job."}
        </div>
      ) : null}

      <div className={`${embedded ? "" : "mt-5 "}overflow-hidden rounded-2xl border border-slate-200`}>
        <table className="w-full border-collapse">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-sm font-semibold text-slate-700">
              <th className="px-4 py-4">PO Number</th>
              <th className="px-4 py-4">Source</th>
              <th className="px-4 py-4">Evidence Preview</th>
              <th className="px-4 py-4">Preview</th>
              <th className="px-4 py-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {detections.map((detection) => {
              const isConfirmed = detection.status === "confirmed";
              return (
              <tr
                key={detection.id}
                className={`border-b border-slate-100 last:border-b-0 ${
                  isConfirmed
                    ? "bg-slate-100"
                    : selectedDetectionId === detection.id
                      ? "bg-slate-50"
                      : ""
                }`}
              >
                <td className={`px-4 py-4 text-sm font-semibold ${isConfirmed ? "text-slate-500" : "text-slate-900"}`}>{detection.poNumber}</td>
                <td className="px-4 py-4">
                  <StatusBadge kind="source" value={detection.source} />
                </td>
                <td className="px-4 py-4">
                  <button
                    type="button"
                    className={`text-left text-sm ${isConfirmed ? "text-slate-500" : "text-slate-600 hover:text-slate-900"}`}
                    onClick={() => onSelect(detection.id)}
                    disabled={readOnly || isConfirmed}
                  >
                    {detection.evidencePreview}
                  </button>
                </td>
                <td className="px-4 py-4">
                  {canPreview(detection) ? (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 text-sm font-medium text-sky-700 hover:text-sky-900"
                      onClick={() => setPreviewDetection(detection)}
                    >
                      <ExternalLink className="h-4 w-4" />
                      {detection.previewType === "pdf" ? "View PDF" : "View Image"}
                    </button>
                  ) : (
                    <span className="text-sm text-slate-400">-</span>
                  )}
                </td>
                <td className="px-4 py-4">
                  <div className="flex justify-end gap-2">
                    <Button
                      variant={isConfirmed ? "ghost" : "primary"}
                      className={isConfirmed ? "h-9 px-4 bg-slate-200 text-slate-500 border border-slate-300 hover:bg-slate-200" : "h-9 px-4"}
                      leftIcon={<Check className="h-4 w-4" />}
                      onClick={() => onConfirm(detection.id)}
                      disabled={readOnly || isConfirmed}
                    >
                      {isConfirmed ? "Confirmed" : "Confirm"}
                    </Button>
                  </div>
                </td>
              </tr>
            )})}
          </tbody>
        </table>
      </div>

      <div className="mt-5 rounded-2xl border border-slate-200 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[220px] flex-1">
            <div className="mb-2 text-sm font-medium text-slate-700">Received PO #</div>
            <Input
              value={manualPoNumber}
              onChange={(event) => onManualPoNumberChange(event.target.value)}
              placeholder="Input PO number"
              disabled={readOnly}
            />
          </div>
          <Button
            variant={canSyncManualPo ? "primary" : "ghost"}
            className={canSyncManualPo ? "h-11 px-5" : "h-11 px-5 bg-slate-200 text-slate-500 border border-slate-300 hover:bg-slate-200"}
            leftIcon={<Link2 className="h-4 w-4" />}
            onClick={onSyncManualPoToReference}
            disabled={!canSyncManualPo}
          >
            {canSyncManualPo ? "Sync to Invoice Ref" : "Synced to Invoice Ref"}
          </Button>
        </div>
        <div className="mt-3 text-sm text-slate-500">Current invoice reference: {currentInvoiceReference}</div>
      </div>

    </>
  );

  if (embedded) {
    return (
      <>
        {content}
        {previewDetection ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
            <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
              <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
                <div className="min-w-0">
                  <div className="truncate text-base font-semibold text-slate-900">
                    {previewDetection.attachmentFileName || previewDetection.previewLabel}
                  </div>
                  <div className="text-xs text-slate-500">
                    {previewDetection.previewType === "pdf" ? "PDF Preview" : "Image Preview"}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setPreviewDetection(null)}
                  className="rounded-full p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="min-h-[70vh] flex-1 bg-slate-100">
                {previewDetection.previewType === "image" ? (
                  <div className="flex h-full items-center justify-center p-4">
                    <img
                      src={buildPreviewUrl(previewDetection, true)}
                      alt={previewDetection.attachmentFileName || previewDetection.previewLabel}
                      className="max-h-full max-w-full object-contain"
                    />
                  </div>
                ) : (
                  <iframe
                    title={previewDetection.attachmentFileName || previewDetection.previewLabel}
                    src={buildPreviewUrl(previewDetection, true)}
                    className="h-[70vh] w-full border-0"
                  />
                )}
              </div>
            </div>
          </div>
        ) : null}
      </>
    );
  }

  return (
    <Card className="rounded-[18px] p-6">
      {content}
      {previewDetection ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4">
          <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
              <div className="min-w-0">
                <div className="truncate text-base font-semibold text-slate-900">
                  {previewDetection.attachmentFileName || previewDetection.previewLabel}
                </div>
                <div className="text-xs text-slate-500">
                  {previewDetection.previewType === "pdf" ? "PDF Preview" : "Image Preview"}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPreviewDetection(null)}
                className="rounded-full p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="min-h-[70vh] flex-1 bg-slate-100">
              {previewDetection.previewType === "image" ? (
                <div className="flex h-full items-center justify-center p-4">
                  <img
                    src={buildPreviewUrl(previewDetection, true)}
                    alt={previewDetection.attachmentFileName || previewDetection.previewLabel}
                    className="max-h-full max-w-full object-contain"
                  />
                </div>
              ) : (
                <iframe
                  title={previewDetection.attachmentFileName || previewDetection.previewLabel}
                  src={buildPreviewUrl(previewDetection, true)}
                  className="h-[70vh] w-full border-0"
                />
              )}
            </div>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
