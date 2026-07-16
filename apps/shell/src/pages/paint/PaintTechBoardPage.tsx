import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  Archive,
  Car,
  CheckCircle2,
  ClipboardCheck,
  Droplets,
  ExternalLink,
  Hammer,
  PauseCircle,
  Paintbrush2,
  RefreshCw,
  Search,
  Settings2,
} from "lucide-react";
import { fetchPaintBoard, updatePaintStage } from "@/features/paint/api/paintApi";
import { updateJobStatus } from "@/features/jobDetail/api/jobDetailApi";
import { updateWofStatus as apiUpdateWofStatus } from "@/features/wof/api/wofApi";
import {
  getDurationDays,
  mapStageKey,
  normalizeDate,
  PAINT_STAGE_INDEX_BY_KEY,
  PAINT_STAGE_LABELS,
  PAINT_STAGE_ORDER,
  shouldHidePaintTechBoardJob,
  type PaintBoardJob,
  type StageKey,
} from "@/features/paint/paintBoard.utils";
import { Button, Pagination, Select, useToast } from "@/components/ui";
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
const SUMMARY_STAGE_ORDER = STAGE_ORDER.filter(
  (stage) => stage !== "on_hold" && stage !== "done" && stage !== "delivered"
);
const TECH_STAGE_ORDER = SUMMARY_STAGE_ORDER;
const AUTO_REFRESH_MS = 5 * 60 * 1000;

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

export function PaintTechBoardPage({ standalone = true }: { standalone?: boolean }) {
  const [jobs, setJobs] = useState<PaintBoardJob[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [updatingWofJobIds, setUpdatingWofJobIds] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState("");
  const [selectedStage, setSelectedStage] = useState<"all" | StageKey>("all");
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [archiving, setArchiving] = useState(false);
  const pageSize = 30;
  const mountedRef = useRef(true);
  const toast = useToast();

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
      if (mountedRef.current) setLoadError(res.error || "加载失败");
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
        return !shouldHidePaintTechBoardJob(job);
      }),
    [jobs]
  );

  const today = normalizeDate(new Date());
  const statsJobs = useMemo(
    () =>
      jobs.filter((job) => {
        return !shouldHidePaintTechBoardJob(job);
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
      const haystack = `${job.customerCode ?? ""} ${job.plate} ${job.make ?? ""} ${job.model ?? ""} ${job.notes ?? ""}`.toLowerCase();
      return haystack.includes(keyword);
    });
  }, [visibleJobs, search, selectedStage]);

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
  }, [search, selectedStage, visibleJobs.length]);

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
    return [...visibleJobs]
      .map((job) => ({
        ...job,
        durationDays: getDurationDays(job.createdAt, today),
      }))
      .sort((a, b) => b.durationDays - a.durationDays)
      .slice(0, 5);
  }, [visibleJobs, today]);

  const handleStageChange = async (jobId: string, nextStage: StageKey) => {
    await updatePaintStage(jobId, PAINT_STAGE_INDEX_BY_KEY[nextStage]);
    const res = await fetchPaintBoard();
    if (res.ok) {
      const list = Array.isArray(res.data?.jobs) ? res.data.jobs : [];
      setJobs(list);
      setLastUpdatedAt(new Date());
    }
  };

  const handleWofStatusChange = async (jobId: string, nextStatus: "Todo" | "Checked") => {
    setUpdatingWofJobIds((prev) => ({ ...prev, [jobId]: true }));
    const res = await apiUpdateWofStatus(jobId, nextStatus);
    if (res.ok) {
      setJobs((prev) =>
        prev.map((job) =>
          job.id === jobId
            ? {
                ...job,
                wofStatus: nextStatus,
              }
            : job
        )
      );
      notifyWofScheduleRefresh();
    } else {
      setLoadError(res.error || "更新 WOF 状态失败");
    }
    setUpdatingWofJobIds((prev) => {
      const next = { ...prev };
      delete next[jobId];
      return next;
    });
  };

  const archiveJobs = async (jobIds: string[]) => {
    if (standalone || jobIds.length === 0) return;
    if (!window.confirm(`确认归档 ${jobIds.length} 条工单吗？`)) return;

    setArchiving(true);
    const results = await Promise.all(jobIds.map((id) => updateJobStatus(id, "Archived")));
    const failed = results.filter((result) => !result.ok).length;
    if (failed > 0) toast.error(`${failed} 条工单归档失败`);
    else toast.success(`${jobIds.length} 条工单已归档`);
    setSelectedIds(new Set());
    await load({ silent: true });
    setArchiving(false);
  };

  const allPageSelected =
    pagedJobs.length > 0 && pagedJobs.every((job) => selectedIds.has(job.id));

  return (
    <div className={`${standalone ? "min-h-screen" : "h-full overflow-y-auto rounded-2xl"} bg-[#f6f8fb]`}>
      <header className="border-b border-slate-200 bg-white">
        <div className={`flex items-center justify-between gap-3 px-6 ${standalone ? "mx-auto max-w-6xl py-4" : "py-5"}`}>
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-600 text-white">
              <Car className="h-5 w-5" />
            </div>
            <div>
              <div className={`${standalone ? "text-lg font-semibold" : "text-xl font-bold"} text-slate-800`}>
                NZAT PNP Board — 喷漆看板
              </div>
              <div className="text-xs text-slate-500">
                {standalone ? "Vehicle Painting Tracking Dashboard" : "管理员视图 · PNP 工作管理"}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!standalone ? (
              <Button href="/paint-tech" target="_blank" variant="ghost" leftIcon={<ExternalLink className="h-4 w-4" />}>
                打开喷漆师傅看板
              </Button>
            ) : null}
            <div className="text-xs text-slate-500">
              {new Date().toLocaleString("zh-CN", { hour12: false })}
            </div>
          </div>
        </div>
      </header>

      <main className={`flex flex-col gap-5 px-6 py-6 ${standalone ? "mx-auto max-w-7xl" : ""}`}>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <div className="flex items-center gap-3 text-sm font-semibold text-slate-700">
            <Button
              variant="ghost"
              className="h-9 rounded-[10px] border border-slate-200 bg-slate-50 px-3 text-slate-700 hover:bg-slate-100"
              leftIcon={<RefreshCw className={["h-4 w-4", loading ? "animate-spin" : ""].join(" ")} />}
              onClick={() => void load()}
              disabled={loading}
            >
              {loading ? "刷新中..." : "手动刷新"}
            </Button>
            <div className="flex items-center gap-2">
              <RefreshCw className="h-4 w-4 text-[var(--ds-primary)]" />
              Paint Tech Board 已启用 5 分钟自动刷新
            </div>
          </div>
          <div className="text-xs text-slate-500">
            每 5 分钟刷新一次，当前页面不显示 On Hold、已完成、已归档和交车完毕订单
            {lastUpdatedAt ? ` · 上次刷新 ${lastUpdatedAt.toLocaleString("zh-CN", { hour12: false })}` : ""}
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
              {SUMMARY_STAGE_ORDER.map((stage) => {
                const value = stageCounts[stage] ?? 0;
                const height = value === 0 ? 6 : Math.max(18, Math.round((value / maxStageCount) * 132));
                return (
                  <div key={stage} className="flex flex-1 flex-col items-center gap-2">
                    <div
                      className={`w-10 rounded-lg ${STAGES[stage].text}`}
                      style={{
                        height: `${height}px`,
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
              placeholder={standalone ? "搜索车牌、车型、工作内容..." : "搜索 Code、车牌、车型、工作内容..."}
              className={`w-full bg-transparent text-slate-700 outline-none ${standalone ? "text-sm" : "text-base"}`}
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
            {TECH_STAGE_ORDER.map((stage) => (
              <option key={stage} value={stage}>
                {STAGES[stage].label}
              </option>
            ))}
          </Select>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
              全部({visibleJobs.length})
            </span>
            {TECH_STAGE_ORDER.map((stage) => (
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
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div className={`${standalone ? "text-sm" : "text-base"} font-semibold text-slate-600`}>
              显示 {sortedJobs.length} / {visibleJobs.length} 辆车
            </div>
            {!standalone ? (
              <Button
                variant="ghost"
                disabled={selectedIds.size === 0 || archiving}
                leftIcon={<Archive className="h-4 w-4" />}
                onClick={() => void archiveJobs([...selectedIds])}
              >
                批量归档{selectedIds.size ? ` (${selectedIds.size})` : ""}
              </Button>
            ) : null}
          </div>
          {loading ? (
            <div className="py-8 text-center text-sm text-slate-400">加载中...</div>
          ) : loadError ? (
            <div className="py-8 text-center text-sm text-red-600">{loadError}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className={`w-full text-slate-600 ${standalone ? "min-w-[960px] text-sm" : "min-w-[1180px] text-base"}`}>
                <thead>
                  <tr className={`border-b border-slate-100 text-left font-semibold ${standalone ? "text-xs text-slate-400" : "text-sm text-slate-500"}`}>
                    {!standalone ? (
                      <th className="w-12 px-3 py-3">
                        <input
                          type="checkbox"
                          aria-label="选择当前页全部喷漆工单"
                          checked={allPageSelected}
                          onChange={(event) => {
                            const next = new Set(selectedIds);
                            pagedJobs.forEach((job) => event.target.checked ? next.add(job.id) : next.delete(job.id));
                            setSelectedIds(next);
                          }}
                        />
                      </th>
                    ) : null}
                    <th className="py-2">进厂时间</th>
                    <th className={`${standalone ? "py-2" : "w-[130px] min-w-[130px] px-3 py-2 whitespace-nowrap"}`}>在店时间</th>
                    {!standalone ? <th className="px-3 py-2">Code</th> : null}
                    <th className="py-2">车牌号</th>
                    <th className="py-2">车型</th>
                    <th className="py-2">状态</th>
                    <th className="py-2">WOF状态</th>
                    <th className="py-2">工作内容</th>
                    <th className="py-2 text-right">片数</th>
                    {!standalone ? <th className="px-3 py-2 text-right">操作</th> : null}
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
                        {!standalone ? (
                          <td className="px-3 py-4">
                            <input
                              type="checkbox"
                              aria-label={`选择工单 ${job.plate}`}
                              checked={selectedIds.has(job.id)}
                              onChange={(event) => {
                                const next = new Set(selectedIds);
                                if (event.target.checked) next.add(job.id);
                                else next.delete(job.id);
                                setSelectedIds(next);
                              }}
                            />
                          </td>
                        ) : null}
                        <td className={`${standalone ? "py-3 text-xs" : "py-4 text-base"} text-slate-500`}>
                          {new Date(job.createdAt).toLocaleDateString("zh-CN")}
                        </td>
                        <td className={standalone ? "py-3" : "w-[130px] min-w-[130px] whitespace-nowrap px-3 py-4"}>
                          <span
                            className={`rounded-full border px-2.5 py-1.5 ${standalone ? "text-xs" : "text-base font-bold"} ${
                              overdue
                                ? "border-2 border-red-400 bg-red-50 text-red-700 shadow-[0_0_0_2px_rgba(239,68,68,0.08)]"
                                : "border-slate-200 bg-slate-50 text-slate-600"
                            }`}
                          >
                            {durationDays}天{overdue ? " !" : ""}
                          </span>
                        </td>
                        {!standalone ? (
                          <td className="px-3 py-4 text-base font-bold text-blue-700">
                            {job.customerCode || "WI"}
                          </td>
                        ) : null}
                        <td className={standalone ? "py-3" : "py-4"}>
                          {standalone ? (
                            <span className="rounded-md bg-slate-900 px-2 py-1 text-xs font-semibold text-white">
                              {job.plate}
                            </span>
                          ) : (
                            <Link
                              to={`/jobs/${job.id}`}
                              className="rounded-md bg-slate-900 px-2.5 py-1.5 text-base font-bold text-white hover:bg-blue-600"
                            >
                              {job.plate || `#${job.id}`}
                            </Link>
                          )}
                        </td>
                        <td className={`${standalone ? "py-3" : "py-4 text-base font-semibold text-slate-800"}`}>
                          {job.year} {job.make} {job.model}
                        </td>
                        <td className={standalone ? "py-3" : "py-4"}>
                          <select
                            className={`rounded-full px-2 py-1 font-semibold ${standalone ? "text-xs" : "text-base"} ${STAGES[stageKey].pill} bg-transparent`}
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
                        <td className={standalone ? "py-3" : "py-4"}>
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
                                <option value="Todo">待查</option>
                                <option value="Checked">检查完成</option>
                              </select>
                            ) : null}
                            {job.wofStatus !== "Todo" && job.wofStatus !== "Checked" ? (
                              <span className="text-xs text-slate-300">—</span>
                            ) : null}
                          </div>
                        </td>
                        <td className={`${standalone ? "py-3 text-xs" : "py-4 text-base font-medium"} text-slate-600`}>
                          {extractServiceNote(job.notes) || "—"}
                        </td>
                        <td className={`${standalone ? "py-3" : "py-4"} text-right`}>
                          <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                            {job.panels ?? "—"}
                          </span>
                        </td>
                        {!standalone ? (
                          <td className="px-3 py-4 text-right">
                            <button
                              type="button"
                              title="归档工单"
                              disabled={archiving}
                              onClick={() => void archiveJobs([job.id])}
                              className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                            >
                              <Archive className="h-4 w-4" />
                            </button>
                          </td>
                        ) : null}
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
