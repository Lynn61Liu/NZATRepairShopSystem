import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Car,
  CheckCircle2,
  ClipboardCheck,
  Droplets,
  Hammer,
  Paintbrush2,
  Search,
  Settings2,
} from "lucide-react";
import { fetchPaintBoard, updatePaintStage } from "@/features/paint/api/paintApi";
import {
  getDurationDays,
  mapStageKey,
  normalizeDate,
  type PaintBoardJob,
  type StageKey,
} from "@/features/paint/paintBoard.utils";
import { Pagination, Select } from "@/components/ui";
import { paginate } from "@/utils/pagination";
import { subscribePaintBoardRefresh } from "@/utils/refreshSignals";

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
  waiting: {
    label: "等待处理",
    icon: <CheckCircle2 className="h-4 w-4 text-slate-500" />,
    pill: "bg-slate-100 text-slate-700",
    card: "border-slate-200",
    text: "text-slate-700",
  },
  sheet: {
    label: "钣金/底漆",
    icon: <Hammer className="h-4 w-4 text-sky-600" />,
    pill: "bg-sky-50 text-sky-700",
    card: "border-sky-100",
    text: "text-sky-700",
  },
  undercoat: {
    label: "打底漆",
    icon: <Paintbrush2 className="h-4 w-4 text-amber-600" />,
    pill: "bg-amber-50 text-amber-700",
    card: "border-amber-100",
    text: "text-amber-700",
  },
  sanding: {
    label: "底漆打磨",
    icon: <Settings2 className="h-4 w-4 text-fuchsia-600" />,
    pill: "bg-fuchsia-50 text-fuchsia-700",
    card: "border-fuchsia-100",
    text: "text-fuchsia-700",
  },
  painting: {
    label: "喷漆",
    icon: <Droplets className="h-4 w-4 text-rose-600" />,
    pill: "bg-rose-50 text-rose-700",
    card: "border-rose-100",
    text: "text-rose-700",
  },
  assembly: {
    label: "组装抛光",
    icon: <ClipboardCheck className="h-4 w-4 text-amber-900" />,
    pill: "bg-amber-100 text-amber-900",
    card: "border-amber-200",
    text: "text-amber-900",
  },
  done: {
    label: "完成喷漆",
    icon: <Car className="h-4 w-4 text-emerald-600" />,
    pill: "bg-emerald-50 text-emerald-700",
    card: "border-emerald-100",
    text: "text-emerald-700",
  },
};

const STAGE_ORDER: StageKey[] = [
  "waiting",
  "sheet",
  "undercoat",
  "sanding",
  "painting",
  "assembly",
  "done",
];

const extractServiceNote = (note?: string | null) => {
  if (!note) return "";
  const normalized = note.trim();
  if (!normalized) return "";
  const marker = "服务：";
  const markerAlt = "服务:";
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
  const [search, setSearch] = useState("");
  const [selectedStage, setSelectedStage] = useState<"all" | StageKey>("all");
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const load = async () => {
    if (!mountedRef.current) return;
    setLoading(true);
    setLoadError(null);
    const res = await fetchPaintBoard();
    if (!res.ok) {
      if (mountedRef.current) setLoadError(res.error || "加载失败");
      if (mountedRef.current) setLoading(false);
      return;
    }
    const list = Array.isArray(res.data?.jobs) ? res.data.jobs : [];
    if (mountedRef.current) setJobs(list);
    if (mountedRef.current) setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    const unsubscribe = subscribePaintBoardRefresh(() => {
      void load();
    });
    return unsubscribe;
  }, []);

  const today = normalizeDate(new Date());
  const overdueCount = jobs.filter((job) => {
    const stageKey = mapStageKey(job.status, job.currentStage);
    if (stageKey === "done") return false;
    return getDurationDays(job.createdAt, today) >= 3;
  }).length;

  const stageCounts = useMemo(() => {
    const counts: Record<StageKey, number> = {
      waiting: 0,
      sheet: 0,
      undercoat: 0,
      sanding: 0,
      painting: 0,
      assembly: 0,
      done: 0,
    };
    jobs.forEach((job) => {
      const key = mapStageKey(job.status, job.currentStage);
      counts[key] += 1;
    });
    return counts;
  }, [jobs]);

  const filteredJobs = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return jobs.filter((job) => {
      const stageKey = mapStageKey(job.status, job.currentStage);
      if (selectedStage !== "all" && stageKey !== selectedStage) return false;
      if (!keyword) return true;
      const haystack = `${job.plate} ${job.make ?? ""} ${job.model ?? ""}`.toLowerCase();
      return haystack.includes(keyword);
    });
  }, [jobs, search, selectedStage]);

  const sortedJobs = useMemo(() => {
    const copy = [...filteredJobs];
    const orderMap = new Map(STAGE_ORDER.map((stage, index) => [stage, index]));
    return copy.sort((a, b) => {
      const stageA = mapStageKey(a.status, a.currentStage);
      const stageB = mapStageKey(b.status, b.currentStage);
      const stageDiff = (orderMap.get(stageA) ?? 0) - (orderMap.get(stageB) ?? 0);
      if (stageDiff !== 0) return stageDiff;
      return normalizeDate(a.createdAt).getTime() - normalizeDate(b.createdAt).getTime();
    });
  }, [filteredJobs]);

  useEffect(() => {
    setPage(1);
  }, [search, selectedStage, jobs.length]);

  const pagination = useMemo(
    () => paginate(sortedJobs, page, pageSize),
    [sortedJobs, page, pageSize]
  );
  const safePage = pagination.currentPage;
  const pagedJobs = pagination.pageRows;

  useEffect(() => {
    if (safePage !== page) {
      setPage(safePage);
    }
  }, [safePage, page]);

  const topFive = useMemo(() => {
    return [...jobs]
      .map((job) => ({
        ...job,
        durationDays: getDurationDays(job.createdAt, today),
      }))
      .sort((a, b) => b.durationDays - a.durationDays)
      .slice(0, 5);
  }, [jobs, today]);

  const handleStageChange = async (jobId: string, nextStage: StageKey) => {
    const stageIndexMap: Record<StageKey, number> = {
      waiting: -1,
      sheet: 0,
      undercoat: 1,
      sanding: 2,
      painting: 3,
      assembly: 4,
      done: 5,
    };
    await updatePaintStage(jobId, stageIndexMap[nextStage]);
    const res = await fetchPaintBoard();
    if (res.ok) {
      const list = Array.isArray(res.data?.jobs) ? res.data.jobs : [];
      setJobs(list);
    }
  };

  return (
    <div className="min-h-screen bg-[#f6f8fb]">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 text-white">
              <Car className="h-5 w-5" />
            </div>
            <div>
              <div className="text-lg font-semibold text-slate-800">NZAT PNP Board — 喷漆看板</div>
              <div className="text-xs text-slate-500">Vehicle Painting Tracking Dashboard</div>
            </div>
          </div>
          <div className="text-xs text-slate-500">
            {new Date().toLocaleString("zh-CN", { hour12: false })}
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-7xl flex-col gap-5 px-6 py-6">
        <div className="grid gap-3 md:grid-cols-7">
          {STAGE_ORDER.map((stage) => (
            <div
              key={stage}
              className={`rounded-2xl border bg-white p-4 shadow-sm ${STAGES[stage].card}`}
            >
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                {STAGES[stage].icon}
                {STAGES[stage].label}
              </div>
              <div className={`mt-2 text-2xl font-semibold ${STAGES[stage].text}`}>
                {stageCounts[stage] ?? 0}
              </div>
              <div className="text-xs text-slate-400">辆</div>
            </div>
          ))}
        </div>

        <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-sm font-semibold text-slate-700">状态分布</div>
            <div className="mt-4 flex h-40 items-end gap-6">
              {STAGE_ORDER.map((stage) => {
                const value = stageCounts[stage] ?? 0;
                const height = value === 0 ? 6 : 20 + value * 16;
                return (
                  <div key={stage} className="flex flex-1 flex-col items-center gap-2">
                    <div
                      className={`w-10 rounded-lg ${STAGES[stage].text}`}
                      style={{
                        height,
                        background: "currentColor",
                        opacity: 0.85,
                      }}
                    />
                    <div className="text-xs text-slate-500">{STAGES[stage].label}</div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-slate-700">在店时间 Top 5（最长）</div>
              <div className="text-xs text-slate-400">{overdueCount} 逾期</div>
            </div>
            <div className="mt-3 space-y-3">
              {topFive.map((job) => (
                <div key={job.id} className="space-y-1">
                  <div className="flex items-center justify-between text-xs text-slate-600">
                    <span>
                      {job.plate} · {job.year} {job.make} {job.model}
                    </span>
                    <span className="font-semibold text-amber-600">
                      {getDurationDays(job.createdAt, today)}天
                    </span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-slate-100">
                    <div
                      className="h-2 rounded-full bg-amber-400"
                      style={{ width: `${Math.min(100, getDurationDays(job.createdAt, today) * 6)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-1 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
            <Search className="h-4 w-4 text-slate-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="搜索车牌、车型、工作内容..."
              className="w-full bg-transparent text-sm text-slate-700 outline-none"
            />
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Settings2 className="h-4 w-4" />
            筛选
          </div>
          <Select
            value={selectedStage}
            onChange={(event) => setSelectedStage(event.target.value as "all" | StageKey)}
            className="h-9 w-[150px]"
          >
            <option value="all">全部</option>
            {STAGE_ORDER.map((stage) => (
              <option key={stage} value={stage}>
                {STAGES[stage].label}
              </option>
            ))}
          </Select>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
              全部({jobs.length})
            </span>
            {STAGE_ORDER.map((stage) => (
              <button
                key={stage}
                type="button"
                className={`rounded-full px-3 py-1 text-xs font-semibold ${STAGES[stage].pill}`}
                onClick={() => setSelectedStage(stage)}
              >
                {STAGES[stage].label}({stageCounts[stage] ?? 0})
              </button>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="mb-3 text-sm font-semibold text-slate-600">
            显示 {sortedJobs.length} / {jobs.length} 辆车
          </div>
          {loading ? (
            <div className="py-8 text-center text-sm text-slate-400">加载中...</div>
          ) : loadError ? (
            <div className="py-8 text-center text-sm text-red-600">{loadError}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-[960px] w-full text-sm text-slate-600">
                <thead>
                  <tr className="border-b border-slate-100 text-left text-xs font-semibold text-slate-400">
                    <th className="py-2">进厂时间</th>
                    <th className="py-2">在店时间</th>
                    <th className="py-2">车牌号</th>
                    <th className="py-2">车型</th>
                    <th className="py-2">状态</th>
                    <th className="py-2">工作内容</th>
                    <th className="py-2 text-right">片数</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedJobs.map((job) => {
                    const stageKey = mapStageKey(job.status, job.currentStage);
                    const durationDays = getDurationDays(job.createdAt, today);
                    const overdue = durationDays >= 3;
                    return (
                      <tr
                        key={job.id}
                        className="border-b border-slate-100 hover:bg-slate-50"
                      >
                        <td className="py-3 text-xs text-slate-500">
                          {new Date(job.createdAt).toLocaleString("zh-CN", { hour12: false })}
                        </td>
                        <td className="py-3">
                          <span
                            className={`rounded-full border px-2 py-1 text-xs ${
                              overdue
                                ? "border-2 border-red-400 bg-red-50 text-red-700 shadow-[0_0_0_2px_rgba(239,68,68,0.08)]"
                                : "border-slate-200 bg-slate-50 text-slate-600"
                            }`}
                          >
                            {durationDays}天{overdue ? " !" : ""}
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
                            {STAGE_ORDER.map((stage) => (
                              <option key={stage} value={stage}>
                                {STAGES[stage].label}
                              </option>
                            ))}
                          </select>
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
