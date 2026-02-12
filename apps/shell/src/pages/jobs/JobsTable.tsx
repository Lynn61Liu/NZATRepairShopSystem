import { Link } from "react-router-dom";
import { Archive, Trash2 } from "lucide-react";
import { StatusPill, ProgressRing, TagsCell } from "@/features/jobs/components";
import type { JobRow } from "@/types/JobType";
import { GRID_COLS } from "../../features/jobs/jobs.constants";


type Props = {
  rows: JobRow[];
  onToggleUrgent: (id: string) => void;
};

export function JobsTable({ rows, onToggleUrgent}: Props) {
  return (
    <div className="overflow-x-auto">
      <div className="min-w-full">
        {/* header */}
        <div
          className={`grid ${GRID_COLS} gap-0 justify-evenly px-4 py-3 text-[12px] font-semibold
            text-[rgba(0,0,0,0.55)] bg-[rgba(0,0,0,0.02)]
            border-b border-[rgba(0,0,0,0.06)]`}
        >
          <div>加急</div>
          <div>汽车状态</div>
          <div>JOB ID</div>
          <div>TAG</div>
          <div>车牌号</div>
          <div>汽车型号</div>
          <div className="text-center">WOF</div>
          <div className="text-center">机修</div>
          <div className="text-center">喷漆</div>
          <div>客户名字</div>
          <div className="hidden lg:block">客户电话</div>
          <div className="hidden 1440:block">创建时间</div>
          <div className="text-right pr-1">操作</div>
        </div>

        {/* rows */}
        {rows.map((r) => {
        //   const isSelected = selectedIds.has(r.id);
          return (
            <div key={r.id}>
              <div
                className={`grid ${GRID_COLS} gap-0 justify-evenly px-4 py-3 items-center border-b border-[rgba(0,0,0,0.06)]
                ${r.urgent ? "bg-[rgba(244,63,94,0.08)]" : "bg-white"}
                hover:bg-[rgba(0,0,0,0.02)]`}
              >
                <div>
                 <input
  type="checkbox"
  className="h-4 w-4 accent-[var(--ds-primary)]"
  checked={r.urgent}
  onChange={() => onToggleUrgent(r.id)}
/>

                </div>

                <div><StatusPill status={r.vehicleStatus} /></div>

                <div className="min-w-0">
                  <Link to={`/jobs/${r.id}`} className="text-[rgba(37,99,235,1)] font-semibold underline">
                    {r.id}
                  </Link>
                </div>

                <div className="min-w-0"><TagsCell selectedTags={r.selectedTags} /></div>
                <div className="font-medium text-[rgba(0,0,0,0.70)]">{r.plate}</div>
                <div className="min-w-0 text-[rgba(0,0,0,0.60)] truncate">{r.vehicleModel}</div>

                <div className="flex justify-center"><ProgressRing value={r.wofPct} /></div>
                <div className="flex justify-center"><ProgressRing value={r.mechPct} /></div>
                <div className="flex justify-center"><ProgressRing value={r.paintPct} /></div>

                <div className="truncate">{r.customerName}</div>
                <div className="hidden lg:block">{r.customerPhone}</div>
                <div className="hidden 1440:block">{r.createdAt}</div>

                <div className="flex justify-end gap-3 pr-1">
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
