import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { DndProvider, useDrag, useDrop } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { ChevronLeft, ChevronRight, Clock3, ExternalLink, GripVertical, RefreshCcw } from "lucide-react";
import { Button, Card, EmptyState, useToast } from "@/components/ui";
import { withApiBase } from "@/utils/api";
import { formatNzDateTime, parseTimestamp } from "@/utils/date";
import { useRef } from "react";

const STORAGE_KEY = "wof:schedule:placements:v1";
const DRAG_TYPE = "wof-job-card";
const DAY_START_HOUR = 8;
const DAY_END_HOUR = 18;
const SLOT_HOURS = Array.from({ length: DAY_END_HOUR - DAY_START_HOUR }, (_, index) => DAY_START_HOUR + index);

type WofScheduleJob = {
  jobId: string;
  plate: string;
  make: string;
  model: string;
  year?: number | null;
  vin: string;
  wofExpiry: string;
  inShopDateTime: string;
  status: string;
};

type Placement =
  | { kind: "backlog" }
  | { kind: "slot"; slotKey: string }
  | { kind: "completed" };

type PlacementMap = Record<string, Placement>;

type DragItem = {
  jobId: string;
};

type WorkingDay = {
  key: string;
  label: string;
  shortDate: string;
};

function loadPlacements(): PlacementMap {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as PlacementMap;
  } catch {
    return {};
  }
}

function savePlacements(next: PlacementMap) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

function getNzCalendarDateParts(value: Date) {
  const parts = new Intl.DateTimeFormat("en-NZ", {
    timeZone: "Pacific/Auckland",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
  };
}

function buildWorkingDays(weekOffset: number): WorkingDay[] {
  const formatter = new Intl.DateTimeFormat("en-NZ", {
    timeZone: "Pacific/Auckland",
    weekday: "short",
    day: "2-digit",
    month: "short",
  });

  const nowParts = getNzCalendarDateParts(new Date());
  const todayUtc = new Date(Date.UTC(nowParts.year, nowParts.month - 1, nowParts.day));
  const currentWeekday = todayUtc.getUTCDay();
  const diffToMonday = currentWeekday === 0 ? -6 : 1 - currentWeekday;
  const weekStart = new Date(todayUtc);
  weekStart.setUTCDate(todayUtc.getUTCDate() + diffToMonday + weekOffset * 7);

  const results: WorkingDay[] = [];
  for (let index = 0; index < 7; index += 1) {
    const cursor = new Date(weekStart);
    cursor.setUTCDate(weekStart.getUTCDate() + index);
    const key = [
      cursor.getUTCFullYear(),
      String(cursor.getUTCMonth() + 1).padStart(2, "0"),
      String(cursor.getUTCDate()).padStart(2, "0"),
    ].join("-");
    const formatted = formatter.formatToParts(cursor);
    const map = Object.fromEntries(formatted.map((part) => [part.type, part.value]));
    results.push({
      key,
      label: `${map.weekday} ${map.day} ${map.month}`,
      shortDate: `${map.day}/${map.month}`,
    });
  }

  return results;
}

function formatWeekRange(days: WorkingDay[]) {
  if (days.length === 0) return "";
  return `${days[0].label} - ${days[days.length - 1].label}`;
}

function formatVehicleLabel(job: WofScheduleJob) {
  const parts = [job.year, job.make, job.model]
    .filter(Boolean)
    .map((value) => String(value).trim())
    .filter(Boolean);
  return parts.length ? parts.join(" ") : "Vehicle details missing";
}

function getSlotLabel(hour: number) {
  return `${String(hour).padStart(2, "0")}:00`;
}

function getInShopDaysLabel(inShopDateTime: string) {
  const parsed = parseTimestamp(inShopDateTime);
  if (!parsed) return "—";
  const diffMs = Math.max(0, Date.now() - parsed.getTime());
  const days = Math.max(1, Math.ceil(diffMs / (24 * 60 * 60 * 1000)));
  return `${days}d`;
}

function openNztaAndCopyVin(vin: string, toast: ReturnType<typeof useToast>) {
  if (!vin.trim()) {
    toast.error("This vehicle does not have a VIN yet.");
    return;
  }

  navigator.clipboard.writeText(vin.trim())
    .then(() => {
      toast.success("VIN copied. Opening NZTA.");
      window.open("https://www.nzta.govt.nz/", "_blank", "noopener,noreferrer");
    })
    .catch(() => {
      toast.error("Failed to copy VIN.");
    });
}

function WofJobCard({
  job,
  compact = false,
  showNztaAction = false,
  onNzta,
}: {
  job: WofScheduleJob;
  compact?: boolean;
  showNztaAction?: boolean;
  onNzta?: () => void;
}) {
  const dragRef = useRef<HTMLDivElement | null>(null);
  const [{ isDragging }, drag] = useDrag(() => ({
    type: DRAG_TYPE,
    item: { jobId: job.jobId } satisfies DragItem,
    collect: (monitor) => ({
      isDragging: monitor.isDragging(),
    }),
  }), [job.jobId]);
  drag(dragRef);

  return (
    <div
      ref={dragRef}
      title={
        compact
          ? `${job.plate}\n${formatVehicleLabel(job)}\nVIN: ${job.vin || "—"}\nWOF Expiry: ${job.wofExpiry || "—"}\nIn Shop: ${formatNzDateTime(parseTimestamp(job.inShopDateTime))}`
          : undefined
      }
      className={[
        "group relative rounded-xl border border-slate-200 bg-white shadow-sm transition",
        "cursor-grab active:cursor-grabbing",
        compact ? "space-y-1 p-2" : "space-y-3 p-3",
        isDragging ? "opacity-45" : "opacity-100",
      ].join(" ")}
    >
      {compact ? (
        <>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <div className="truncate text-sm font-semibold text-slate-900">{job.plate}</div>
                  <Link
                    to={`/jobs/${job.jobId}?tab=WOF`}
                    className="pointer-events-auto shrink-0 text-[10px] font-medium text-[var(--ds-primary)] underline-offset-2 hover:underline"
                  >
                    #{job.jobId}
                  </Link>
                </div>
                <div className="shrink-0 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                  {getInShopDaysLabel(job.inShopDateTime)}
                </div>
              </div>
              <div className="mt-0.5 text-[11px] text-slate-500">WOF {job.wofExpiry || "—"}</div>
            </div>
            <GripVertical className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
          </div>
          <div className="pointer-events-none absolute left-0 top-full z-20 hidden w-[240px] rounded-xl border border-slate-200 bg-white p-3 shadow-xl group-hover:block">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <div className="truncate text-sm font-semibold text-slate-900">{job.plate}</div>
                <Link
                  to={`/jobs/${job.jobId}?tab=WOF`}
                  className="pointer-events-auto shrink-0 text-[10px] font-medium text-[var(--ds-primary)] underline-offset-2 hover:underline"
                >
                  #{job.jobId}
                </Link>
              </div>
              <div className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                {getInShopDaysLabel(job.inShopDateTime)}
              </div>
            </div>
            <div className="mt-0.5 text-xs text-slate-500">{formatVehicleLabel(job)}</div>
            <dl className="mt-3 grid gap-2 text-xs text-slate-600">
              <div className="flex items-start justify-between gap-3">
                <dt className="font-medium text-slate-500">VIN</dt>
                <dd className="max-w-[140px] text-right font-mono text-[11px] text-slate-800">{job.vin || "—"}</dd>
              </div>
              <div className="flex items-start justify-between gap-3">
                <dt className="font-medium text-slate-500">WOF Expiry</dt>
                <dd className="text-right text-slate-800">{job.wofExpiry || "—"}</dd>
              </div>
            </dl>
          </div>
        </>
      ) : (
        <>
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <div className="truncate text-base font-semibold text-slate-900">{job.plate}</div>
                  <Link
                    to={`/jobs/${job.jobId}?tab=WOF`}
                    className="shrink-0 text-xs font-medium text-[var(--ds-primary)] underline-offset-2 hover:underline"
                  >
                    #{job.jobId}
                  </Link>
                </div>
                <div className="shrink-0 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
                  {getInShopDaysLabel(job.inShopDateTime)}
                </div>
              </div>
              <div className="text-xs text-slate-500">{formatVehicleLabel(job)}</div>
            </div>
            <GripVertical className="mt-0.5 h-4 w-4 text-slate-400" />
          </div>
          <dl className="grid gap-2 text-xs text-slate-600">
            <div className="flex items-start justify-between gap-3">
              <dt className="font-medium text-slate-500">VIN</dt>
              <dd className="max-w-[180px] text-right font-mono text-[11px] text-slate-800">{job.vin || "—"}</dd>
            </div>
            <div className="flex items-start justify-between gap-3">
              <dt className="font-medium text-slate-500">WOF Expiry</dt>
              <dd className="text-right text-slate-800">{job.wofExpiry || "—"}</dd>
            </div>
          </dl>
          <div className="flex items-center justify-end gap-2 pt-1">
            {showNztaAction ? (
              <Button
                variant="ghost"
                className="h-8 border-slate-200 px-2 text-xs"
                leftIcon={<ExternalLink className="h-3.5 w-3.5" />}
                onClick={onNzta}
              >
                NZTA
              </Button>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}

function DropLane({
  title,
  subtitle,
  jobs,
  onDropJob,
  children,
}: {
  title: string;
  subtitle: string;
  jobs: WofScheduleJob[];
  onDropJob: (jobId: string) => void;
  children?: React.ReactNode;
}) {
  const dropRef = useRef<HTMLDivElement | null>(null);
  const [{ isOver }, drop] = useDrop<DragItem, void, { isOver: boolean }>(() => ({
    accept: DRAG_TYPE,
    drop: (item) => onDropJob(item.jobId),
    collect: (monitor) => ({
      isOver: monitor.isOver({ shallow: true }),
    }),
  }), [onDropJob]);
  drop(dropRef);

  return (
    <Card className="flex h-full min-h-[760px] flex-col overflow-hidden">
      <div className="border-b border-slate-200 bg-slate-50/80 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-slate-900">{title}</div>
            <div className="text-xs text-slate-500">{subtitle}</div>
          </div>
          <div className="rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-600 ring-1 ring-slate-200">
            {jobs.length}
          </div>
        </div>
      </div>
      <div
        ref={dropRef}
        className={[
          "flex-1 space-y-3 overflow-y-auto px-4 py-4",
          isOver ? "bg-rose-50/60" : "bg-white",
        ].join(" ")}
      >
        {children}
        {jobs.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
            Drag a car here.
          </div>
        ) : null}
      </div>
    </Card>
  );
}

function ScheduleSlot({
  slotKey,
  hour,
  jobs,
  onDropJob,
  showCurrentLine,
  currentLineOffsetPct,
  onNzta,
}: {
  slotKey: string;
  hour: number;
  jobs: WofScheduleJob[];
  onDropJob: (jobId: string, slotKey: string) => void;
  showCurrentLine: boolean;
  currentLineOffsetPct: number;
  onNzta: (job: WofScheduleJob) => void;
}) {
  const dropRef = useRef<HTMLDivElement | null>(null);
  const [{ isOver }, drop] = useDrop<DragItem, void, { isOver: boolean }>(() => ({
    accept: DRAG_TYPE,
    drop: (item) => onDropJob(item.jobId, slotKey),
    collect: (monitor) => ({
      isOver: monitor.isOver({ shallow: true }),
    }),
  }), [onDropJob, slotKey]);
  drop(dropRef);

  return (
    <div
      ref={dropRef}
      className={[
        "relative h-full min-h-0 border-t border-slate-200 px-2 py-2 transition",
        isOver ? "bg-rose-50" : "bg-white",
      ].join(" ")}
    >
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400">
        {getSlotLabel(hour)}
      </div>
      <div className="h-[calc(100%-24px)] space-y-1 overflow-y-auto pr-1">
        {jobs.map((job) => (
          <WofJobCard key={job.jobId} job={job} compact showNztaAction={false} onNzta={() => onNzta(job)} />
        ))}
      </div>
      {showCurrentLine ? (
        <div
          className="pointer-events-none absolute left-0 right-0 z-10"
          style={{ top: `${Math.max(0, Math.min(100, currentLineOffsetPct))}%` }}
        >
          <div className="relative border-t-2 border-rose-500">
            <span className="absolute -top-3 left-2 rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-semibold text-white shadow-sm">
              Now
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function WofSchedulePage() {
  const toast = useToast();
  const [jobs, setJobs] = useState<WofScheduleJob[]>([]);
  const [placements, setPlacements] = useState<PlacementMap>(() => loadPlacements());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [weekOffset, setWeekOffset] = useState(0);

  const workingDays = useMemo(() => buildWorkingDays(weekOffset), [weekOffset]);

  const loadJobs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(withApiBase("/api/jobs/wof-schedule"));
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(data?.error || "Failed to load WOF schedule.");
      }
      const rows = Array.isArray(data?.jobs) ? (data.jobs as WofScheduleJob[]) : [];
      setJobs(rows);
      setPlacements((prev) => {
        const validIds = new Set(rows.map((job) => job.jobId));
        const next = Object.fromEntries(
          Object.entries(prev).filter(([jobId]) => validIds.has(jobId))
        ) as PlacementMap;
        savePlacements(next);
        return next;
      });
    } catch (err) {
      setJobs([]);
      setError(err instanceof Error ? err.message : "Failed to load WOF schedule.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const moveToBacklog = useCallback((jobId: string) => {
    setPlacements((prev) => {
      const next = { ...prev, [jobId]: { kind: "backlog" } as Placement };
      savePlacements(next);
      return next;
    });
  }, []);

  const moveToCompleted = useCallback((jobId: string) => {
    setPlacements((prev) => {
      const next = { ...prev, [jobId]: { kind: "completed" } as Placement };
      savePlacements(next);
      return next;
    });
  }, []);

  const moveToSlot = useCallback((jobId: string, slotKey: string) => {
    setPlacements((prev) => {
      const next = { ...prev };

      for (const [existingJobId, placement] of Object.entries(prev)) {
        if (existingJobId === jobId) continue;
        if (placement.kind === "slot" && placement.slotKey === slotKey) {
          next[existingJobId] = { kind: "backlog" };
        }
      }

      next[jobId] = { kind: "slot", slotKey } as Placement;
      savePlacements(next);
      return next;
    });
  }, []);

  const jobMap = useMemo(
    () => new Map(jobs.map((job) => [job.jobId, job])),
    [jobs]
  );

  const backlogJobs = useMemo(
    () =>
      jobs.filter((job) => {
        const placement = placements[job.jobId];
        return !placement || placement.kind === "backlog";
      }),
    [jobs, placements]
  );

  const completedJobs = useMemo(
    () =>
      jobs.filter((job) => placements[job.jobId]?.kind === "completed"),
    [jobs, placements]
  );

  const jobsBySlot = useMemo(() => {
    const map = new Map<string, WofScheduleJob[]>();
    for (const [jobId, placement] of Object.entries(placements)) {
      if (placement.kind !== "slot") continue;
      const job = jobMap.get(jobId);
      if (!job) continue;
      map.set(placement.slotKey, [job]);
    }
    return map;
  }, [jobMap, placements]);

  const currentDayKey = useMemo(() => {
    const parts = new Intl.DateTimeFormat("en-NZ", {
      timeZone: "Pacific/Auckland",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);
    const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${map.year}-${map.month}-${map.day}`;
  }, [now]);

  const currentHours = now.getHours() + now.getMinutes() / 60;

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">WOF 排班表</h1>
          <p className="mt-1 text-sm text-slate-500">Loading schedule board…</p>
        </div>
      </div>
    );
  }

  return (
    <DndProvider backend={HTML5Backend}>
      <div className="mx-auto flex max-h-[1200px] max-w-[2000px] flex-col space-y-6 p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">WOF 排班表</h1>
            <p className="mt-1 text-sm text-slate-500">
              Drag WOF jobs from the backlog into the next 7 working days, or move them to completed when done.
            </p>
          </div>
          <Button variant="ghost" leftIcon={<RefreshCcw className="h-4 w-4" />} onClick={loadJobs}>
            Refresh
          </Button>
        </div>

        {error ? (
          <Card className="border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</Card>
        ) : null}

        {jobs.length === 0 ? (
          <EmptyState message="No active WOF jobs are available for scheduling right now." />
        ) : (
          <div className="grid min-h-[820px] grid-cols-[320px_minmax(0,1fr)_320px] gap-6">
            <DropLane
              title="WOF 待办栏"
              subtitle="Unsheduled WOF jobs"
              jobs={backlogJobs}
              onDropJob={moveToBacklog}
            >
              {backlogJobs.map((job) => (
                <WofJobCard key={job.jobId} job={job} />
              ))}
            </DropLane>

            <Card className="overflow-hidden max-w-[2000px]">
              <div className="border-b border-slate-200 bg-slate-50/80 px-5 py-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">7 个工作日</div>
                    <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                      <Clock3 className="h-3.5 w-3.5" />
                      08:00 - 17:00, one-hour scheduling blocks
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      className="h-8 px-2"
                      onClick={() => setWeekOffset((prev) => prev - 1)}
                      title="Previous week"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <div className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">
                      {formatWeekRange(workingDays)}
                    </div>
                    <Button
                      variant="ghost"
                      className="h-8 px-2"
                      onClick={() => setWeekOffset((prev) => prev + 1)}
                      title="Next week"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                    <div className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">
                      Current time: {formatNzDateTime(now)}
                    </div>
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <div className="grid min-w-[980px] grid-cols-7">
                  {workingDays.map((day) => (
                    <div key={day.key} className="border-r border-slate-200 last:border-r-0">
                      <div className="border-b border-slate-200 bg-white px-3 py-3">
                        <div className="text-sm font-semibold text-slate-900">{day.label}</div>
                        <div className="mt-1 text-xs text-slate-500">{day.shortDate}</div>
                      </div>
                      <div
                        className="grid"
                        style={{ gridTemplateRows: `repeat(${SLOT_HOURS.length}, minmax(0, 1fr))`, height: "930px" }}
                      >
                        {SLOT_HOURS.map((hour) => {
                          const slotKey = `${day.key}-${hour}`;
                          const showCurrentLine =
                            day.key === currentDayKey &&
                            currentHours >= hour &&
                            currentHours < hour + 1;
                          return (
                            <ScheduleSlot
                              key={slotKey}
                              slotKey={slotKey}
                              hour={hour}
                              jobs={jobsBySlot.get(slotKey) ?? []}
                              onDropJob={moveToSlot}
                              showCurrentLine={showCurrentLine}
                              currentLineOffsetPct={(currentHours - hour) * 100}
                              onNzta={(job) => openNztaAndCopyVin(job.vin, toast)}
                            />
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </Card>

            <DropLane
              title="完成 WOF"
              subtitle="Drop finished vehicles here"
              jobs={completedJobs}
              onDropJob={moveToCompleted}
            >
              {completedJobs.map((job) => (
                <WofJobCard
                  key={job.jobId}
                  job={job}
                  showNztaAction
                  onNzta={() => openNztaAndCopyVin(job.vin, toast)}
                />
              ))}
            </DropLane>
          </div>
        )}
      </div>
    </DndProvider>
  );
}
