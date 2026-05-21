import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui";
import type { DeleteJobDialogSteps, DeleteJobUiStatus } from "./DeleteJobDialogState";

type DeleteJobDialogProps = {
  open: boolean;
  isDeleting: boolean;
  phase: "confirm" | "status";
  errorMessage?: string | null;
  steps: DeleteJobDialogSteps;
  onConfirm: () => void;
  onClose: () => void;
};

function StatusBadge({ status }: { status: DeleteJobUiStatus }) {
  if (status === "success") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Completed
      </span>
    );
  }

  if (status === "failed") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700">
        <XCircle className="h-3.5 w-3.5" />
        Failed
      </span>
    );
  }

  if (status === "in_progress") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        In Progress
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
      Pending
    </span>
  );
}

function StepRow({
  index,
  label,
  status,
  message,
}: {
  index: number;
  label: string;
  status: DeleteJobUiStatus;
  message: string;
}) {
  return (
    <div className="rounded-[12px] border border-[rgba(0,0,0,0.08)] bg-[rgba(0,0,0,0.02)] px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-[var(--ds-text)]">
            {index}. {label}
          </div>
          <div className="mt-1 text-sm text-[var(--ds-muted)]">{message}</div>
        </div>
        <StatusBadge status={status} />
      </div>
    </div>
  );
}

export function DeleteJobDialog({
  open,
  isDeleting,
  phase,
  errorMessage,
  steps,
  onConfirm,
  onClose,
}: DeleteJobDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4">
      <div className="w-full max-w-xl rounded-[16px] bg-white p-5 shadow-xl">
        <div className="text-lg font-semibold text-[var(--ds-text)]">
          {phase === "confirm" ? "Confirm Deletion" : "Deletion Status"}
        </div>

        {phase === "confirm" ? (
          <div className="mt-3 text-sm text-[var(--ds-muted)]">
            Confirm deleting this job? This will also handle the Xero draft, Gmail message, and local job data.
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <StepRow
              index={1}
              label="Delete from Xero"
              status={steps.xero.status}
              message={steps.xero.message}
            />
            <StepRow
              index={2}
              label="Delete Gmail message"
              status={steps.gmail.status}
              message={steps.gmail.message}
            />
            <StepRow
              index={3}
              label="Delete local job"
              status={steps.job.status}
              message={steps.job.message}
            />
            {errorMessage ? (
              <div className="rounded-[12px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {errorMessage}
              </div>
            ) : null}
          </div>
        )}

        <div className="mt-5 flex justify-end gap-2">
          {phase === "confirm" ? (
            <>
              <Button onClick={onClose} disabled={isDeleting}>
                Cancel
              </Button>
              <Button variant="primary" onClick={onConfirm} disabled={isDeleting}>
                Yes, continue deleting
              </Button>
            </>
          ) : (
            <Button onClick={onClose} disabled={isDeleting}>
              Close
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
