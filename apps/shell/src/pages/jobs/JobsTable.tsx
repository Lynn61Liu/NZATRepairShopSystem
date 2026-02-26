import { Link } from "react-router-dom";
import { Archive, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type React from "react";
import { StatusPill, ProgressRing, TagsCell } from "@/features/jobs/components";
import type { JobRow } from "@/types/JobType";
export type JobsTableProps = {
  rows: JobRow[];
  onToggleUrgent: (id: string) => void | Promise<void>;
  onArchive: (id: string) => void | Promise<void>;
  onDelete: (id: string) => void | Promise<void>;
  onUpdateCreatedAt: (id: string, date: string) => boolean | Promise<boolean>;
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
const MAX_MODEL_LINES = 3;

const JOB_TABLE_COLUMNS: Array<{
  key: string;
  label: string;
  width: number;
  minWidth: number;
}> = [
  { key: "urgent", label: "加急", width: 40, minWidth: 30 },
  { key: "inShop", label: "在店时间", width: 90, minWidth: 70 },
  { key: "status", label: "汽车状态", width: 110, minWidth: 90 },
  { key: "tag", label: "TAG", width: 90, minWidth: 70 },
  { key: "plate", label: "车牌号", width: 100, minWidth: 80 },
  { key: "model", label: "汽车型号", width: 140, minWidth: 150 },
  { key: "note", label: "备注", width: 250, minWidth: 280 },
  { key: "wof", label: "WOF", width: 70, minWidth: 60 },
  { key: "mech", label: "机修", width: 70, minWidth: 60 },
  { key: "paint", label: "喷漆", width: 70, minWidth: 60 },
  { key: "customer", label: "客户Code", width: 70, minWidth: 90 },
  { key: "phone", label: "客户电话", width: 110, minWidth: 90 },
  { key: "createdAt", label: "创建时间", width: 100, minWidth: 120 },
  { key: "actions", label: "操作", width: 80, minWidth: 60 },
];

function parseCreatedAt(value?: string) {
  if (!value) return null;
  const match = value.match(/(\d{4})[/-](\d{2})[/-](\d{2})(?:\s+(\d{2}):(\d{2}))?/);
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const hour = Number(match[4] ?? "0");
    const minute = Number(match[5] ?? "0");
    const date = new Date(year, month - 1, day, hour, minute);
    if (!Number.isNaN(date.getTime())) return date;
  }
  const fallback = new Date(value);
  return Number.isNaN(fallback.getTime()) ? null : fallback;
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

function formatDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getModelLines(value?: string) {
  const text = String(value ?? "").trim();
  if (!text) return { lines: ["—"], truncated: false };
  const parts = text.split(/\s+/).filter(Boolean);
  if (parts.length <= MAX_MODEL_LINES) {
    return { lines: parts, truncated: false };
  }
  return { lines: parts.slice(0, MAX_MODEL_LINES), truncated: true };
}

export function JobsTable({
  rows,
  onToggleUrgent,
  onArchive,
  onDelete,
  onUpdateCreatedAt,
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
    setEditDate(formatDateInput(parsed));
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
                <div className="flex justify-center">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-[var(--ds-primary)]"
                    checked={r.urgent}
                    onChange={() => onToggleUrgent(r.id)}
                  />
                </div>

                <div className={timeClass}>{timeInShop.label}</div>

                <div><StatusPill status={r.vehicleStatus} /></div>

                <div className="min-w-0"><TagsCell selectedTags={r.selectedTags} /></div>
                <div className="text-left font-medium text-[rgba(0,0,0,0.70)]">
                  <div className="h-10 overflow-hidden leading-5" style={TWO_LINE_CLAMP_STYLE}>
                    <Link
                      to={`/jobs/${r.id}`}
                      className="block text-[rgba(37,99,235,1)] font-semibold underline"
                    >
                      {r.plate}
                    </Link>
                  </div>
                </div>
                <div
                  className="min-w-0 text-left font-semibold text-[rgba(0,0,0,0.60)]"
                  title={r.vehicleModel || ""}
                >
                  <div className="h-[60px] overflow-hidden leading-5">
                    {(() => {
                      const { lines, truncated } = getModelLines(r.vehicleModel);
                      return lines.map((line, index) => (
                        <span key={`${line}-${index}`} className="block">
                          {index === lines.length - 1 && truncated ? `${line}…` : line}
                        </span>
                      ));
                    })()}
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

                <div className="flex justify-center"><ProgressRing value={r.wofPct} /></div>
                <div className="flex justify-center"><ProgressRing value={r.mechPct} /></div>
                <div className="flex justify-center"><ProgressRing value={r.paintPct} /></div>

                <div className="truncate">{r.customerCode || r.customerName}</div>
                <div>{r.customerPhone}</div>
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
                    (() => {
                      const parsed = parseCreatedAt(r.createdAt);
                      return parsed ? formatDateInput(parsed) : r.createdAt;
                    })()
                  )}
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
