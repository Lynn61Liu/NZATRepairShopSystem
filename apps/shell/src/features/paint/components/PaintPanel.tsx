import { useMemo, useState } from "react";
import type { PaintService } from "@/types";
import { Button, Select } from "@/components/ui";
import { Trash2 } from "lucide-react";
import { mapStageKey, PAINT_STAGE_OPTIONS, PAINT_STAGE_PROGRESS_ORDER, type StageKey } from "@/features/paint/paintBoard.utils";
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
  key: StageKey;
  label: string;
  description?: string;
  stageIndex: number;
};

const PAINT_STAGE_DESCRIPTIONS: Partial<Record<StageKey, string>> = {
  on_hold: "The order is suspended and the painting schedule will not be entered for the time being.",
  sheet: "Sheet metal repair and underlying treatment",
  undercoat: "Spray primer",
  sanding: "Primer sanding treatment",
  painting: "Spray topcoat",
  assembly: "Accessory installation and polishing",
  delivered: "The vehicle has been delivered to the customer",
};

const PAINT_STAGES: StageItem[] = PAINT_STAGE_OPTIONS.map((stage) => ({
  key: stage.key,
  label: stage.label,
  description: PAINT_STAGE_DESCRIPTIONS[stage.key],
  stageIndex: stage.stageIndex,
}));

const CURRENT_STAGE_TONE: Record<StageKey, { dot: string; card: string; badge: string }> = {
  on_hold: {
    dot: "bg-amber-500 border-amber-500",
    card: "bg-amber-50 border-amber-200 text-amber-800",
    badge: "bg-amber-100 text-amber-700",
  },
  waiting: {
    dot: "bg-slate-500 border-slate-500",
    card: "bg-slate-50 border-slate-200 text-slate-800",
    badge: "bg-slate-200 text-slate-700",
  },
  sheet: {
    dot: "bg-sky-500 border-sky-500",
    card: "bg-sky-50 border-sky-200 text-sky-800",
    badge: "bg-sky-100 text-sky-700",
  },
  undercoat: {
    dot: "bg-amber-500 border-amber-500",
    card: "bg-amber-50 border-amber-200 text-amber-800",
    badge: "bg-amber-100 text-amber-700",
  },
  sanding: {
    dot: "bg-fuchsia-500 border-fuchsia-500",
    card: "bg-fuchsia-50 border-fuchsia-200 text-fuchsia-800",
    badge: "bg-fuchsia-100 text-fuchsia-700",
  },
  painting: {
    dot: "bg-rose-500 border-rose-500",
    card: "bg-rose-50 border-rose-200 text-rose-800",
    badge: "bg-rose-100 text-rose-700",
  },
  assembly: {
    dot: "bg-teal-500 border-teal-500",
    card: "bg-teal-50 border-teal-200 text-teal-800",
    badge: "bg-teal-100 text-teal-700",
  },
  done: {
    dot: "bg-emerald-500 border-emerald-500",
    card: "bg-emerald-50 border-emerald-200 text-emerald-800",
    badge: "bg-emerald-100 text-emerald-700",
  },
  delivered: {
    dot: "bg-green-500 border-green-500",
    card: "bg-green-50 border-green-200 text-green-800",
    badge: "bg-green-100 text-green-700",
  },
};

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
  const currentStageKey = mapStageKey(status, currentStage);
  const panelsValue = service?.panels ?? 1;

  const stageStates = useMemo(() => {
    return PAINT_STAGES.map((stage) => {
      if (stage.key === "on_hold") {
        return currentStageKey === "on_hold" ? "current" : "not_started";
      }
      if (currentStageKey === "on_hold") {
        return "not_started";
      }
      const currentProgressIndex = PAINT_STAGE_PROGRESS_ORDER.indexOf(currentStageKey);
      const stageProgressIndex = PAINT_STAGE_PROGRESS_ORDER.indexOf(stage.key);
      if (currentProgressIndex < 0 || stageProgressIndex < 0) return "not_started";
      if (stage.key === currentStageKey) return "current";
      if (stageProgressIndex < currentProgressIndex) return "done";
      return "not_started";
    });
  }, [currentStageKey]);

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
    if (!window.confirm("Are you sure you want to delete the painting service?")) return;
    setDeleteError(null);
    setDeleting(true);
    const res = await onDeleteService();
    setDeleting(false);
    if (res.success) {
      // no-op, refresh is handled upstream
      notifyPaintBoardRefresh();
    } else {
      setDeleteError(res.message || "Delete failed");
    }
  };

  if (!service && !isLoading) {
    return (
      <div className="py-8 text-center">
        <div className="text-sm text-[var(--ds-muted)]">No spray painting service yet</div> {onCreateService ? ( <Button className="mt-3" variant="primary" onClick={() => onCreateService("not_started")}> Create a spray painting service </Button> ) : null} </div> ); } return ( <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm font-semibold text-[var(--ds-text)]">Painting process</div> <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--ds-muted)] mt-4">
          {deleteError ? <div className="text-xs text-red-600">{deleteError}</div> : null} <span>Number of pieces</span> <Select value={String(panelsValue)} onChange={(event) => handlePanelsChange(event.target.value)} disabled={updatingPanels || isLoading || !onUpdatePanels} className="h-8 w-[90px]"> {Array.from({ length: 20 }, (_, i) => String(i + 1)).map((value) => ( <option key={value} value={value}> {value} pieces </option> ))} </Select> <Button leftIcon={<Trash2 className="h-4 w-4" />}
            className="border-red-300 text-red-700 hover:bg-red-50"onClick={handleDelete} disabled={isLoading || deleting} > Remove spray paint </Button> </div> </div> <div className="space-y-4">
        {PAINT_STAGES.map((stage, index) => {
          const state = stageStates[index];
          const isDone = state === "done";
          const isCurrent = state === "current";
          const currentTone = CURRENT_STAGE_TONE[stage.key];
          const dotClass = isDone
            ? "bg-emerald-500 border-emerald-500"
            : isCurrent
              ? currentTone.dot
              : "bg-white border-[rgba(0,0,0,0.25)]";
          const lineClass = isDone ? "bg-emerald-200" : "bg-[rgba(0,0,0,0.08)]";
          const cardClass = isDone
            ? "bg-emerald-50 border-emerald-200 text-emerald-800"
            : isCurrent
              ? currentTone.card
              : "bg-white border-[rgba(0,0,0,0.08)] text-[var(--ds-text)]";

          const badge =
            stage.key === "done" || stage.key === "delivered"
              ? "Finish"
              : isDone
                ? "Finish"
                : isCurrent
                  ? "in progress"
                  : "Not started";

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
                          ? currentTone.badge
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
