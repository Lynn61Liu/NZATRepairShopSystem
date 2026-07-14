import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui";

export type StepProgressStatus = "pending" | "in_progress" | "success" | "failed";

export type StepProgressItem = {
  label: string;
  status: StepProgressStatus;
  message: string;
};

type StepProgressDialogProps = {
  open: boolean;
  title: string;
  steps: StepProgressItem[];
  errorMessage?: string | null;
  isBusy?: boolean;
  onClose: () => void;
};

export function StepStatusBadge({ status }: { status: StepProgressStatus }) {
  if (status === "success") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
        <CheckCircle2 className="h-3.5 w-3.5" />
        已完成
      </span>
    );
  }

  if (status === "failed") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700">
        <XCircle className="h-3.5 w-3.5" />
        失败
      </span>
    );
  }

  if (status === "in_progress") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        处理中
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
      等待中
    </span>
  );
}

export function StepProgressRow({
  index,
  label,
  status,
  message,
}: {
  index: number;
  label: string;
  status: StepProgressStatus;
  message: string;
}) {
  return (
    <div className="rounded-[12px] border border-[rgba(0,0,0,0.08)] bg-[rgba(0,0,0,0.02)] px-5 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-base font-semibold text-[var(--ds-text)]">
            {index}. {label}
          </div>
          <div className="mt-1 text-base text-[var(--ds-muted)]">{message}</div>
        </div>
        <StepStatusBadge status={status} />
      </div>
    </div>
  );
}

export function StepProgressDialog({ open, title, steps, errorMessage, isBusy = false, onClose }: StepProgressDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4">
      <div className="w-full max-w-3xl rounded-[20px] bg-white p-6 shadow-xl">
        <div className="text-xl font-semibold text-[var(--ds-text)]">{title}</div>

        <div className="mt-6 space-y-4">
          {steps.map((step, index) => (
            <StepProgressRow
              key={step.label}
              index={index + 1}
              label={step.label}
              status={step.status}
              message={step.message}
            />
          ))}
          {errorMessage ? (
            <div className="rounded-[12px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {errorMessage}
            </div>
          ) : null}
        </div>

        <div className="mt-6 flex justify-end">
          <Button onClick={onClose} disabled={isBusy}>
            关闭
          </Button>
        </div>
      </div>
    </div>
  );
}
