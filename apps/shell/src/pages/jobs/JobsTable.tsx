import { Link } from "react-router-dom";
import { Archive, Lightbulb, SprayCan, Trash2, Wrench } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type React from "react";
import { StatusPill, TagsCell } from "@/features/jobs/components";
import { getXeroInvoiceUrl, XeroIcon } from "@/components/common/XeroButton";
import { GmailIcon } from "@/components/common/GmailSearchButton";
import { getGmailPlateSearchUrl } from "@/components/common/gmailSearch";
import { PAINT_STAGE_OPTIONS } from "@/features/paint/paintBoard.utils";
import { formatNzDate, formatNzDateTime, parseTimestamp } from "@/utils/date";
import type { JobRow } from "@/types/JobType";
import {
  createJobLightBinding,
  fetchJobLightBindings,
  lightOnJobLightBinding,
  type JobLightBindingResponse,
} from "@/features/jobDetail/api/jobDetailApi";
import {
  LIGHT_TAG_PATTERN,
  normalizeLightTagInput,
  selectCurrentLightBinding,
  shouldAutoCloseLightBindingDialog,
} from "@/features/jobDetail/lightBindingDialog";
import { requestJson } from "@/utils/api";
import {
  MECH_WORKFLOW_LABELS,
  MECH_WORKFLOW_ORDER,
  type MechWorkflowStatus,
} from "@/features/mechWorkflow";
import { JOB_TABLE_COLUMNS } from "./jobsTableLayout";
export type JobsTableProps = {
  rows: JobRow[];
  selectedIds?: Set<string>;
  onToggleSelected?: (id: string) => void;
  onToggleAllVisible?: (checked: boolean) => void;
  onArchive: (id: string) => void | Promise<void>;
  onDelete: (id: string) => void | Promise<void>;
  onUpdateCreatedAt: (id: string, date: string) => boolean | Promise<boolean>;
  onUpdateMechStatus?: (id: string, status: MechWorkflowStatus) => boolean | Promise<boolean>;
  onUpdatePaintStatus?: (id: string, stageIndex: number) => boolean | Promise<boolean>;
  onPrintMech: (id: string) => void | Promise<void>;
  onPrintPaint: (id: string) => void | Promise<void>;
};

const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_DAY = 24 * MS_PER_HOUR;
const TWO_LINE_CLAMP_STYLE = {
  display: "-webkit-box",
  WebkitBoxOrient: "vertical",
  WebkitLineClamp: 2,
  wordBreak: "break-word",
} as const;
const ONE_LINE_CLAMP_STYLE = {
  display: "-webkit-box",
  WebkitBoxOrient: "vertical",
  WebkitLineClamp: 1,
  wordBreak: "break-word",
} as const;
const ACTION_ICON_BUTTON_CLASS =
  "inline-flex h-7 w-7 items-center justify-center rounded-[8px] border border-transparent";

function WofStatusPill({ status }: { status?: JobRow["wofStatus"] }) {
  if (!status) {
    return <span className="text-xs text-[rgba(0,0,0,0.35)]">—</span>;
  }

  const config =
    status === "Recorded"
      ? {
          label: "已录入",
          bg: "bg-sky-50",
          bd: "border-sky-200",
          tx: "text-sky-700",
          dot: "bg-sky-500",
        }
      : status === "Checked"
        ? {
            label: "检查完成",
            bg: "bg-amber-50",
            bd: "border-amber-200",
            tx: "text-amber-700",
            dot: "bg-amber-500",
          }
        : {
            label: "待查",
            bg: "bg-white",
            bd: "border-slate-200",
            tx: "text-slate-700",
            dot: "bg-slate-400",
          };

  return (
    <span
      className={[
        "inline-flex items-center gap-2 rounded-[8px] border px-2 py-1 text-[11px] font-medium",
        config.bg,
        config.bd,
        config.tx,
      ].join(" ")}
    >
      <span className={["h-1.5 w-1.5 rounded-full", config.dot].join(" ")} />
      {config.label}
    </span>
  );
}

function XeroStatusCode({ status }: { status?: string | null }) {
  const normalized = status?.trim().toUpperCase();
  const config = normalized === "DRAFT"
    ? { code: "DF", title: "Draft", className: "border-slate-200 bg-slate-50 text-slate-600" }
    : normalized === "AUTHORISED"
      ? { code: "AP", title: "Awaiting Payment", className: "border-amber-200 bg-amber-50 text-amber-700" }
      : normalized === "PAID"
        ? { code: "PD", title: "Paid", className: "border-emerald-200 bg-emerald-50 text-emerald-700" }
        : null;

  if (!config) return <span className="text-xs text-[rgba(0,0,0,0.28)]">—</span>;
  return (
    <span
      className={`inline-flex rounded border px-1.5 py-0.5 text-[10px] font-bold ${config.className}`}
      title={config.title}
    >
      {config.code}
    </span>
  );
}

function getPaintStageValue(row: JobRow) {
  if (row.paintStatus === "delivered") return 6;
  if (row.paintStatus === "done") return 5;
  if (typeof row.paintCurrentStage !== "number") return null;
  return row.paintCurrentStage;
}

function PaintStatusSelect({
  row,
  onChange,
}: {
  row: JobRow;
  onChange?: (stageIndex: number) => boolean | Promise<boolean>;
}) {
  const currentValue = getPaintStageValue(row);
  if (currentValue === null || !onChange) {
    return <span className="text-xs text-[rgba(0,0,0,0.35)]">—</span>;
  }

  const currentOption = PAINT_STAGE_OPTIONS.find((option) => option.stageIndex === currentValue) ?? PAINT_STAGE_OPTIONS[0];
  const tone =
    currentValue === 6
      ? "border-green-200 bg-green-50 text-green-700"
      : currentValue === 5
        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
        : currentValue === -2
          ? "border-amber-200 bg-amber-50 text-amber-700"
          : currentValue >= 0
            ? "border-indigo-200 bg-indigo-50 text-indigo-700"
            : "border-slate-200 bg-white text-slate-700";

  return (
    <select
      className={["h-8 min-w-[104px] rounded-[8px] border px-2 text-[11px] font-medium outline-none", tone].join(" ")}
      value={String(currentOption.stageIndex)}
      onChange={(e) => onChange(Number(e.target.value))}
    >
      {PAINT_STAGE_OPTIONS.map((option) => (
        <option key={option.stageIndex} value={option.stageIndex}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function MechStatusSelect({
  row,
  disabled,
  onChange,
}: {
  row: JobRow;
  disabled?: boolean;
  onChange?: (status: MechWorkflowStatus) => boolean | Promise<boolean>;
}) {
  if (!row.mechStatus || !onChange) {
    return <span className="text-xs text-[rgba(0,0,0,0.35)]">—</span>;
  }

  return (
    <select
      className="h-8 w-[124px] rounded-[8px] border border-blue-200 bg-blue-50 px-2 text-[11px] font-medium text-blue-700 outline-none disabled:cursor-wait disabled:opacity-60"
      value={row.mechStatus}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value as MechWorkflowStatus)}
      title="修改机修流程状态"
    >
      {MECH_WORKFLOW_ORDER.map((status) => (
        <option key={status} value={status}>
          {MECH_WORKFLOW_LABELS[status]}
        </option>
      ))}
    </select>
  );
}

function parseCreatedAt(value?: string) {
  return parseTimestamp(value);
}

function getTimeInShop(createdAt?: string) {
  const created = parseCreatedAt(createdAt);
  if (!created) return { label: "—", level: "normal" as const };
  const now = Date.now();
  const diffMs = Math.max(0, now - created.getTime());
  if (diffMs < MS_PER_DAY) {
    const hours = Math.max(1, Math.floor(diffMs / MS_PER_HOUR));
    return { label: `${hours}小时`, level: "normal" as const };
  }
  const days = Math.floor(diffMs / MS_PER_DAY);
  const label = `${days}天`;
  const level = days >= 5 ? "danger" : days >= 3 ? "warn" : "normal";
  return { label, level };
}

function formatCreatedAtDisplay(value?: string) {
  const parsed = parseCreatedAt(value);
  if (!parsed) return value || "—";
  return formatNzDateTime(parsed).trim();
}

export function JobsTable({
  rows,
  selectedIds,
  onToggleSelected,
  onToggleAllVisible,
  onArchive,
  onDelete,
  onUpdateCreatedAt,
  onUpdateMechStatus,
  onUpdatePaintStatus,
  onPrintMech,
  onPrintPaint,
}: JobsTableProps) {
  const [colWidths, setColWidths] = useState(() => JOB_TABLE_COLUMNS.map((col) => col.width));
  const dragRef = useRef<{ index: number; startX: number; startWidth: number } | null>(null);
  const stopResizeRef = useRef<() => void>(() => {});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDate, setEditDate] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [savingMechId, setSavingMechId] = useState<string | null>(null);
  const [lightActionId, setLightActionId] = useState<string | null>(null);
  const [lightActionMessage, setLightActionMessage] = useState<{
    jobId: string;
    type: "success" | "error" | "info";
    text: string;
  } | null>(null);
  const [bindDialogRow, setBindDialogRow] = useState<JobRow | null>(null);
  const [bindingTagInput, setBindingTagInput] = useState("");
  const [bindingSubmitting, setBindingSubmitting] = useState(false);
  const [bindingError, setBindingError] = useState<string | null>(null);
  const [bindingResult, setBindingResult] = useState<JobLightBindingResponse | null>(null);
  const [lightBindingsByJobId, setLightBindingsByJobId] = useState<Record<string, JobLightBindingResponse | null>>({});
  const bindingInputRef = useRef<HTMLInputElement | null>(null);
  const rowIdsKey = useMemo(() => rows.map((row) => row.id).join("|"), [rows]);
  const selectedCount = useMemo(
    () => rows.filter((row) => selectedIds?.has(row.id)).length,
    [rows, selectedIds]
  );
  const allVisibleSelected = rows.length > 0 && selectedCount === rows.length;
  const someVisibleSelected = selectedCount > 0 && selectedCount < rows.length;
  const selectAllRef = useRef<HTMLInputElement | null>(null);

  const gridTemplateColumns = useMemo(() => {
    if (colWidths.length === 0) return "";
    return colWidths
      .map((width, index) =>
        index === colWidths.length - 1 ? `minmax(${width}px, 1fr)` : `${width}px`
      )
      .join(" ");
  }, [colWidths]);

  const gridStyle = useMemo(
    () => ({ gridTemplateColumns }),
    [gridTemplateColumns]
  );

  const handlePointerMove = useCallback((event: PointerEvent) => {
    const active = dragRef.current;
    if (!active) return;
    const delta = event.clientX - active.startX;
    setColWidths((prev) => {
      const next = [...prev];
      const minWidth = JOB_TABLE_COLUMNS[active.index]?.minWidth ?? 40;
      next[active.index] = Math.max(minWidth, active.startWidth + delta);
      return next;
    });
  }, []);

  const stopResize = useCallback(() => {
    dragRef.current = null;
    window.removeEventListener("pointermove", handlePointerMove);
    window.removeEventListener("pointerup", stopResizeRef.current);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }, [handlePointerMove]);

  useEffect(() => {
    stopResizeRef.current = stopResize;
  }, [stopResize]);

  useEffect(() => () => stopResizeRef.current(), []);

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someVisibleSelected;
    }
  }, [someVisibleSelected]);

  useEffect(() => {
    if (!bindDialogRow) return;
    const timer = window.setTimeout(() => bindingInputRef.current?.focus(), 50);
    return () => window.clearTimeout(timer);
  }, [bindDialogRow]);

  useEffect(() => {
    let cancelled = false;

    const loadLightBindingStates = async () => {
      if (rows.length === 0) {
        if (!cancelled) setLightBindingsByJobId({});
        return;
      }

      const res = await requestJson<JobLightBindingResponse[]>("/api/estation/light-bindings", { cache: "no-store" });
      if (!res.ok || !res.data || cancelled) return;

      const visibleJobIds = new Set(rows.map((row) => row.id));
      const grouped = new Map<string, JobLightBindingResponse[]>();
      res.data.forEach((binding) => {
        if (binding.jobId === null || binding.jobId === undefined) return;
        const jobId = String(binding.jobId);
        if (!visibleJobIds.has(jobId)) return;
        grouped.set(jobId, [...(grouped.get(jobId) ?? []), binding]);
      });

      const next: Record<string, JobLightBindingResponse | null> = {};
      rows.forEach((row) => {
        next[row.id] = selectCurrentLightBinding(grouped.get(row.id));
      });
      setLightBindingsByJobId(next);
    };

    void loadLightBindingStates();

    return () => {
      cancelled = true;
    };
  }, [rowIdsKey, rows]);

  const startResize = useCallback(
    (index: number) => (event: React.PointerEvent<HTMLSpanElement>) => {
      event.preventDefault();
      dragRef.current = {
        index,
        startX: event.clientX,
        startWidth: colWidths[index],
      };
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", stopResizeRef.current);
    },
    [colWidths, handlePointerMove]
  );

  const startEditCreatedAt = (row: JobRow) => {
    const parsed = parseCreatedAt(row.createdAt);
    if (!parsed) return;
    setEditingId(row.id);
    const nzDate = formatNzDate(parsed);
    if (nzDate && nzDate !== "—") {
      setEditDate(nzDate);
    }
  };

  const cancelEditCreatedAt = () => {
    setEditingId(null);
    setEditDate("");
    setSavingId(null);
  };

  const saveCreatedAt = async () => {
    if (!editingId || !editDate) return;
    setSavingId(editingId);
    const ok = await onUpdateCreatedAt(editingId, editDate);
    setSavingId(null);
    if (ok !== false) {
      cancelEditCreatedAt();
    }
  };

  const updateMechStatus = async (row: JobRow, status: MechWorkflowStatus) => {
    if (!onUpdateMechStatus || savingMechId) return false;
    setSavingMechId(row.id);
    const ok = await onUpdateMechStatus(row.id, status);
    setSavingMechId(null);
    return ok;
  };

  const openBindDialog = (row: JobRow) => {
    setBindingTagInput("");
    setBindingError(null);
    setBindingResult(null);
    setBindDialogRow(row);
  };

  const closeBindDialog = () => {
    if (bindingSubmitting) return;
    setBindDialogRow(null);
  };

  const waitForBindingResult = async (jobId: string, bindingId: number) => {
    for (let attempt = 0; attempt < 16; attempt += 1) {
      await new Promise((resolve) => window.setTimeout(resolve, 2000));
      const res = await fetchJobLightBindings(jobId);
      if (!res.ok || !res.data) continue;

      const binding = res.data.find((item) => item.id === bindingId);
      if (!binding) continue;

      setBindingResult(binding);
      if (binding.status === "Bound") return binding;
      if (binding.status === "BindFailed") {
        setBindingError(binding.failureReason || "绑定失败");
        return binding;
      }
    }

    setBindingError("绑定指令已发送，但暂未收到基站确认");
    return null;
  };

  const submitLightBinding = async () => {
    if (!bindDialogRow) return;

    const tagId = normalizeLightTagInput(bindingTagInput);
    setBindingTagInput(tagId);
    setBindingError(null);
    setBindingResult(null);

    if (!LIGHT_TAG_PATTERN.test(tagId)) {
      setBindingError("灯条码格式不正确");
      return;
    }

    setBindingSubmitting(true);
    const res = await createJobLightBinding(bindDialogRow.id, tagId);
    if (!res.ok || !res.data) {
      setBindingSubmitting(false);
      setBindingError(res.error || "绑定失败");
      return;
    }

    const jobId = bindDialogRow.id;
    setBindingResult(res.data);
    const finalBinding = await waitForBindingResult(jobId, res.data.id);
    setBindingSubmitting(false);
    setLightBindingsByJobId((prev) => ({ ...prev, [jobId]: finalBinding ?? res.data }));

    if (shouldAutoCloseLightBindingDialog(true, finalBinding?.status)) {
      setLightActionMessage({ jobId, type: "success", text: "灯条已绑定" });
      setBindDialogRow(null);
    }
  };

  const handleLightAction = async (row: JobRow) => {
    setLightActionId(row.id);
    setLightActionMessage(null);

    const bindingsRes = await fetchJobLightBindings(row.id);
    if (!bindingsRes.ok || !bindingsRes.data) {
      setLightActionId(null);
      setLightActionMessage({ jobId: row.id, type: "error", text: bindingsRes.error || "读取灯条绑定失败" });
      return;
    }

    const currentBinding = selectCurrentLightBinding(bindingsRes.data);
    setLightBindingsByJobId((prev) => ({ ...prev, [row.id]: currentBinding }));
    if (!currentBinding) {
      setLightActionId(null);
      openBindDialog(row);
      return;
    }

    if (currentBinding.status !== "Bound") {
      setLightActionId(null);
      setLightActionMessage({ jobId: row.id, type: "info", text: `灯条状态：${currentBinding.status}` });
      return;
    }

    const lightRes = await lightOnJobLightBinding(currentBinding.id);
    setLightActionId(null);
    if (!lightRes.ok) {
      setLightActionMessage({ jobId: row.id, type: "error", text: lightRes.error || "点亮失败" });
      return;
    }

    if (lightRes.data) {
      setLightBindingsByJobId((prev) => ({ ...prev, [row.id]: lightRes.data }));
    }
    setLightActionMessage({ jobId: row.id, type: "success", text: "点亮命令已发送" });
  };

  return (
    <>
    <div className="overflow-x-auto">
      <div className="min-w-full">
        {/* header */}
        <div
          className="grid gap-0 px-4 py-3 text-[12px] font-semibold text-[rgba(0,0,0,0.55)] bg-[rgba(0,0,0,0.02)] border-b border-[rgba(0,0,0,0.06)] select-none text-center"
          style={gridStyle}
        >
          {JOB_TABLE_COLUMNS.map((col, index) => {
            const isResizable = index < JOB_TABLE_COLUMNS.length - 1;
            const alignClass = col.key === "code" || col.key === "actions" ? "text-left" : "text-center";
            return (
              <div key={col.key} className={`relative ${alignClass}`}>
                {col.key === "select" ? (
                  <input
                    ref={selectAllRef}
                    type="checkbox"
                    className="h-4 w-4 accent-[var(--ds-primary)]"
                    checked={allVisibleSelected}
                    onChange={(event) => onToggleAllVisible?.(event.target.checked)}
                    title="选择当前页"
                  />
                ) : (
                  col.label
                )}
                {isResizable ? (
                  <span
                    className="absolute right-0 top-0 h-full w-0.5 bg-slate-200 cursor-col-resize touch-none hover:bg-slate-400"
                    onPointerDown={startResize(index)}
                  />
                ) : null}
              </div>
            );
          })}
        </div>

        {/* rows */}
        {rows.map((r, index) => {
          const isSelected = selectedIds?.has(r.id) ?? false;
          const mergedNotes = [r.notes, r.privateNotes]
            .map((value) => value?.trim())
            .filter(Boolean)
            .join("\n");
          const timeInShop = getTimeInShop(r.createdAt);
          const timeClass =
            timeInShop.level === "danger"
              ? "text-red-600 font-semibold"
              : timeInShop.level === "warn"
                ? "text-amber-600 font-semibold"
                : "text-[rgba(0,0,0,0.60)]";
          const rowBg = r.urgent
            ? "bg-[rgba(244,63,94,0.08)]"
            : index % 2 === 1
              ? "bg-[rgba(0,0,0,0.02)]"
              : "bg-white";
          const lightBinding = lightBindingsByJobId[r.id] ?? null;
          const lightActionLabel = lightActionId === r.id
            ? "处理中"
            : lightBinding?.status === "Bound"
              ? "点亮灯条"
              : "绑定灯条";
          const lightActionClassName = [
            ACTION_ICON_BUTTON_CLASS,
            "disabled:cursor-not-allowed disabled:opacity-60",
            lightActionId === r.id
              ? "border-slate-200 bg-slate-50 text-slate-500"
              : lightBinding?.status === "Bound"
                ? "border-amber-300 bg-amber-100 text-amber-800 hover:bg-amber-200"
                : "border-[rgba(37,99,235,0.25)] bg-white text-[rgba(37,99,235,1)] hover:bg-[rgba(37,99,235,0.06)]",
          ].join(" ");
          return (
            <div
              key={r.id}
              className={`${rowBg} border-b border-[rgba(0,0,0,0.06)] hover:bg-sky-50`}
            >
              <div
                className="grid gap-0 px-4 pb-2 pt-3 items-center text-center"
                style={gridStyle}
              >
                <div>
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-[var(--ds-primary)]"
                    checked={isSelected}
                    onChange={() => onToggleSelected?.(r.id)}
                    title="选择工单"
                  />
                </div>
                <div
                  onDoubleClick={() => startEditCreatedAt(r)}
                  className="cursor-pointer"
                >
                  {editingId === r.id ? (
                    <input
                      type="date"
                      className="h-8 w-full rounded border border-[var(--ds-border)] px-2 text-sm text-slate-700"
                      value={editDate}
                      onChange={(event) => setEditDate(event.target.value)}
                      onBlur={() => void saveCreatedAt()}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          void saveCreatedAt();
                        }
                        if (event.key === "Escape") {
                          event.preventDefault();
                          cancelEditCreatedAt();
                        }
                      }}
                      disabled={savingId === r.id}
                      autoFocus
                    />
                  ) : (
                    formatCreatedAtDisplay(r.createdAt)
                  )}
                </div>

                <div className={timeClass}>{timeInShop.label}</div>

                <div><StatusPill status={r.vehicleStatus} /></div>

                <div className="min-w-0 flex items-center">
                  <TagsCell selectedTags={r.selectedTags} />
                </div>

                <div className="flex min-w-0 items-center gap-1 truncate text-left">
                  <span className="truncate">{r.customerCode || r.customerName || "—"}</span>
                  {r.poNumber ? (
                    <button
                      type="button"
                      className="shrink-0 cursor-help text-sm"
                      title={`PO# ${r.poNumber}`}
                      onClick={() => window.alert(`PO# ${r.poNumber}`)}
                    >
                      🙂
                    </button>
                  ) : null}
                </div>

                <div className="min-w-0 text-left font-medium text-[rgba(0,0,0,0.70)]">
                  <div className="flex items-center gap-2 leading-5">
                    <Link
                      to={`/jobs/${r.id}`}
                      className="block break-all text-[rgba(37,99,235,1)] font-semibold underline"
                    >
                      {r.plate}
                    </Link>
                    {(r.poUnreadReplyCount ?? 0) > 0 ? (
                      <span className="inline-flex shrink-0 items-center rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-600">
                        PO {r.poUnreadReplyCount}
                      </span>
                    ) : null}
                  </div>
                </div>

                <div
                  className="min-w-0 text-left font-semibold text-[rgba(0,0,0,0.60)]"
                  title={r.vehicleModel || ""}
                >
                  <div className="h-6 overflow-hidden leading-5" style={ONE_LINE_CLAMP_STYLE}>
                    {r.vehicleModel || "—"}
                  </div>
                </div>

                <div className="flex items-center justify-center">
                  <WofStatusPill status={r.wofStatus} />
                </div>

                <div className="flex items-center justify-center">
                  <MechStatusSelect
                    row={r}
                    disabled={savingMechId === r.id}
                    onChange={onUpdateMechStatus ? (status) => updateMechStatus(r, status) : undefined}
                  />
                </div>

                <div className="flex items-center justify-center">
                  <PaintStatusSelect row={r} onChange={onUpdatePaintStatus ? (stageIndex) => onUpdatePaintStatus(r.id, stageIndex) : undefined} />
                </div>

                <div className="flex min-w-0 items-start">
                  <div className="min-w-0 flex-1 text-left text-[rgba(0,0,0,0.50)]">
                    {mergedNotes ? (
                      <span className="relative inline-flex max-w-full align-middle group">
                        <span className="h-10 whitespace-pre-wrap overflow-hidden leading-5" style={TWO_LINE_CLAMP_STYLE}>
                          {mergedNotes}
                        </span>
                        <span className="pointer-events-none absolute left-0 top-full z-50 mt-2 w-[320px] whitespace-pre-wrap rounded-lg border border-[rgba(0,0,0,0.12)] bg-white px-3 py-2 text-xs text-[rgba(0,0,0,0.75)] shadow-lg opacity-0 translate-y-1 transition group-hover:opacity-100 group-hover:translate-y-0">
                          {mergedNotes}
                        </span>
                      </span>
                    ) : (
                      "—"
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-center">
                  <XeroStatusCode status={r.xeroStatus} />
                </div>

                <div className="flex flex-wrap justify-start gap-1.5">
                  <button
                    className={lightActionClassName}
                    title={lightActionLabel}
                    onClick={() => void handleLightAction(r)}
                    disabled={lightActionId === r.id}
                  >
                    <Lightbulb size={14} />
                  </button>
                  <button
                    className={`${ACTION_ICON_BUTTON_CLASS} border-[rgba(0,0,0,0.12)] text-[rgba(0,0,0,0.65)] hover:bg-[rgba(0,0,0,0.04)]`}
                    title="机修打印"
                    onClick={() => onPrintMech(r.id)}
                  >
                    <Wrench size={16} />
                  </button>
                  <button
                    className={`${ACTION_ICON_BUTTON_CLASS} border-[rgba(0,0,0,0.12)] text-[rgba(0,0,0,0.65)] hover:bg-[rgba(0,0,0,0.04)]`}
                    title="喷漆打印"
                    onClick={() => onPrintPaint(r.id)}
                  >
                    <SprayCan size={16} />
                  </button>
                  {r.externalInvoiceId ? (
                    <button
                      className="inline-flex h-7 w-7 items-center justify-center rounded-[8px] border border-[#13B5EA]/25 bg-white text-[#13B5EA] hover:bg-[#13B5EA]/[0.06]"
                      title="Open Xero"
                      onClick={() => window.open(getXeroInvoiceUrl(r.externalInvoiceId), "_blank", "noopener,noreferrer")}
                    >
                      <XeroIcon className="h-4 w-4" />
                    </button>
                  ) : null}
                  {getGmailPlateSearchUrl(r.plate) ? (
                    <a
                      className="inline-flex h-7 w-7 items-center justify-center rounded-[8px] border border-red-200 bg-white text-red-600 hover:bg-red-50"
                      title={`在 Gmail 搜索 ${r.plate}`}
                      href={getGmailPlateSearchUrl(r.plate)}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <GmailIcon className="h-4 w-4" />
                    </a>
                  ) : null}
                  <button
                    className={`${ACTION_ICON_BUTTON_CLASS} text-[rgba(0,0,0,0.45)] hover:bg-[rgba(0,0,0,0.04)] hover:text-[rgba(0,0,0,0.70)]`}
                    title="Archive"
                    onClick={() => onArchive(r.id)}
                  >
                    <Archive size={16} />
                  </button>
                  <button
                    className={`${ACTION_ICON_BUTTON_CLASS} text-[rgba(239,68,68,1)] hover:bg-red-50 hover:opacity-80`}
                    title="Delete"
                    onClick={() => onDelete(r.id)}
                  >
                    <Trash2 size={16} />
                  </button>
                  {lightActionMessage?.jobId === r.id ? (
                    <div
                      className={[
                        "basis-full text-[11px]",
                        lightActionMessage.type === "error"
                          ? "text-red-600"
                          : lightActionMessage.type === "success"
                            ? "text-green-600"
                            : "text-[rgba(0,0,0,0.50)]",
                      ].join(" ")}
                    >
                      {lightActionMessage.text}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
    {bindDialogRow ? (
      <div
        className="fixed inset-0 z-[90] flex items-center justify-center bg-black/35 px-4"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) closeBindDialog();
        }}
      >
        <form
          className="w-full max-w-[420px] rounded-[8px] border border-[rgba(0,0,0,0.12)] bg-white p-5 shadow-xl"
          onSubmit={(event) => {
            event.preventDefault();
            void submitLightBinding();
          }}
        >
          <div className="text-lg font-semibold text-[var(--ds-text)]">绑定灯条</div>
          <div className="mt-4 space-y-4">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-[rgba(0,0,0,0.62)]">车牌号</span>
              <input
                value={bindDialogRow.plate || "—"}
                readOnly
                className="h-10 w-full rounded-[8px] border border-[var(--ds-border)] bg-[rgba(0,0,0,0.03)] px-3 text-sm font-semibold text-[var(--ds-text)] outline-none"
              />
            </label>
            <label className="block">
              <input
                ref={bindingInputRef}
                value={bindingTagInput}
                onChange={(event) => {
                  setBindingTagInput(normalizeLightTagInput(event.target.value));
                  setBindingError(null);
                }}
                placeholder="扫描或输入灯条码"
                disabled={bindingSubmitting}
                className="h-10 w-full rounded-[8px] border border-[var(--ds-border)] px-3 text-sm text-[var(--ds-text)] outline-none focus:border-[var(--ds-primary)] disabled:bg-[rgba(0,0,0,0.04)]"
              />
            </label>
          </div>

          {bindingResult ? (
            <div className="mt-4 rounded-[8px] border border-[rgba(0,0,0,0.08)] bg-[rgba(0,0,0,0.025)] px-3 py-2 text-sm text-[var(--ds-text)]">
              <div>状态：{bindingResult.status}</div>
              <div>灯条码：{bindingResult.tagId}</div>
              <div>基站：{bindingResult.stationId}</div>
              <div>Group：{bindingResult.groupNo}</div>
            </div>
          ) : null}

          {bindingError ? <div className="mt-3 text-sm text-red-600">{bindingError}</div> : null}
          {bindingSubmitting && !bindingError ? (
            <div className="mt-3 text-sm text-[rgba(0,0,0,0.62)]">绑定指令已发送，等待基站确认...</div>
          ) : null}

          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              className="h-9 rounded-[8px] border border-[var(--ds-border)] px-3 text-sm text-[var(--ds-text)] hover:bg-[rgba(0,0,0,0.04)] disabled:opacity-60"
              onClick={closeBindDialog}
              disabled={bindingSubmitting}
            >
              取消
            </button>
            <button
              type="submit"
              className="h-9 rounded-[8px] border border-[var(--ds-primary)] bg-[var(--ds-primary)] px-3 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
              disabled={bindingSubmitting}
            >
              {bindingSubmitting ? "确认中..." : "确认"}
            </button>
          </div>
        </form>
      </div>
    ) : null}
    </>
  );
}
