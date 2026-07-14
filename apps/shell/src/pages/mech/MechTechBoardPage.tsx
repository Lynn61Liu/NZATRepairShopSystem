import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Archive,
  CheckCircle2,
  Clock3,
  ExternalLink,
  KeyRound,
  PackageCheck,
  RefreshCw,
  Search,
  Settings2,
  Wrench,
} from "lucide-react";
import { Button, useToast } from "@/components/ui";
import { lightOnJobLightBinding, updateJobStatus } from "@/features/jobDetail/api/jobDetailApi";
import {
  fetchMechBoard,
  MECH_WORKFLOW_LABELS,
  updateMechBoardSettings,
  updateMechWorkflow,
  type MechBoardJob,
  type MechBoardSortOrder,
  type MechWorkflowStatus,
} from "@/features/mechWorkflow";

type BoardTab = "todo" | "parts" | "ready" | "delivered";

const TAB_STATUSES: Record<BoardTab, MechWorkflowStatus[]> = {
  todo: ["waiting_repair", "wof_queue"],
  parts: ["waiting_parts", "parts_transit"],
  ready: ["repair_completed", "ready_pickup"],
  delivered: ["delivered"],
};

const DISTRIBUTION_STATUSES: MechWorkflowStatus[] = [
  "waiting_parts",
  "parts_transit",
  "waiting_repair",
  "wof_queue",
  "repair_completed",
  "ready_pickup",
];

const STATUS_TONE: Record<MechWorkflowStatus, string> = {
  on_hold: "bg-slate-100 text-slate-600",
  waiting_parts: "bg-amber-100 text-amber-800",
  parts_transit: "bg-violet-100 text-violet-700",
  waiting_repair: "bg-sky-100 text-sky-700",
  repair_completed: "bg-emerald-100 text-emerald-700",
  wof_queue: "bg-orange-100 text-orange-700",
  ready_pickup: "bg-green-100 text-green-700",
  delivered: "bg-slate-100 text-slate-600",
};

const STATUS_BAR_TONE: Record<MechWorkflowStatus, string> = {
  on_hold: "bg-slate-400",
  waiting_parts: "bg-amber-500",
  parts_transit: "bg-violet-500",
  waiting_repair: "bg-sky-500",
  repair_completed: "bg-emerald-500",
  wof_queue: "bg-orange-500",
  ready_pickup: "bg-green-500",
  delivered: "bg-slate-500",
};

const AUTO_REFRESH_MS = 5 * 60 * 1000;

function getNextAction(job: MechBoardJob): { label: string; status: MechWorkflowStatus } | null {
  if (job.status === "waiting_repair") {
    return { label: "修理/检查完成", status: "repair_completed" };
  }
  if (job.status === "wof_queue") return { label: "修理/检查完成", status: "repair_completed" };
  if (job.status === "repair_completed") return { label: "可以取车", status: "ready_pickup" };
  if (job.status === "ready_pickup") return { label: "交车完毕", status: "delivered" };
  return null;
}

function daysInShop(createdAt: string) {
  const created = new Date(createdAt);
  if (Number.isNaN(created.getTime())) return 0;
  return Math.max(1, Math.floor((Date.now() - created.getTime()) / 86400000) + 1);
}

function formatEntryDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("zh-CN");
}

export function MechTechBoardPage({ standalone = false }: { standalone?: boolean }) {
  const [jobs, setJobs] = useState<MechBoardJob[]>([]);
  const [tab, setTab] = useState<BoardTab>("todo");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [lightingId, setLightingId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [archiving, setArchiving] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [sortOrder, setSortOrder] = useState<MechBoardSortOrder>("newest_first");
  const [draftSortOrder, setDraftSortOrder] = useState<MechBoardSortOrder>("newest_first");
  const [savingSettings, setSavingSettings] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const res = await fetchMechBoard();
    if (res.ok && res.data) {
      setJobs(Array.isArray(res.data.jobs) ? res.data.jobs : []);
      const nextSortOrder = res.data.settings?.sortOrder ?? "newest_first";
      setSortOrder(nextSortOrder);
      setDraftSortOrder(nextSortOrder);
      setLastUpdatedAt(new Date());
      setError(null);
    } else {
      setError(res.error || "加载机修看板失败");
    }
    if (!silent) setLoading(false);
  }, []);

  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);
  useEffect(() => {
    const timer = window.setInterval(() => void load(true), AUTO_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [load]);
  useEffect(() => {
    const reloadForSettings = () => void load(true);
    window.addEventListener("storage", reloadForSettings);
    window.addEventListener("mech-board:settings-updated", reloadForSettings);
    window.addEventListener("mech-board:workflow-updated", reloadForSettings);
    return () => {
      window.removeEventListener("storage", reloadForSettings);
      window.removeEventListener("mech-board:settings-updated", reloadForSettings);
      window.removeEventListener("mech-board:workflow-updated", reloadForSettings);
    };
  }, [load]);

  const visibleJobs = useMemo(() => jobs.filter((job) => job.status !== "on_hold"), [jobs]);
  const activeJobs = useMemo(() => visibleJobs.filter((job) => job.status !== "delivered"), [visibleJobs]);
  const tabCount = useCallback(
    (key: BoardTab) => visibleJobs.filter((job) => TAB_STATUSES[key].includes(job.status)).length,
    [visibleJobs]
  );
  const filteredJobs = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return visibleJobs
      .filter((job) => {
        if (!TAB_STATUSES[tab].includes(job.status)) return false;
        if (!keyword) return true;
        return [job.customerCode, job.plate, job.make, job.model, job.notes, ...job.workItems, ...job.parts.descriptions]
          .join(" ")
          .toLowerCase()
          .includes(keyword);
      })
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [search, tab, visibleJobs]);
  const topFive = useMemo(
    () => [...activeJobs].sort((a, b) => daysInShop(b.createdAt) - daysInShop(a.createdAt)).slice(0, 5),
    [activeJobs]
  );
  const stageCounts = useMemo(() => {
    const counts = {} as Record<MechWorkflowStatus, number>;
    for (const status of DISTRIBUTION_STATUSES) counts[status] = 0;
    for (const job of activeJobs) counts[job.status] = (counts[job.status] ?? 0) + 1;
    return counts;
  }, [activeJobs]);
  const maxStageCount = Math.max(1, ...DISTRIBUTION_STATUSES.map((status) => stageCounts[status] ?? 0));
  const allFilteredSelected = filteredJobs.length > 0 && filteredJobs.every((job) => selectedIds.has(job.id));

  const handleAction = async (job: MechBoardJob) => {
    const action = getNextAction(job);
    if (!action) return;
    setUpdatingId(job.id);
    const res = await updateMechWorkflow(job.id, action.status);
    if (res.ok) {
      await load(true);
      toast.success(`${job.plate} 已更新`);
    } else toast.error(res.error || "更新状态失败");
    setUpdatingId(null);
  };

  const handleFindKey = async (job: MechBoardJob) => {
    if (!job.lightBindingId) return;
    setLightingId(job.id);
    const res = await lightOnJobLightBinding(job.lightBindingId);
    if (res.ok) toast.success(`${job.plate} 找钥匙指令已发送`);
    else toast.error(res.error || "找钥匙失败");
    setLightingId(null);
  };

  const archiveJobs = async (jobIds: string[]) => {
    if (jobIds.length === 0) return;
    if (!window.confirm(`确认归档 ${jobIds.length} 条工单吗？`)) return;
    setArchiving(true);
    const results = await Promise.all(jobIds.map((id) => updateJobStatus(id, "Archived")));
    const failed = results.filter((result) => !result.ok).length;
    if (failed > 0) toast.error(`${failed} 条工单归档失败`);
    else toast.success(`${jobIds.length} 条工单已归档`);
    setSelectedIds(new Set());
    await load(true);
    setArchiving(false);
  };

  const saveDisplaySettings = async () => {
    setSavingSettings(true);
    const res = await updateMechBoardSettings(draftSortOrder);
    if (res.ok && res.data) {
      setSortOrder(res.data.sortOrder);
      setSettingsOpen(false);
      await load(true);
      localStorage.setItem("mech-board:settings-updated", String(Date.now()));
      window.dispatchEvent(new Event("mech-board:settings-updated"));
      toast.success(res.data.sortOrder === "newest_first" ? "师傅看板已改为新工单优先" : "师傅看板已改为旧工单优先");
    } else {
      toast.error(res.error || "保存显示顺序失败");
    }
    setSavingSettings(false);
  };

  const tabs: Array<{ key: BoardTab; label: string }> = [
    { key: "todo", label: "全部待办" },
    { key: "parts", label: "等配件" },
    { key: "ready", label: "可以交车" },
    { key: "delivered", label: "已交车" },
  ];
  const techText = "text-base";

  return (
    <div className={`${standalone ? "min-h-screen" : "h-full overflow-y-auto rounded-2xl"} bg-[#f6f8fb]`}>
      <header className="border-b border-slate-200 bg-white px-6 py-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-blue-600 text-white">
              <Wrench className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-slate-800">NZAT MECH Board — 机修看板</h1>
              <p className="text-xs text-slate-500">
                {standalone ? "Mechanic To Do List" : "管理员视图 · MECH / WOF 工作管理"}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {!standalone ? (
              <>
                <Button
                  variant="ghost"
                  leftIcon={<Settings2 className="h-4 w-4" />}
                  onClick={() => {
                    setDraftSortOrder(sortOrder);
                    setSettingsOpen(true);
                  }}
                >
                  显示顺序设置
                </Button>
                <Button href="/mech-tech" target="_blank" variant="ghost" leftIcon={<ExternalLink className="h-4 w-4" />}>
                  打开师傅看板
                </Button>
              </>
            ) : null}
            <Button
              variant="ghost"
              leftIcon={<RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />}
              onClick={() => void load()}
              disabled={loading}
            >
              刷新
            </Button>
          </div>
        </div>
      </header>

      <main className={`space-y-5 p-6 ${standalone ? "mx-auto max-w-[1600px]" : ""}`}>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-2xl border border-sky-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-500"><Wrench className="h-4 w-4 text-sky-600" />当前待办</div>
            <div className="mt-2 text-3xl font-bold text-sky-700">{tabCount("todo")}</div>
          </div>
          <div className="rounded-2xl border border-amber-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-500"><Clock3 className="h-4 w-4 text-amber-600" />等待配件</div>
            <div className="mt-2 text-3xl font-bold text-amber-700">{tabCount("parts")}</div>
          </div>
          <div className="rounded-2xl border border-emerald-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-500"><CheckCircle2 className="h-4 w-4 text-emerald-600" />可以交车</div>
            <div className="mt-2 text-3xl font-bold text-emerald-700">{tabCount("ready")}</div>
          </div>
          <div className="rounded-2xl border border-violet-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-500"><PackageCheck className="h-4 w-4 text-violet-600" />配件已到</div>
            <div className="mt-2 text-3xl font-bold text-violet-700">{visibleJobs.filter((job) => job.parts.allArrived).length}</div>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-sm font-semibold text-slate-700">状态分布</div>
            <div className="mt-4 flex h-44 items-end gap-4">
              {DISTRIBUTION_STATUSES.map((status) => {
                const value = stageCounts[status] ?? 0;
                const height = value === 0 ? 6 : Math.max(18, Math.round((value / maxStageCount) * 130));
                return (
                  <div key={status} className="flex min-w-0 flex-1 flex-col items-center gap-2">
                    <div className="text-xs font-bold text-slate-600">{value}</div>
                    <div className={`w-9 rounded-t-lg ${STATUS_BAR_TONE[status]}`} style={{ height: `${height}px` }} />
                    <div className="text-center text-[11px] leading-tight text-slate-500">{MECH_WORKFLOW_LABELS[status]}</div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="text-sm font-semibold text-slate-700">在店时间 Top 5（最长）</div>
            <div className="mt-4 space-y-3">
              {topFive.map((job) => (
                <div key={job.id}>
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="truncate font-semibold text-slate-700">{job.plate} · {job.year} {job.make} {job.model}</span>
                    <span className="shrink-0 font-bold text-amber-600">{daysInShop(job.createdAt)}天</span>
                  </div>
                  <div className="mt-1.5 h-2 rounded-full bg-slate-100">
                    <div className="h-2 rounded-full bg-amber-400" style={{ width: `${Math.min(100, daysInShop(job.createdAt) * 5)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-2">
              {tabs.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => setTab(item.key)}
                  className={`rounded-full px-4 py-2 font-semibold ${standalone ? "text-base" : "text-sm"} ${tab === item.key ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
                >
                  {item.label} ({tabCount(item.key)})
                </button>
              ))}
            </div>
            <div className="flex min-w-[280px] items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              <Search className="h-4 w-4 text-slate-400" />
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索 Code、车牌、车型、工作内容" className="w-full bg-transparent text-base outline-none" />
            </div>
          </div>
          {!standalone ? (
            <div className="mt-4 flex items-center gap-3 border-t border-slate-100 pt-4">
              <Button
                variant="ghost"
                disabled={selectedIds.size === 0 || archiving}
                leftIcon={<Archive className="h-4 w-4" />}
                onClick={() => void archiveJobs([...selectedIds])}
              >
                批量归档{selectedIds.size ? ` (${selectedIds.size})` : ""}
              </Button>
            </div>
          ) : null}
          <div className="mt-3 text-xs text-slate-400">
            每 5 分钟自动刷新；On Hold 和已归档工单不会显示
            {lastUpdatedAt ? ` · 上次刷新 ${lastUpdatedAt.toLocaleString("zh-CN", { hour12: false })}` : ""}
          </div>
        </div>

        {error ? <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-600">{error}</div> : null}
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className={`min-w-[1180px] w-full text-slate-600 ${techText}`}>
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-sm font-semibold text-slate-500">
                {!standalone ? (
                  <th className="w-12 px-4 py-3">
                    <input
                      type="checkbox"
                      aria-label="选择当前列表全部工单"
                      checked={allFilteredSelected}
                      onChange={(event) => {
                        const next = new Set(selectedIds);
                        filteredJobs.forEach((job) => event.target.checked ? next.add(job.id) : next.delete(job.id));
                        setSelectedIds(next);
                      }}
                    />
                  </th>
                ) : null}
                <th className={`${standalone ? "px-4" : "w-[110px] px-3"} py-3`}>进店时间</th>
                <th className={`${standalone ? "px-4" : "w-[90px] px-2"} py-3`}>在店时间</th>
                {!standalone ? <th className="w-[90px] px-3 py-3">Code</th> : null}
                <th className="px-4 py-3">车牌号</th>
                <th className="px-4 py-3">车型</th>
                <th className="px-4 py-3">状态</th>
                <th className="px-4 py-3">工作内容 / 备注</th>
                <th className="px-4 py-3">配件</th>
                <th className="px-4 py-3 text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredJobs.map((job, index) => {
                const action = getNextAction(job);
                const selected = selectedIds.has(job.id);
                return (
                  <tr key={job.id} className={`border-b border-slate-100 hover:bg-blue-50/40 ${!standalone && index % 2 === 1 ? "bg-slate-50/70" : "bg-white"}`}>
                    {!standalone ? (
                      <td className="px-4 py-4">
                        <input
                          type="checkbox"
                          aria-label={`选择工单 ${job.plate}`}
                          checked={selected}
                          onChange={(event) => {
                            const next = new Set(selectedIds);
                            if (event.target.checked) next.add(job.id); else next.delete(job.id);
                            setSelectedIds(next);
                          }}
                        />
                      </td>
                    ) : null}
                    <td className={`whitespace-nowrap py-4 font-medium text-slate-600 ${standalone ? "px-4" : "px-3"}`}>{formatEntryDate(job.createdAt)}</td>
                    <td className={`py-4 ${standalone ? "px-4" : "px-2"}`}>
                      <span className={`inline-flex min-w-[58px] justify-center rounded-full px-2.5 py-1.5 text-base font-bold ${daysInShop(job.createdAt) >= 3 ? "bg-red-50 text-red-700" : "bg-slate-100 text-slate-700"}`}>{daysInShop(job.createdAt)}天</span>
                    </td>
                    {!standalone ? <td className="px-3 py-4 text-base font-bold text-blue-700">{job.customerCode || "—"}</td> : null}
                    <td className="px-4 py-4">
                      {standalone ? (
                        <span className="rounded-md bg-slate-900 px-3 py-1.5 text-lg font-black tracking-wide text-white">{job.plate || `#${job.id}`}</span>
                      ) : (
                        <Link to={`/jobs/${job.id}`} className="rounded-md bg-slate-900 px-2.5 py-1.5 text-base font-bold text-white hover:bg-blue-600">{job.plate || `#${job.id}`}</Link>
                      )}
                    </td>
                    <td className="px-4 py-4 text-base font-semibold text-slate-800">{job.year} {job.make} {job.model}</td>
                    <td className="px-4 py-4">
                      <span className={`rounded-full px-3 py-1.5 font-semibold ${STATUS_TONE[job.status]}`}>{MECH_WORKFLOW_LABELS[job.status]}</span>
                      {job.partsArrivedAt ? <div className="mt-2 font-semibold text-emerald-600">✓ 配件到达</div> : null}
                    </td>
                    <td className={`max-w-[360px] whitespace-pre-wrap px-4 py-4 leading-relaxed ${standalone ? "text-lg font-semibold text-slate-900" : "text-base font-medium text-slate-700"}`}>
                      {job.workItems.length ? job.workItems.join("、") : job.notes || "—"}
                    </td>
                    <td className={`max-w-[240px] px-4 py-4 ${standalone ? "text-base" : "text-sm"}`}>
                      {job.parts.total ? <><div className="font-semibold">{job.parts.completed}/{job.parts.total} 已到</div><div className="mt-1 line-clamp-2 text-slate-500">{job.parts.descriptions.join("、")}</div></> : "—"}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex justify-end gap-2">
                        {job.lightBindingId ? (
                          <button type="button" title="找钥匙" disabled={lightingId === job.id} onClick={() => void handleFindKey(job)} className={`inline-flex items-center justify-center rounded-lg border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 disabled:opacity-50 ${standalone ? "h-12 w-12" : "h-9 w-9"}`}>
                            <KeyRound className={standalone ? "h-6 w-6" : "h-4 w-4"} />
                          </button>
                        ) : null}
                        {action ? <Button variant="ghost" className={`${standalone ? "!h-12 px-5 text-base" : ""} font-bold ${action.status === "repair_completed" ? "!border-blue-600 !bg-blue-600 !text-white hover:!bg-blue-700" : ""}`} disabled={updatingId === job.id} onClick={() => void handleAction(job)}>{updatingId === job.id ? "更新中..." : action.label}</Button> : null}
                        {!standalone ? (
                          <button type="button" title="归档工单" disabled={archiving} onClick={() => void archiveJobs([job.id])} className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:border-red-200 hover:bg-red-50 hover:text-red-600 disabled:opacity-50">
                            <Archive className="h-4 w-4" />
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {!loading && filteredJobs.length === 0 ? <tr><td colSpan={standalone ? 8 : 10} className="px-4 py-12 text-center text-base text-slate-400">当前没有需要显示的车辆</td></tr> : null}
              {loading ? <tr><td colSpan={standalone ? 8 : 10} className="px-4 py-12 text-center text-base text-slate-400">加载中...</td></tr> : null}
            </tbody>
          </table>
        </div>
      </main>

      {!standalone && settingsOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4">
          <div role="dialog" aria-modal="true" aria-labelledby="mech-sort-title" className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="mech-sort-title" className="text-xl font-bold text-slate-900">师傅看板显示顺序</h2>
                <p className="mt-1 text-sm text-slate-500">此设置会保存到系统，并应用到所有设备上的师傅看板。</p>
              </div>
              <button type="button" aria-label="关闭显示顺序设置" onClick={() => setSettingsOpen(false)} className="rounded-lg px-2 py-1 text-xl text-slate-400 hover:bg-slate-100 hover:text-slate-700">×</button>
            </div>
            <div className="mt-5 space-y-3">
              <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 ${draftSortOrder === "newest_first" ? "border-blue-500 bg-blue-50" : "border-slate-200"}`}>
                <input type="radio" name="mech-sort-order" value="newest_first" checked={draftSortOrder === "newest_first"} onChange={() => setDraftSortOrder("newest_first")} className="mt-1" />
                <span><span className="block font-bold text-slate-800">新工单优先</span><span className="mt-1 block text-sm text-slate-500">最新进店的车辆显示在最前面。</span></span>
              </label>
              <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 ${draftSortOrder === "oldest_first" ? "border-blue-500 bg-blue-50" : "border-slate-200"}`}>
                <input type="radio" name="mech-sort-order" value="oldest_first" checked={draftSortOrder === "oldest_first"} onChange={() => setDraftSortOrder("oldest_first")} className="mt-1" />
                <span><span className="block font-bold text-slate-800">旧工单优先</span><span className="mt-1 block text-sm text-slate-500">在店时间最长的车辆显示在最前面。</span></span>
              </label>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="ghost" disabled={savingSettings} onClick={() => setSettingsOpen(false)}>取消</Button>
              <Button variant="primary" disabled={savingSettings} onClick={() => void saveDisplaySettings()}>{savingSettings ? "保存中..." : "保存设置"}</Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
