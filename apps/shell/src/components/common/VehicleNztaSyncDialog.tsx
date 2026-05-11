import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { Button } from "@/components/ui";
import type { VehicleNztaSyncDialogSteps, VehicleNztaSyncUiStatus } from "./VehicleNztaSyncDialogState";

type VehicleNztaSyncDialogProps = {
  open: boolean;
  isSyncing: boolean;
  phase: "confirm" | "status";
  errorMessage?: string | null;
  steps: VehicleNztaSyncDialogSteps;
  onConfirm: () => void;
  onClose: () => void;
};

function StatusBadge({ status }: { status: VehicleNztaSyncUiStatus }) {
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

function StepRow({
  index,
  label,
  status,
  message,
}: {
  index: number;
  label: string;
  status: VehicleNztaSyncUiStatus;
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

export function VehicleNztaSyncDialog({
  open,
  isSyncing,
  phase,
  errorMessage,
  steps,
  onConfirm,
  onClose,
}: VehicleNztaSyncDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4">
      <div className="w-full max-w-xl rounded-[16px] bg-white p-5 shadow-xl">
        <div className="text-lg font-semibold text-[var(--ds-text)]">
          {phase === "confirm" ? "同步 NZTA 车辆信息" : "NZTA 同步状态"}
        </div>

        {phase === "confirm" ? (
          <div className="mt-3 text-sm text-[var(--ds-muted)]">
            确认从 NZTA 抓取这台车的 WOF Expiry、Licence Expiry、RUC Licence Number 和 RUC End Distance 吗？
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <StepRow
              index={1}
              label="查询 NZTA"
              status={steps.lookup.status}
              message={steps.lookup.message}
            />
            <StepRow
              index={2}
              label="解析返回数据"
              status={steps.parse.status}
              message={steps.parse.message}
            />
            <StepRow
              index={3}
              label="写入车辆资料"
              status={steps.save.status}
              message={steps.save.message}
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
              <Button onClick={onClose} disabled={isSyncing}>
                取消
              </Button>
              <Button variant="primary" onClick={onConfirm} disabled={isSyncing}>
                Yes 开始同步
              </Button>
            </>
          ) : (
            <Button onClick={onClose} disabled={isSyncing}>
              关闭
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
