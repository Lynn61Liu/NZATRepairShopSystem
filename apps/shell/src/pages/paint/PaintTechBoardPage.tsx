import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Car,
  CheckCircle2,
  ClipboardCheck,
  Droplets,
  Hammer,
  PauseCircle,
  Paintbrush2,
  RefreshCw,
  Search,
  Settings2,
} from "lucide-react";
import { fetchPaintBoard, updatePaintStage } from "@/features/paint/api/paintApi";
import { updateWofStatus as apiUpdateWofStatus } from "@/features/wof/api/wofApi";
import {
  getDurationDays,
  mapStageKey,
  normalizeDate,
  PAINT_STAGE_INDEX_BY_KEY,
  PAINT_STAGE_LABELS,
  PAINT_STAGE_ORDER,
  type PaintBoardJob,
  type StageKey,
} from "@/features/paint/paintBoard.utils";
import { Button, Pagination, Select } from "@/components/ui";
import { paginate } from "@/utils/pagination";
import { notifyWofScheduleRefresh, subscribePaintBoardRefresh } from "@/utils/refreshSignals";

const STAGES: Record<
  StageKey,
  {
    label: string;
    icon: ReactNode;
    pill: string;
    card: string;
    text: string;
  }
> = {
  on_hold: {
    label: PAINT_STAGE_LABELS.on_hold,
    icon: <PauseCircle className="h-4 w-4 text-amber-600" />,
    pill: "bg-amber-50 text-amber-700",
    card: "border-amber-100",
    text: "text-amber-700",
  },
  waiting: {
    label: PAINT_STAGE_LABELS.waiting,
    icon: <CheckCircle2 className="h-4 w-4 text-slate-500" />,
    pill: "bg-slate-100 text-slate-700",
    card: "border-slate-200",
    text: "text-slate-700",
  },
  sheet: {
    label: PAINT_STAGE_LABELS.sheet,
    icon: <Hammer className="h-4 w-4 text-sky-600" />,
    pill: "bg-sky-50 text-sky-700",
    card: "border-sky-100",
    text: "text-sky-700",
  },
  undercoat: {
    label: PAINT_STAGE_LABELS.undercoat,
    icon: <Paintbrush2 className="h-4 w-4 text-amber-600" />,
    pill: "bg-amber-50 text-amber-700",
    card: "border-amber-100",
    text: "text-amber-700",
  },
  sanding: {
    label: PAINT_STAGE_LABELS.sanding,
    icon: <Settings2 className="h-4 w-4 text-fuchsia-600" />,
    pill: "bg-fuchsia-50 text-fuchsia-700",
    card: "border-fuchsia-100",
    text: "text-fuchsia-700",
  },
  painting: {
    label: PAINT_STAGE_LABELS.painting,
    icon: <Droplets className="h-4 w-4 text-rose-600" />,
    pill: "bg-rose-50 text-rose-700",
    card: "border-rose-100",
    text: "text-rose-700",
  },
  assembly: {
    label: PAINT_STAGE_LABELS.assembly,
    icon: <ClipboardCheck className="h-4 w-4 text-amber-900" />,
    pill: "bg-amber-100 text-amber-900",
    card: "border-amber-200",
    text: "text-amber-900",
  },
  done: {
    label: PAINT_STAGE_LABELS.done,
    icon: <Car className="h-4 w-4 text-emerald-600" />,
    pill: "bg-emerald-50 text-emerald-700",
    card: "border-emerald-100",
    text: "text-emerald-700",
  },
  delivered: {
    label: PAINT_STAGE_LABELS.delivered,
    icon: <Car className="h-4 w-4 text-green-600" />,
    pill: "bg-green-50 text-green-700",
    card: "border-green-100",
    text: "text-green-700",
  },
};

const STAGE_ORDER = PAINT_STAGE_ORDER;
const SUMMARY_STAGE_ORDER = STAGE_ORDER.filter((stage) => stage !== "delivered");
const TECH_STAGE_ORDER = STAGE_ORDER.filter((stage) => stage !== "on_hold" && stage !== "delivered");
const AUTO_REFRESH_MS = 5 * 60 * 1000;

const extractServiceNote = (note?: string | null) => {
  if (!note) return "";
  const normalized = note.trim();
  if (!normalized) return "";
  const marker = "Serve:";
  const markerAlt = "Serve:";
  const idx = normalized.indexOf(marker);
  const idxAlt = normalized.indexOf(markerAlt);
  const index = idx >= 0 ? idx : idxAlt;
  if (index >= 0) {
    const value = normalized.slice(index + (idx >= 0 ? marker.length : markerAlt.length)).trim();
    return value;
  }
  return normalized;
};

export function PaintTechBoardPage() {
  const [jobs, setJobs] = useState<PaintBoardJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [updatingWofJobIds, setUpdatingWofJobIds] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState("");
  const [selectedStage, setSelectedStage] = useState<"all" | StageKey>("all");
  const [page, setPage] = useState(1);
  const pageSize = 30;
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const load = async ({ silent = false }: { silent?: boolean } = {}) => {
    if (!mountedRef.current) return;
    if (!silent) {
      setLoading(true);
      setLoadError(null);
    }
    const res = await fetchPaintBoard();
    if (!res.ok) {
      if (mountedRef.current) setLoadError(res.error || "Loading failed");
      if (mountedRef.current && !silent) setLoading(false);
      return;
    }
    const list = Array.isArray(res.data?.jobs) ? res.data.jobs : [];
    if (mountedRef.current) {
      setJobs(list);
      setLastUpdatedAt(new Date());
    }
    if (mountedRef.current && !silent) setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    const unsubscribe = subscribePaintBoardRefresh(() => {
      void load({ silent: true });
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void load({ silent: true });
    }, AUTO_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, []);

  const visibleJobs = useMemo(
    () =>
      jobs.filter((job) => {
        const stage = mapStageKey(job.status, job.currentStage);
        if (stage === "on_hold" || stage === "delivered") return false;
        if (job.wofStatus === "Recorded") return false;
        return true;
      }),
    [jobs]
  );

  const today = normalizeDate(new Date());
  const statsJobs = useMemo(
    () =>
      jobs.filter((job) => {
        const stage = mapStageKey(job.status, job.currentStage);
        return stage !== "delivered";
      }),
    [jobs]
  );
  const overdueCount = visibleJobs.filter((job) => {
    const stageKey = mapStageKey(job.status, job.currentStage);
    if (stageKey === "done" || stageKey === "delivered") return false;
    return getDurationDays(job.createdAt, today) >= 3;
  }).length;

  const stageCounts = useMemo(() => {
    const counts: Record<StageKey, number> = {
      on_hold: 0,
      waiting: 0,
      sheet: 0,
      undercoat: 0,
      sanding: 0,
      painting: 0,
      assembly: 0,
      done: 0,
      delivered: 0,
    };
    statsJobs.forEach((job) => {
      const key = mapStageKey(job.status, job.currentStage);
      counts[key] += 1;
    });
    return counts;
  }, [statsJobs]);

  const maxStageCount = useMemo(() => {
    return Math.max(1, ...SUMMARY_STAGE_ORDER.map((stage) => stageCounts[stage] ?? 0));
  }, [stageCounts]);

  const filteredJobs = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return visibleJobs.filter((job) => {
      const stageKey = mapStageKey(job.status, job.currentStage);
      if (selectedStage !== "all" && stageKey !== selectedStage) return false;
      if (!keyword) return true;
      const haystack = `${job.plate} ${job.make ?? ""} ${job.model ?? ""}`.toLowerCase(); return haystack.includes(keyword); }); }, [visibleJobs, search, selectedStage]); const sortedJobs = useMemo(() => { const copy = [...filteredJobs]; const orderMap = new Map(STAGE_ORDER.map((stage, index) => [stage, index])); return copy.sort((a, b) => { const stageA = mapStageKey(a.status, a.currentStage); const stageB = mapStageKey(b.status, b.currentStage); const stageDiff = (orderMap.get(stageA) ?? 0) - (orderMap.get(stageB) ?? 0); if (stageDiff !== 0) return stageDiff; return normalizeDate(a.createdAt).getTime() - normalizeDate(b.createdAt).getTime(); }); }, [filteredJobs]); useEffect(() => { setPage(1); }, [search, selectedStage, visibleJobs.length]); const pagination = useMemo( () => paginate(sortedJobs, page, pageSize), [sortedJobs, page, pageSize] ); const safePage = pagination.currentPage; const pagedJobs = pagination.pageRows; useEffect(() => { if (safePage !== page) { setPage(safePage); } }, [safePage, page]); const topFive = useMemo(() => { return [...visibleJobs] .map((job) => ({ ...job, durationDays: getDurationDays(job.createdAt, today), })) .sort((a, b) => b.durationDays - a.durationDays) .slice(0, 5); }, [visibleJobs, today]); const handleStageChange = async (jobId: string, nextStage: StageKey) => { await updatePaintStage(jobId, PAINT_STAGE_INDEX_BY_KEY[nextStage]); const res = await fetchPaintBoard(); if (res.ok) { const list = Array.isArray(res.data?.jobs) ? res.data.jobs : []; setJobs(list); setLastUpdatedAt(new Date()); } }; const handleWofStatusChange = async (jobId: string, nextStatus: "Todo" | "Checked") => { setUpdatingWofJobIds((prev) => ({ ...prev, [jobId]: true })); const res = await apiUpdateWofStatus(jobId, nextStatus); if (res.ok) { setJobs((prev) => prev.map((job) => job.id === jobId ?{ ...job, wofStatus: nextStatus, } :job ) ); notifyWofScheduleRefresh(); } else { setLoadError(res.error || "Failed to update WOF status"); } setUpdatingWofJobIds((prev) => { const next = { ...prev }; delete next[jobId]; return next; }); }; return ( <div className="min-h-screen bg-[#f6f8fb]"> <header className="border-b border-slate-200 bg-white"> <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4"> <div className="flex items-center gap-3"> <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 text-white"> <Car className="h-5 w-5" /> </div> <div> <div className="text-lg font-semibold text-slate-800">NZAT PNP Board — Spray Paint Kanban</div> <div className="text-xs text-slate-500">Vehicle Painting Tracking Dashboard</div> </div> </div> <div className="text-xs text-slate-500"> {new Date().toLocaleString("en-NZ", { hour12: false })} </div> </div> </header> <main className="mx-auto flex max-w-7xl flex-col gap-5 px-6 py-6"> <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm"> <div className="flex items-center gap-3 text-sm font-semibold text-slate-700"> <Button variant="ghost" className="h-9 rounded-[10px] border border-slate-200 bg-slate-50 px-3 text-slate-700 hover:bg-slate-100" leftIcon={<RefreshCw className={["h-4 w-4", loading ? "animate-spin" : ""].join(" ")} />} onClick={() => void load()} disabled={loading} > {loading ? "Refreshing..." : "Manual refresh"} </Button> <div className="flex items-center gap-2"> <RefreshCw className="h-4 w-4 text-[var(--ds-primary)]" /> Paint Tech Board has 5-minute auto-refresh enabled </div> </div> <div className="text-xs text-slate-500"> Refreshed every 5 minutes, the current page does not display On Hold and delivery completed orders {lastUpdatedAt?` · Last refreshed ${lastUpdatedAt.toLocaleString("en-NZ", { hour12: false })}` : ""}
          </div>
        </div>

        <div className="grid gap-3 grid-cols-2 md:grid-cols-4 xl:grid-cols-8">
          {SUMMARY_STAGE_ORDER.map((stage) => (
            <div
              key={stage}
              className={`rounded-2xl border bg-white p-4 shadow-sm ${STAGES[stage].card}`}
            >
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                {STAGES[stage].icon}
                {STAGES[stage].label}
              </div>
              <div className={`mt-2 text-2xl font-semibold ${STAGES[stage].text}`}> {stageCounts[stage] ?? 0} </div> <div className="text-xs text-slate-400">Car</div> </div> ))} </div> <div className="grid gap-4 lg:grid-cols-[2fr_1fr]"> <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"> <div className="text-sm font-semibold text-slate-700">State distribution</div> <div className="mt-4 flex h-40 items-end gap-6"> {SUMMARY_STAGE_ORDER.map((stage) => { const value = stageCounts[stage] ?? 0; const height = value === 0 ? 6 : Math.max(18, Math.round((value / maxStageCount) * 132)); return ( <div key={stage} className="flex flex-1 flex-col items-center gap-2"> <div className={`w-10 rounded-lg ${STAGES[stage].text}`}
                      style={{
                        height: `${height}px`, background: "currentColor", opacity: 0.85, }} /> <div className="text-xs text-slate-500">{STAGES[stage].label}</div> </div> ); })} </div> </div> <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"> <div className="flex items-center justify-between"> <div className="text-sm font-semibold text-slate-700">Top 5 in-store time (longest)</div> <div className="text-xs text-slate-400">{overdueCount} Expired</div> </div> <div className="mt-3 space-y-3"> {topFive.map((job) => ( <div key={job.id} className="space-y-1"> <div className="flex items-center justify-between text-xs text-slate-600"> <span> {job.plate} · {job.year} {job.make} {job.model} </span> <span className="font-semibold text-amber-600"> {getDurationDays(job.createdAt, today)} days </span> </div> <div className="h-2 w-full rounded-full bg-slate-100"> <div className="h-2 rounded-full bg-amber-400" style={{ width:`${Math.min(100, getDurationDays(job.createdAt, today) * 6)}%`}} /> </div> </div> ))} </div> </div> </div> <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"> <div className="flex flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"> <Search className="h-4 w-4 text-slate-400" /> <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search license plate, car model, job content..." className="w-full bg-transparent text-sm text-slate-700 outline-none" /> </div> <div className="flex items-center gap-2 text-xs text-slate-400"> <Settings2 className="h-4 w-4" /> Filter </div> <Select value={selectedStage} onChange={(event) => setSelectedStage(event.target.value as "all" | StageKey)} className="h-9 w-[150px]" > <option value="all">All</option> {TECH_STAGE_ORDER.map((stage) => ( <option key={stage} value={stage}> {STAGES[stage].label} </option> ))} </Select> <div className="flex flex-wrap items-center gap-2"> <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700"> All({visibleJobs.length}) </span> {TECH_STAGE_ORDER.map((stage) => ( <button key={stage} type="button" className={`rounded-full px-3 py-1 text-xs font-semibold ${STAGES[stage].pill}`} onClick={() => setSelectedStage(stage)} > {STAGES[stage].label}({stageCounts[stage] ?? 0}) </button> ))} </div> </div> <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"> <div className="mb-3 text-sm font-semibold text-slate-600"> Showing {sortedJobs.length} / {visibleJobs.length} cars </div> {loading ? ( <div className="py-8 text-center text-sm text-slate-400">Loading...</div> ) : loadError ? ( <div className="py-8 text-center text-sm text-red-600">{loadError}</div> ) : ( <div className="overflow-x-auto"> <table className="min-w-[960px] w-full text-sm text-slate-600"> <thead> <tr className="border-b border-slate-100 text-left text-xs font-semibold text-slate-400"> <th className="py-2">Factory entry time</th> <th className="py-2">In-store hours</th> <th className="py-2">License plate number</th> <th className="py-2">Car model</th> <th className="py-2">Status</th> <th className="py-2">WOF status</th> <th className="py-2">Work content</th> <th className="py-2 text-right">Number of pieces</th> </tr> </thead> <tbody> {pagedJobs.map((job) => { const stageKey = mapStageKey(job.status, job.currentStage); const durationDays = getDurationDays(job.createdAt, today); const overdue = durationDays >= 3; return ( <tr key={job.id} className="border-b border-slate-100 hover:bg-slate-50" > <td className="py-3 text-xs text-slate-500"> {new Date(job.createdAt).toLocaleDateString("en-NZ")} </td> <td className="py-3"> <span className={`rounded-full border px-2 py-1 text-xs ${
                              overdue
                                ? "border-2 border-red-400 bg-red-50 text-red-700 shadow-[0_0_0_2px_rgba(239,68,68,0.08)]"
                                : "border-slate-200 bg-slate-50 text-slate-600"}`} > {durationDays} days{overdue?" !" : ""}
                          </span>
                        </td>
                        <td className="py-3">
                          <span className="rounded-md bg-slate-900 px-2 py-1 text-xs font-semibold text-white">
                            {job.plate}
                          </span>
                        </td>
                        <td className="py-3">
                          {job.year} {job.make} {job.model}
                        </td>
                        <td className="py-3">
                          <select
                            className={`rounded-full px-2 py-1 text-xs font-semibold ${STAGES[stageKey].pill} bg-transparent`}
                            value={stageKey}
                            onChange={(event) => {
                              event.stopPropagation();
                              handleStageChange(job.id, event.target.value as StageKey);
                            }}
                            onClick={(event) => event.stopPropagation()}
                          >
                            {TECH_STAGE_ORDER.map((stage) => (
                              <option key={stage} value={stage}>
                                {STAGES[stage].label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="py-3">
                          <div className="flex flex-wrap items-center gap-2">
                            {job.wofStatus === "Todo" || job.wofStatus === "Checked" ? (
                              <select
                                className={[
                                  "h-8 rounded-full border px-3 text-xs font-semibold outline-none transition focus:border-[var(--ds-primary)]",
                                  job.wofStatus === "Checked"
                                    ? "border-amber-200 bg-amber-50 text-amber-700"
                                    : "border-sky-200 bg-sky-100 text-sky-700",
                                ].join(" ")}
                                value={job.wofStatus}
                                onChange={(event) => {
                                  event.stopPropagation();
                                  void handleWofStatusChange(job.id, event.target.value as "Todo" | "Checked");
                                }}
                                onClick={(event) => event.stopPropagation()}
                                disabled={Boolean(updatingWofJobIds[job.id])}
                              >
                                <option value="Todo">To be checked</option> <option value="Checked">Check completed</option> </select> ) : null} {job.wofStatus !=="Todo" && job.wofStatus !== "Checked" ? (
                              <span className="text-xs text-slate-300">—</span>
                            ) : null}
                          </div>
                        </td>
                        <td className="py-3 text-xs text-slate-500">
                          {extractServiceNote(job.notes) || "—"}
                        </td>
                        <td className="py-3 text-right">
                          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                            {job.panels ?? "—"}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {pagination.totalItems > 0 ? (
                <div className="mt-4">
                  <Pagination
                    currentPage={safePage}
                    totalPages={pagination.totalPages}
                    pageSize={pageSize}
                    totalItems={pagination.totalItems}
                    onPageChange={setPage}
                  />
                </div>
              ) : null}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
