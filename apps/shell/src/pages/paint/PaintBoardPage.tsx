import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AlertCircle } from "lucide-react";
import { Input, Select } from "@/components/ui";
import { notifyPaintBoardRefresh } from "@/utils/refreshSignals";
import { fetchPaintBoard, updatePaintStage } from "@/features/paint/api/paintApi";
import {
  addDays,
  buildDays,
  countOverdue,
  diffDays,
  getDurationDays,
  mapStageKey,
  normalizeDate,
  PAINT_STAGE_INDEX_BY_KEY,
  PAINT_STAGE_LABELS,
  PAINT_STAGE_ORDER,
  type PaintBoardJob,
  type StageKey,
} from "@/features/paint/paintBoard.utils";

const STAGES: Record<
  StageKey,
  {
    label: string;
    dot: string;
    pill: string;
    bar: string;
    barSoft: string;
    text: string;
  }
> = {
  on_hold: {
    label: PAINT_STAGE_LABELS.on_hold,
    dot: "bg-amber-500",
    pill: "bg-amber-100 text-amber-700",
    bar: "bg-amber-500",
    barSoft: "bg-amber-100",
    text: "text-amber-700",
  },
  waiting: {
    label: PAINT_STAGE_LABELS.waiting,
    dot: "bg-slate-400",
    pill: "bg-slate-100 text-slate-700",
    bar: "bg-slate-300",
    barSoft: "bg-slate-100",
    text: "text-slate-700",
  },
  sheet: {
    label: PAINT_STAGE_LABELS.sheet,
    dot: "bg-sky-500",
    pill: "bg-sky-100 text-sky-700",
    bar: "bg-sky-500",
    barSoft: "bg-sky-100",
    text: "text-sky-700",
  },
  undercoat: {
    label: PAINT_STAGE_LABELS.undercoat,
    dot: "bg-amber-500",
    pill: "bg-amber-100 text-amber-700",
    bar: "bg-amber-500",
    barSoft: "bg-amber-100",
    text: "text-amber-700",
  },
  sanding: {
    label: PAINT_STAGE_LABELS.sanding,
    dot: "bg-fuchsia-500",
    pill: "bg-fuchsia-100 text-fuchsia-700",
    bar: "bg-fuchsia-500",
    barSoft: "bg-fuchsia-100",
    text: "text-fuchsia-700",
  },
  painting: {
    label: PAINT_STAGE_LABELS.painting,
    dot: "bg-rose-500",
    pill: "bg-rose-100 text-rose-700",
    bar: "bg-rose-500",
    barSoft: "bg-rose-100",
    text: "text-rose-700",
  },
  assembly: {
    label: PAINT_STAGE_LABELS.assembly,
    dot: "bg-teal-500",
    pill: "bg-teal-100 text-teal-700",
    bar: "bg-teal-500",
    barSoft: "bg-teal-100",
    text: "text-teal-700",
  },
  done: {
    label: PAINT_STAGE_LABELS.done,
    dot: "bg-emerald-500",
    pill: "bg-emerald-100 text-emerald-700",
    bar: "bg-emerald-500",
    barSoft: "bg-emerald-100",
    text: "text-emerald-700",
  },
  delivered: {
    label: PAINT_STAGE_LABELS.delivered,
    dot: "bg-green-500",
    pill: "bg-green-100 text-green-700",
    bar: "bg-green-500",
    barSoft: "bg-green-100",
    text: "text-green-700",
  },
};

const STAGE_PROGRESS: Record<StageKey, number> = {
  on_hold: 0.06,
  waiting: 0.12,
  sheet: 0.28,
  undercoat: 0.44,
  sanding: 0.58,
  painting: 0.72,
  assembly: 0.88,
  done: 0.96,
  delivered: 1,
};

const TIMELINE_DAYS = 7;
const FUTURE_BUFFER_DAYS = 3;
const LEFT_COLUMN_WIDTH = 320;
const BOARD_MAX_HEIGHT = "calc(100dvh - 8.5rem)";

export function PaintBoardPage() {
  const navigate = useNavigate();
  const tableViewportRef = useRef<HTMLDivElement | null>(null);
  const [jobs, setJobs] = useState<PaintBoardJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedStage, setSelectedStage] = useState<"all" | StageKey>("all");
  const [overdueOnly, setOverdueOnly] = useState(false);
  const [createdFrom, setCreatedFrom] = useState("");
  const [createdTo, setCreatedTo] = useState("");
  const [timelineWidth, setTimelineWidth] = useState(960);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setLoadError(null);
      const res = await fetchPaintBoard();
      if (!res.ok) {
        if (!cancelled) setLoadError(res.error || "Loading failed");
        setLoading(false);
        return;
      }
      const list = Array.isArray(res.data?.jobs) ? res.data.jobs : [];
      if (!cancelled) setJobs(list);
      setLoading(false);
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const today = normalizeDate(new Date());
  const filteredJobs = useMemo(() => {
    const fromDate = createdFrom ? normalizeDate(createdFrom) : null;
    const toDate = createdTo ? normalizeDate(createdTo) : null;
    return jobs.filter((job) => {
      const stageKey = mapStageKey(job.status, job.currentStage);
      if (selectedStage !== "all" && stageKey !== selectedStage) return false;
      if (overdueOnly && getDurationDays(job.createdAt, today) <= 3) return false;
      const createdAt = normalizeDate(job.createdAt);
      if (fromDate && createdAt < fromDate) return false;
      if (toDate && createdAt > toDate) return false;
      return true;
    });
  }, [jobs, selectedStage, overdueOnly, createdFrom, createdTo, today]);

  const timelineStart = addDays(today, -(TIMELINE_DAYS - FUTURE_BUFFER_DAYS - 1));
  const days = buildDays(timelineStart, TIMELINE_DAYS);
  const todayIndex = Math.max(0, Math.min(TIMELINE_DAYS - 1, diffDays(today, timelineStart)));
  const dayWidth = timelineWidth / TIMELINE_DAYS;
  const todayLeft = todayIndex * dayWidth;
  const overdueCount = countOverdue(filteredJobs, today);
  const stageOrder: Record<StageKey, number> = PAINT_STAGE_ORDER.reduce(
    (acc, stage, index) => {
      acc[stage] = index;
      return acc;
    },
    {} as Record<StageKey, number>
  );
  const sortedJobs = useMemo(() => {
    const copy = [...filteredJobs];
    return copy.sort((a, b) => {
      const stageA = mapStageKey(a.status, a.currentStage);
      const stageB = mapStageKey(b.status, b.currentStage);
      const stageDiff = stageOrder[stageA] - stageOrder[stageB];
      if (stageDiff !== 0) return stageDiff;
      const startDiff = normalizeDate(a.createdAt).getTime() - normalizeDate(b.createdAt).getTime();
      if (startDiff !== 0) return startDiff;
      return a.plate.localeCompare(b.plate);
    });
  }, [filteredJobs]);

  useEffect(() => {
    const viewport = tableViewportRef.current;
    if (!viewport) return;

    const updateTimelineWidth = () => {
      const next = Math.max(480, viewport.clientWidth - LEFT_COLUMN_WIDTH);
      setTimelineWidth(next);
    };

    updateTimelineWidth();
    const observer = new ResizeObserver(updateTimelineWidth);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  const handleRowClick = (id: string) => {
    navigate(`/jobs/${id}`); }; const handleStageChange = async (jobId: string, nextStage: StageKey) => { const stageIndex = PAINT_STAGE_INDEX_BY_KEY[nextStage]; await updatePaintStage(jobId, stageIndex); const res = await fetchPaintBoard(); if (res.ok) { const list = Array.isArray(res.data?.jobs) ? res.data.jobs : []; setJobs(list); } notifyPaintBoardRefresh(); }; const handleResetFilters = () => { setSelectedStage("all"); setOverdueOnly(false); setCreatedFrom(""); setCreatedTo(""); }; return ( <div className="flex h-full min-h-0 flex-col gap-5" style={{ fontFamily: '"Manrope","Plus Jakarta Sans","Space Grotesk","Segoe UI",sans-serif', }} > <div className="flex flex-wrap items-center justify-between gap-3"> <div className="flex flex-wrap items-center gap-2"> {/*<div className="text-xl font-semibold text-slate-800 ml-2 mr-4">Filter</div>*/} <div><Select value={selectedStage} onChange={(event) => setSelectedStage(event.target.value as "all" | StageKey)} className="h-9 w-[140px]" > <option value="all">All stages</option> {Object.entries(STAGES).map(([key, stage]) => ( <option key={key} value={key}> {stage.label} </option> ))} </Select></div> <label className="flex items-center gap-2 rounded-xl border border-[rgba(15,23,42,0.08)] bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm"> <input type="checkbox" checked={overdueOnly} onChange={(event) => setOverdueOnly(event.target.checked)} className="h-4 w-4 accent-blue-600" /> Only overdue </label> <div> <Input type="date" value={createdFrom} onChange={(event) => setCreatedFrom(event.target.value)} className="h-9 w-[150px]" /> </div> <span className="text-xs text-slate-400">to</span> <div> <Input type="date" value={createdTo} onChange={(event) => setCreatedTo(event.target.value)} className="h-9 w-[150px]" /> </div> <button type="button" className="rounded-xl border border-[rgba(15,23,42,0.08)] bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm hover:text-slate-800" onClick={handleResetFilters} > reset </button> </div> </div> <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border border-[rgba(15,23,42,0.08)] bg-white/90 shadow-sm" style={{ maxHeight: BOARD_MAX_HEIGHT }} > <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[rgba(15,23,42,0.06)] px-6 py-4"> <div className="flex items-center gap-3"> <div className="text-xl font-semibold text-slate-800">Paint Status Timeline</div> <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-600"> {overdueCount} overdue </span> </div> <div className="flex flex-wrap items-center gap-4 text-xs font-semibold text-slate-500"> {Object.values(STAGES).map((stage) => ( <span key={stage.label} className="flex items-center gap-2"> <span className={`h-2.5 w-2.5 rounded-full ${stage.dot}`} /> {stage.label} </span> ))} </div> </div> <div ref={tableViewportRef} className="paint-board-scroll min-h-0 flex-1 overflow-y-scroll overflow-x-hidden"> {loading ? ( <div className="p-6 text-sm text-[var(--ds-muted)]">Loading...</div> ) : loadError ? ( <div className="p-6 text-sm text-red-600">{loadError}</div> ) : sortedJobs.length === 0 ? ( <div className="p-6 text-sm text-[var(--ds-muted)]">No painting data</div> ) : null} <div className="grid w-full" style={{ gridTemplateColumns:`${LEFT_COLUMN_WIDTH}px minmax(0,1fr)` }}
          >
            <div className="border-b border-[rgba(15,23,42,0.06)] bg-slate-50 px-6 py-4 text-xs font-semibold tracking-[0.12em] text-slate-400">
              VEHICLE DETAILS
            </div>
            <div className="relative border-b border-[rgba(15,23,42,0.06)]">
              <div className="flex items-center" style={{ width: timelineWidth }}>
                {days.map((item, index) => {
                  const isToday = index === todayIndex;
                  return (
                    <div
                      key={`${item.label}-${item.day}`}
                      className="flex h-16 flex-col items-center justify-center border-l border-[rgba(15,23,42,0.06)] text-xs font-semibold text-slate-500"
                      style={{ width: dayWidth }}
                    >
                      <span className="uppercase">{item.label}</span>
                      <span
                        className={[
                          "mt-1 flex h-7 w-7 items-center justify-center rounded-full text-sm",
                          isToday ? "bg-blue-600 text-white shadow-md" : "text-slate-800",
                        ].join(" ")}
                      >
                          {item.day}
                        </span>
                      </div>
                    );
                  })}
              </div>
              <div
                className="absolute inset-y-0 w-px bg-blue-400/70"
                style={{ left: todayLeft }}
              />
            </div>

            {sortedJobs.map((job, index) => {
              const stageKey = mapStageKey(job.status, job.currentStage);
              const stage = STAGES[stageKey];
              const progressPct = Math.min(1, Math.max(0, STAGE_PROGRESS[stageKey] ?? 0.2));
              const createdAt = normalizeDate(job.createdAt);
              const rawStartIndex = diffDays(createdAt, timelineStart);
              const startIndex = Math.max(0, Math.min(days.length - 1, rawStartIndex));
              const durationDays = getDurationDays(job.createdAt, today);
              const maxDuration = Math.max(1, days.length - startIndex);
              const clampedDuration = Math.min(durationDays, maxDuration);
              const left = startIndex * dayWidth;
              const width = clampedDuration * dayWidth;
              const overdue = durationDays >= 3;
              const rowBg = index % 2 === 0 ? "bg-white" : "bg-slate-50/60";
              return (
                <>
                  <div
                    key={`${job.id}-info`}
                    className={`border-b border-[rgba(15,23,42,0.06)] px-6 py-4 ${rowBg} cursor-pointer hover:bg-slate-200/80`} onClick={() => handleRowClick(job.id)} > <div className="flex items-start justify-between gap-3"> <div> <div className="flex items-center gap-2"> {overdue ? ( <AlertCircle className="h-4 w-4 text-red-500" /> ) : null} <div className="text-base font-semibold text-slate-800">{job.plate}</div> </div> <div className="text-xs text-slate-500"> {job.year} · {job.make} {job.model} </div> <div className="mt-1 text-xs text-slate-400"> <span className={[ "rounded-full border px-2 py-0.5 text-[11px] font-semibold", overdue ? "border-2 border-red-400 bg-red-50 text-red-700 shadow-[0_0_0_2px_rgba(239,68,68,0.08)]" : "border-slate-200 bg-slate-50 text-slate-600", ].join(" ")} > {durationDays}Tianzai Store{overdue ? " !" : ""} </span> {job.daysInStage ? ( <span className="ml-2 text-red-500">{job.daysInStage}d in stage</span> ) : null} </div> </div> <select className={`rounded-full px-2 py-1 text-[11px] font-semibold ${stage.pill} bg-transparent`}
                        value={stageKey}
                        onChange={(event) => {
                          event.stopPropagation();
                          handleStageChange(job.id, event.target.value as StageKey);
                        }}
                        onClick={(event) => event.stopPropagation()}
                      >
                        {Object.entries(STAGES).map(([key, option]) => (
                          <option key={key} value={key}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div
                    key={`${job.id}-timeline`}
                    className={`relative border-b border-[rgba(15,23,42,0.06)] ${rowBg} cursor-pointer hover:bg-slate-200/80`}
                    onClick={() => handleRowClick(job.id)}
                  >
                    <div
                      className="relative h-16"
                      style={{
                        width: timelineWidth,
                        backgroundImage: `repeating-linear-gradient(to right, rgba(15,23,42,0.05) 0, rgba(15,23,42,0.05) 1px, transparent 1px, transparent ${dayWidth}px)`,
                      }}
                    >
                      <div
                        className="absolute inset-y-0 w-px bg-blue-400/70"
                        style={{ left: todayLeft }}
                      />
                      <div
                        className={`absolute top-3 flex h-10 items-center justify-center rounded-full px-3 text-xs font-semibold ${stage.text} ${stage.barSoft}`}
                        style={{
                          left,
                          width,
                          border: overdue ? "2px solid #ef4444" : "1px solid rgba(15,23,42,0.08)",
                        }}
                      >
                        <div
                          className={`absolute left-0 top-0 h-full rounded-full ${stage.bar}`}
                          style={{ width: `${Math.max(12, Math.round(progressPct * 100))}%` }}
                        />
                        <span className="relative z-10">{durationDays} days</span> {overdue ? ( <span className="relative z-10 ml-2 rounded-full bg-red-500 px-1 text-[10px] text-white">
                            !
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                </>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
