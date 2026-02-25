import { useMemo, useState } from "react";
import type { PaintService } from "@/types";
import { Button, Select } from "@/components/ui";
import { Trash2 } from "lucide-react";
import { notifyPaintBoardRefresh } from "@/utils/refreshSignals";

type PaintPanelProps = {
  service?: PaintService | null;
  isLoading?: boolean;
  onCreateService?: (status?: string) => Promise<{ success: boolean; message?: string }>;
  onUpdateStage?: (stageIndex: number) => Promise<{ success: boolean; message?: string }>;
  onUpdatePanels?: (panels: number) => Promise<{ success: boolean; message?: string }>;
  onDeleteService?: () => Promise<{ success: boolean; message?: string }>;
  onRefresh?: () => Promise<void>;
};

type StageItem = {
  key: string;
  label: string;
  description?: string;
  stageIndex: number;
};

const PAINT_STAGES: StageItem[] = [
  { key: "not_started", label: "等待处理", stageIndex: -1 },
  { key: "panel_primer", label: "钣金/底漆", description: "钣金修复与底层处理", stageIndex: 0 },
  { key: "primer", label: "打底漆", description: "喷涂打底漆", stageIndex: 1 },
  { key: "sanding", label: "底漆打磨", description: "底漆打磨处理", stageIndex: 2 },
  { key: "paint", label: "喷漆", description: "喷涂面漆", stageIndex: 3 },
  { key: "assembly", label: "组装抛光", description: "配件安装与抛光", stageIndex: 4 },
  { key: "done", label: "完成喷漆", stageIndex: 5 },
];

export function PaintPanel({
  service,
  isLoading,
  onCreateService,
  onUpdateStage,
  onUpdatePanels,
  onDeleteService,
}: PaintPanelProps) {
  const [updatingStage, setUpdatingStage] = useState<number | null>(null);
  const [updatingPanels, setUpdatingPanels] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const status = service?.status ?? "pending";
  const currentStage = typeof service?.currentStage === "number" ? service.currentStage : -1;
  const panelsValue = service?.panels ?? 1;

  const stageStates = useMemo(() => {
    return PAINT_STAGES.map((stage) => {
      if (stage.key === "not_started") {
        if (status === "done") return "done";
        if (currentStage < 0) return "current";
        return "done";
      }
      if (stage.key === "done") {
        return status === "done" ? "current" : "not_started";
      }
      if (status === "done") return "done";
      if (currentStage > stage.stageIndex) return "done";
      if (currentStage === stage.stageIndex) return "current";
      return "not_started";
    });
  }, [status, currentStage]);

  const handleStageClick = async (stageIndex: number) => {
    if (!onUpdateStage) return;
    if (!service) {
      if (onCreateService) {
        await onCreateService("not_started");
      }
    }
    setUpdatingStage(stageIndex);
    await onUpdateStage(stageIndex);
    setUpdatingStage(null);
  };

  const handlePanelsChange = async (value: string) => {
    const next = Number(value);
    if (!Number.isFinite(next) || next <= 0) return;
    if (!onUpdatePanels) return;
    setUpdatingPanels(true);
    await onUpdatePanels(next);
    setUpdatingPanels(false);
  };

  const handleDelete = async () => {
    if (!onDeleteService) return;
    if (!window.confirm("确定删除喷漆服务？")) return;
    setDeleteError(null);
    setDeleting(true);
    const res = await onDeleteService();
    setDeleting(false);
    if (res.success) {
      // no-op, refresh is handled upstream
      notifyPaintBoardRefresh();
    } else {
      setDeleteError(res.message || "删除失败");
    }
  };

  if (!service && !isLoading) {
    return (
      <div className="py-8 text-center">
        <div className="text-sm text-[var(--ds-muted)]">暂无喷漆服务</div>
        {onCreateService ? (
          <Button className="mt-3" variant="primary" onClick={() => onCreateService("not_started")}>
            创建喷漆服务
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm font-semibold text-[var(--ds-text)]">喷漆流程</div>
        <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--ds-muted)] mt-4">
          {deleteError ? <div className="text-xs text-red-600">{deleteError}</div> : null}
          <span>片数</span>
          <Select
            value={String(panelsValue)}
            onChange={(event) => handlePanelsChange(event.target.value)}
            disabled={updatingPanels || isLoading || !onUpdatePanels}
            className="h-8 w-[90px]"
          >
            {Array.from({ length: 20 }, (_, i) => String(i + 1)).map((value) => (
              <option key={value} value={value}>
                {value}片
              </option>
            ))}
          </Select>
          <Button
            leftIcon={<Trash2 className="h-4 w-4" />}
            className="border-red-300 text-red-700 hover:bg-red-50"
            onClick={handleDelete}
            disabled={isLoading || deleting}
          >
            删除喷漆
          </Button>
        </div>
      </div>
      <div className="space-y-4">
        {PAINT_STAGES.map((stage, index) => {
          const state = stageStates[index];
          const isDone = state === "done";
          const isCurrent = state === "current";
          const dotClass = isDone
            ? "bg-emerald-500 border-emerald-500"
            : isCurrent
              ? "bg-indigo-500 border-indigo-500"
              : "bg-white border-[rgba(0,0,0,0.25)]";
          const lineClass = isDone ? "bg-emerald-200" : "bg-[rgba(0,0,0,0.08)]";
          const cardClass = isDone
            ? "bg-emerald-50 border-emerald-200 text-emerald-800"
            : isCurrent
              ? "bg-indigo-50 border-indigo-200 text-indigo-800"
              : "bg-white border-[rgba(0,0,0,0.08)] text-[var(--ds-text)]";

          const badge =
            stage.key === "done"
              ? "完成"
              : isDone
                ? "完成"
                : isCurrent
                  ? "进行中"
                  : "未开始";

          return (
            <div key={stage.key} className="flex gap-4">
              <div className="flex w-6 flex-col items-center">
                <div className={`h-5 w-5 rounded-full border-2 ${dotClass}`} />
                {index < PAINT_STAGES.length - 1 ? <div className={`mt-1 w-px flex-1 ${lineClass}`} /> : null}
              </div>
              <button
                type="button"
                className={`w-full rounded-xl border p-4 text-left transition ${cardClass}`}
                onClick={() => handleStageClick(stage.stageIndex)}
                disabled={updatingStage === stage.stageIndex || isLoading}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="font-semibold">{stage.label}</div>
                  <span
                    className={[
                      "rounded-full px-2 py-0.5 text-xs font-semibold",
                      isDone
                        ? "bg-emerald-100 text-emerald-700"
                        : isCurrent
                          ? "bg-indigo-100 text-indigo-700"
                          : "bg-gray-100 text-gray-600",
                    ].join(" ")}
                  >
                    {badge}
                  </span>
                </div>
                {stage.description ? (
                  <div className="mt-1 text-xs text-[rgba(0,0,0,0.55)]">{stage.description}</div>
                ) : null}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
