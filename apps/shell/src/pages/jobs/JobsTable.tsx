import { Link } from "react-router-dom";
import { Archive, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type React from "react";
import { StatusPill, ProgressRing, TagsCell } from "@/features/jobs/components";
import { XeroButton, getXeroInvoiceUrl } from "@/components/common/XeroButton";
import { formatNzDate, formatNzDateTime, parseTimestamp } from "@/utils/date";
import type { JobRow } from "@/types/JobType";
export type JobsTableProps = {
  rows: JobRow[];
  onToggleUrgent: (id: string) => void | Promise<void>;
  onArchive: (id: string) => void | Promise<void>;
  onDelete: (id: string) => void | Promise<void>;
  onUpdateCreatedAt: (id: string, date: string) => boolean | Promise<boolean>;
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

const PAINT_STAGE_OPTIONS = [
  { value: -1, label: "等待处理" },
  { value: 0, label: "钣金/底漆" },
  { value: 1, label: "打底漆" },
  { value: 2, label: "底漆打磨" },
  { value: 3, label: "喷漆" },
  { value: 4, label: "组装抛光" },
  { value: 5, label: "完成喷漆" },
] as const;

function getPaintStageValue(row: JobRow) {
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

  const currentOption = PAINT_STAGE_OPTIONS.find((option) => option.value === currentValue) ?? PAINT_STAGE_OPTIONS[0];
  const tone =
    currentValue === 5
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : currentValue >= 0
        ? "border-indigo-200 bg-indigo-50 text-indigo-700"
        : "border-slate-200 bg-white text-slate-700";

  return (
    <select
      className={["h-8 min-w-[104px] rounded-[8px] border px-2 text-[11px] font-medium outline-none", tone].join(" ")}
      value={String(currentOption.value)}
      onChange={(e) => onChange(Number(e.target.value))}
    >
      {PAINT_STAGE_OPTIONS.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

const JOB_TABLE_COLUMNS: Array<{
  key: string;
  label: string;
  width: number;
  minWidth: number;
}> = [
  { key: "createdAt", label: "创建时间", width: 140, minWidth: 130 },
  { key: "inShop", label: "在店时间", width: 90, minWidth: 70 },
  { key: "status", label: "汽车状态", width: 110, minWidth: 90 },
  { key: "tag", label: "TAG", width: 90, minWidth: 70 },
  { key: "code", label: "code", width: 90, minWidth: 80 },
  { key: "plate", label: "车牌", width: 110, minWidth: 90 },
  { key: "model", label: "汽车型号", width: 180, minWidth: 160 },
  { key: "note", label: "备注", width: 250, minWidth: 280 },
  { key: "wof", label: "WOF", width: 70, minWidth: 60 },
  { key: "mech", label: "机修", width: 70, minWidth: 60 },
  { key: "paint", label: "喷漆", width: 70, minWidth: 60 },
  { key: "actions", label: "操作", width: 80, minWidth: 60 },
];

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
  onToggleUrgent,
  onArchive,
  onDelete,
  onUpdateCreatedAt,
  onUpdatePaintStatus,
  onPrintMech,
  onPrintPaint,
}: JobsTableProps) {
  const [colWidths, setColWidths] = useState(() => JOB_TABLE_COLUMNS.map((col) => col.width));
  const dragRef = useRef<{ index: number; startX: number; startWidth: number } | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDate, setEditDate] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);

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
    window.removeEventListener("pointerup", stopResize);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }, [handlePointerMove]);

  useEffect(() => () => stopResize(), [stopResize]);

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
      window.addEventListener("pointerup", stopResize);
    },
    [colWidths, handlePointerMove, stopResize]
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

  return (
    <div className="overflow-x-auto">
      <div className="min-w-full">
        {/* header */}
        <div
          className="grid gap-0 px-4 py-3 text-[12px] font-semibold text-[rgba(0,0,0,0.55)] bg-[rgba(0,0,0,0.02)] border-b border-[rgba(0,0,0,0.06)] select-none text-center"
          style={gridStyle}
        >
          {JOB_TABLE_COLUMNS.map((col, index) => {
            const isResizable = index < JOB_TABLE_COLUMNS.length - 1;
            return (
              <div key={col.key} className="relative text-center">
                {col.label}
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
        //   const isSelected = selectedIds.has(r.id);
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
          return (
            <div key={r.id}>
              <div
                className={`grid gap-0 px-4 py-3 items-center border-b border-[rgba(0,0,0,0.06)] text-center
                  ${rowBg}
                  hover:bg-[rgba(0,0,0,0.02)]`}
                style={gridStyle}
              >
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

                <div className="min-w-0 flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-[var(--ds-primary)]"
                    checked={r.urgent}
                    onChange={() => onToggleUrgent(r.id)}
                    title="加急"
                  />
                  <TagsCell selectedTags={r.selectedTags} />
                </div>

                <div className="truncate">{r.customerCode || r.customerName || "—"}</div>

                <div className="text-left font-medium text-[rgba(0,0,0,0.70)]">
                  <div className="flex items-center gap-2 h-6 overflow-hidden leading-5" style={ONE_LINE_CLAMP_STYLE}>
                    <Link
                      to={`/jobs/${r.id}`}
                      className="block text-[rgba(37,99,235,1)] font-semibold underline"
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
                <div className="min-w-0 text-left text-[rgba(0,0,0,0.45)]">
                  {r.notes ? (
                    <span className="relative inline-flex max-w-full align-middle group">
                      <span className="h-10 overflow-hidden leading-5" style={TWO_LINE_CLAMP_STYLE}>
                        {r.notes}
                      </span>
                      <span className="pointer-events-none absolute left-0 top-full z-50 mt-2 w-[260px] rounded-lg border border-[rgba(0,0,0,0.12)] bg-white px-3 py-2 text-xs text-[rgba(0,0,0,0.75)] shadow-lg opacity-0 translate-y-1 transition group-hover:opacity-100 group-hover:translate-y-0">
                        {r.notes}
                      </span>
                    </span>
                  ) : (
                    "—"
                  )}
                </div>

                <div className="flex justify-center"><WofStatusPill status={r.wofStatus} /></div>
                <div className="flex justify-center"><ProgressRing value={r.mechPct} /></div>
                <div className="flex justify-center">
                  <PaintStatusSelect row={r} onChange={onUpdatePaintStatus ? (stageIndex) => onUpdatePaintStatus(r.id, stageIndex) : undefined} />
                </div>

                <div className="flex justify-center gap-1 ">
                  <button
                    className="rounded border border-[rgba(0,0,0,0.12)] px-2 py-1 text-xs text-[rgba(0,0,0,0.65)] hover:bg-[rgba(0,0,0,0.04)]"
                    onClick={() => onPrintMech(r.id)}
                  >
                    机修
                  </button>
                  <button
                    className="rounded border border-[rgba(0,0,0,0.12)] px-2 py-1 text-xs text-[rgba(0,0,0,0.65)] hover:bg-[rgba(0,0,0,0.04)]"
                    onClick={() => onPrintPaint(r.id)}
                  >
                    喷漆
                  </button>
                  {r.externalInvoiceId ? (
                    <XeroButton
                      className="h-8 min-w-10 rounded-[8px] px-2"
                      label=""
                      onClick={() => window.open(getXeroInvoiceUrl(r.externalInvoiceId), "_blank", "noopener,noreferrer")}
                    />
                  ) : null}
                  <button
                    className="text-[rgba(0,0,0,0.45)] hover:text-[rgba(0,0,0,0.70)]"
                    title="Archive"
                    onClick={() => onArchive(r.id)}
                  >
                    <Archive size={16} />
                  </button>
                  <button
                    className="text-[rgba(239,68,68,1)] hover:opacity-80"
                    title="Delete"
                    onClick={() => onDelete(r.id)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
