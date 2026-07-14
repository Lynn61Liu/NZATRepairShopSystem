import { Button } from "@/components/ui";
import { StepProgressRow } from "./StepProgressDialog";
import type { DeleteJobDialogSteps } from "./DeleteJobDialogState";

type DeleteJobDialogProps = {
  open: boolean;
  isDeleting: boolean;
  phase: "confirm" | "status";
  errorMessage?: string | null;
  steps: DeleteJobDialogSteps;
  onConfirm: () => void;
  onClose: () => void;
};

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
          {phase === "confirm" ? "确认删除操作" : "删除项目状态"}
        </div>

        {phase === "confirm" ? (
          <div className="mt-3 text-sm text-[var(--ds-muted)]">
            确认删除这个 Job 吗？该操作会同时处理 Xero draft、Gmail 信息和本地 Job 数据。
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <StepProgressRow
              index={1}
              label="删除 Xero 中"
              status={steps.xero.status}
              message={steps.xero.message}
            />
            <StepProgressRow
              index={2}
              label="删除 Gmail 信息"
              status={steps.gmail.status}
              message={steps.gmail.message}
            />
            <StepProgressRow
              index={3}
              label="删除 Job 中"
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
                取消
              </Button>
              <Button variant="primary" onClick={onConfirm} disabled={isDeleting}>
                Yes 继续删除
              </Button>
            </>
          ) : (
            <Button onClick={onClose} disabled={isDeleting}>
              关闭
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
