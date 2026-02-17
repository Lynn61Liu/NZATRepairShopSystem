import { Link } from "react-router-dom";
import { Archive, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type React from "react";
import { StatusPill, ProgressRing, TagsCell } from "@/features/jobs/components";
import type { JobRow } from "@/types/JobType";
import { formatJobDisplayId } from "@/utils/jobId";


type Props = {
  rows: JobRow[];
  onToggleUrgent: (id: string) => void;
};

const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_DAY = 24 * MS_PER_HOUR;

const JOB_TABLE_COLUMNS = [
  { key: "urgent", label: "加急", width: 40, minWidth: 30 },
  { key: "inShop", label: "在店时间", width: 90, minWidth: 70 },
  { key: "status", label: "汽车状态", width: 110, minWidth: 90 },
  { key: "jobId", label: "JOB ID", width: 140, minWidth: 120 },
  { key: "tag", label: "TAG", width: 90, minWidth: 70 },
  { key: "plate", label: "车牌号", width: 100, minWidth: 80 },
  { key: "model", label: "汽车型号", width: 140, minWidth: 110 },
  { key: "wof", label: "WOF", width: 70, minWidth: 60 },
  { key: "mech", label: "机修", width: 70, minWidth: 60 },
  { key: "paint", label: "喷漆", width: 70, minWidth: 60 },
  { key: "customer", label: "客户Code", width: 110, minWidth: 90 },
  { key: "phone", label: "客户电话", width: 110, minWidth: 90 },
  { key: "createdAt", label: "创建时间", width: 150, minWidth: 120 },
  { key: "actions", label: "操作", width: 80, minWidth: 60 },
] as const;

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
  const days = Math.floor(diffMs / MS_PER_DAY);
  const label = days > 0 ? `${days}天` : "不到1天";
  const level = days >= 5 ? "danger" : days >= 3 ? "warn" : "normal";
  return { label, level };
}

export function JobsTable({ rows, onToggleUrgent}: Props) {
  const [colWidths, setColWidths] = useState(() => JOB_TABLE_COLUMNS.map((col) => col.width));
  const dragRef = useRef<{ index: number; startX: number; startWidth: number } | null>(null);

  const gridTemplateColumns = useMemo(
    () => colWidths.map((width) => `${width}px`).join(" "),
    [colWidths]
  );

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
        {rows.map((r) => {
        //   const isSelected = selectedIds.has(r.id);
          const timeInShop = getTimeInShop(r.createdAt);
          const timeClass =
            timeInShop.level === "danger"
              ? "text-red-600 font-semibold"
              : timeInShop.level === "warn"
                ? "text-amber-600 font-semibold"
                : "text-[rgba(0,0,0,0.60)]";
          return (
            <div key={r.id}>
              <div
                className={`grid gap-0 px-4 py-3 items-center border-b border-[rgba(0,0,0,0.06)] text-center
                  ${r.urgent ? "bg-[rgba(244,63,94,0.08)]" : "bg-white"}
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

                <div className="min-w-0">
                  <Link to={`/jobs/${r.id}`} className="text-[rgba(37,99,235,1)] font-semibold underline">
                    {formatJobDisplayId(r.id, r.createdAt)}
                  </Link>
                </div>

                <div className="min-w-0"><TagsCell selectedTags={r.selectedTags} /></div>
                <div className="font-medium text-[rgba(0,0,0,0.70)]">{r.plate}</div>
                <div className="min-w-0 text-[rgba(0,0,0,0.60)] truncate">{r.vehicleModel}</div>

                <div className="flex justify-center"><ProgressRing value={r.wofPct} /></div>
                <div className="flex justify-center"><ProgressRing value={r.mechPct} /></div>
                <div className="flex justify-center"><ProgressRing value={r.paintPct} /></div>

                <div className="truncate">{r.customerCode || r.customerName}</div>
                <div>{r.customerPhone}</div>
                <div>{r.createdAt}</div>

                <div className="flex justify-center gap-3">
                  <button className="text-[rgba(0,0,0,0.45)] hover:text-[rgba(0,0,0,0.70)]" title="Archive">
                    <Archive size={16} />
                  </button>
                  <button className="text-[rgba(239,68,68,1)] hover:opacity-80" title="Delete">
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
