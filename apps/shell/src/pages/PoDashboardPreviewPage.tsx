import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Card, useToast } from "@/components/ui";
import { AlertTriangle, Mail, Search, X } from "lucide-react";
import { requestJson } from "@/utils/api";
import { subscribePoDashboardRefresh } from "@/utils/refreshSignals";

type SummaryFilter = "Needs PO" | "Draft" | "Awaiting Reply" | "Escalation Required" | "Pending Confirmation" | "PO Confirmed";

type SummaryCard = {
  label: SummaryFilter;
  value: number;
  note: string;
};

type PoJob = {
  id: string;
  plate: string;
  customer: string;
  supplier: string;
  status: Exclude<SummaryFilter, "All" | "Needs PO">;
  confirmedPo?: string;
  detectedPo?: string;
  unreadReplies: number;
  followUpCount: number;
  followUpEnabled: boolean;
  firstSent?: string;
  lastSent: string;
  lastReply?: string;
  nextFollowUp?: string;
};

type DashboardSummaryResponse = {
  summary: {
    needsPo: number;
    draft: number;
    awaitingReply: number;
    escalationRequired: number;
    pendingConfirmation: number;
    poConfirmed: number;
  };
  generatedAt: string;
};

type JobsQueueResponse = {
  items: PoJob[];
  total: number;
};

type SendFollowUpResponse = {
  success: boolean;
  jobId: number;
  status: string;
  followUpCount: number;
  lastFollowUpSentAt: string | null;
  nextFollowUpDueAt: string | null;
};

type CancelFollowUpResponse = {
  success: boolean;
  jobId: number;
  status: string;
  followUpEnabled: boolean;
  followUpCount: number;
  lastFollowUpSentAt: string | null;
  nextFollowUpDueAt: string | null;
};

function kpiCardClasses(isActive: boolean) {
  return isActive
    ? "border-[var(--ds-primary)] bg-[var(--ds-primary)] text-white"
    : "border-[var(--ds-border)] bg-white text-[var(--ds-text)] hover:border-[var(--ds-primary)]";
}

function statusClasses(status: PoJob["status"]) {
  switch (status) {
    case "Escalation Required":
      return "bg-[var(--ds-primary)] text-white";
    case "Awaiting Reply":
      return "bg-slate-100 text-slate-700";
    case "Pending Confirmation":
      return "bg-amber-100 text-amber-700";
    case "PO Confirmed":
      return "bg-emerald-100 text-emerald-700";
    default:
      return "bg-sky-100 text-sky-700";
  }
}

function showNextFollowUp(job: PoJob) {
  return job.followUpEnabled && job.status === "Awaiting Reply" && Boolean(job.nextFollowUp && job.nextFollowUp !== "-");
}

export function PoDashboardPreviewPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [selectedFilter, setSelectedFilter] = useState<SummaryFilter>("Needs PO");
  const [searchText, setSearchText] = useState("");
  const [confirmingJob, setConfirmingJob] = useState<PoJob | null>(null);
  const [summary, setSummary] = useState<DashboardSummaryResponse["summary"] | null>(null);
  const [jobs, setJobs] = useState<PoJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sendingFollowUp, setSendingFollowUp] = useState(false);
  const [cancellingFollowUpJobId, setCancellingFollowUpJobId] = useState<string | null>(null);

  const summaryCards: SummaryCard[] = useMemo(
    () => [
      { label: "Needs PO", value: summary?.needsPo ?? 0, note: " All Jobs" },
      { label: "Draft", value: summary?.draft ?? 0, note: "Not Sent Request Email" },
      { label: "Awaiting Reply", value: summary?.awaitingReply ?? 0, note: "Email Sent, Awaiting Reply or Follow-up" },
      { label: "Escalation Required", value: summary?.escalationRequired ?? 0, note: "Not Replied After 2 Reminders" },
      { label: "Pending Confirmation", value: summary?.pendingConfirmation ?? 0, note: "PO Detected, Awaiting Manual Confirmation" },
      { label: "PO Confirmed", value: summary?.poConfirmed ?? 0, note: "PO Confirmed" },
    ],
    [summary]
  );

  const loadSummary = async () => {
    const res = await requestJson<DashboardSummaryResponse>("/api/po/dashboard");
    if (!res.ok || !res.data) {
      setLoadError(res.error || "Failed to load PO dashboard summary");
      setSummary(null);
      return;
    }

    setSummary(res.data.summary);
  };

  const loadJobs = async () => {
    setLoading(true);
    setLoadError(null);
    const statusParam = selectedFilter === "Needs PO" ? "" : selectedFilter.replace(/\s+/g, "");
    const query = new URLSearchParams();
    if (statusParam) query.set("status", statusParam);
    if (searchText.trim()) query.set("search", searchText.trim());

    const res = await requestJson<JobsQueueResponse>(`/api/po/jobs${query.toString() ? `?${query.toString()}` : ""}`);
    if (!res.ok || !res.data) {
      setLoadError(res.error || "Failed to load PO jobs queue");
      setJobs([]);
      setLoading(false);
      return;
    }

    setJobs(Array.isArray(res.data.items) ? res.data.items : []);
    setLoading(false);
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await loadSummary();
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    return subscribePoDashboardRefresh(() => {
      void loadSummary();
      void loadJobs();
    });
  }, [searchText, selectedFilter]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await loadJobs();
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, [searchText, selectedFilter]);

  const filteredJobs = useMemo(() => {
    return jobs;
  }, [jobs]);

  const canSendFollowUp = (job: PoJob) => job.status === "Awaiting Reply";

  const handleCancelFollowUp = async (jobId: string) => {
    if (cancellingFollowUpJobId) return;

    const confirmed = window.confirm("确认手动取消这个工单的自动催发吗？");
    if (!confirmed) return;

    setCancellingFollowUpJobId(jobId);
    const res = await requestJson<CancelFollowUpResponse>(`/api/po/jobs/${encodeURIComponent(jobId)}/cancel-follow-up`, {
      method: "POST",
    });

    if (!res.ok) {
      toast.error(res.error || "Failed to cancel follow-up");
      setCancellingFollowUpJobId(null);
      return;
    }

    toast.success("自动催发已取消");
    await loadSummary();
    await loadJobs();
    setCancellingFollowUpJobId(null);
  };

  const handleConfirmSendFollowUp = async () => {
    if (!confirmingJob || sendingFollowUp) return;

    setSendingFollowUp(true);
    const res = await requestJson<SendFollowUpResponse>(`/api/po/jobs/${encodeURIComponent(confirmingJob.id)}/send-follow-up`, {
      method: "POST",
    });

    if (!res.ok) {
      toast.error(res.error || "Failed to send follow-up");
      setSendingFollowUp(false);
      return;
    }

    toast.success("Follow-up email sent");
    setConfirmingJob(null);
    await loadSummary();
    await loadJobs();
    setSendingFollowUp(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>

          <h1 className="text-3xl font-semibold tracking-[-0.04em] text-[var(--ds-text)]">PO Operations Dashboard</h1>
         
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-6">
        {summaryCards.map((card) => (
          <button
            key={card.label}
            type="button"
            onClick={() => setSelectedFilter(card.label)}
            className={`rounded-[12px] border p-4 text-left shadow-sm transition ${kpiCardClasses(selectedFilter === card.label)}`}
          >
            <div className="text-xs font-semibold uppercase tracking-[0.14em]">{card.label}</div>
            <div className="mt-3 flex items-center gap-2 text-3xl font-semibold tracking-[-0.04em]">
              {card.label === "Escalation Required" ? (
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-yellow-300">
                  <AlertTriangle className="h-5 w-5 text-red-600" />
                </span>
              ) : null}
              <span>{card.value}</span>
            </div>
            <div className={`mt-2 text-xs ${selectedFilter === card.label ? "text-white/85" : "text-[var(--ds-muted)]"}`}>{card.note}</div>
          </button>
        ))}
      </div>

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-4 border-b border-[var(--ds-border)] px-5 py-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="text-lg font-semibold text-[var(--ds-text)]">PO Jobs Queue</div>
              <div className="text-sm text-[var(--ds-muted)]">
                Current <span className="font-medium text-[var(--ds-text)]">{selectedFilter}</span>
              </div>
            </div>
            <label className="flex items-center gap-2 rounded-xl border border-[var(--ds-border)] bg-white px-3 py-2 text-sm text-[var(--ds-muted)]">
              <Search className="h-4 w-4" />
              <input
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder="Search plate / supplier / PO"
                className="min-w-[260px] border-0 bg-transparent text-[var(--ds-text)] outline-none placeholder:text-slate-400"
              />
            </label>
          </div>

        </div>

        <div className="overflow-x-auto">
          {loadError ? <div className="px-5 py-4 text-sm text-red-600">{loadError}</div> : null}
          {loading ? <div className="px-5 py-4 text-sm text-[var(--ds-muted)]">Loading PO queue...</div> : null}
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-[0.12em] text-[var(--ds-muted)]">
                <th className="px-5 py-3">Job</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">PO</th>
                <th className="px-5 py-3">Unread</th>
                <th className="px-5 py-3">Timing</th>
                <th className="px-5 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredJobs.map((job) => (
                <tr
                  key={job.id}
                  className="cursor-pointer border-t border-slate-100 bg-white transition hover:bg-slate-50"
                  onClick={() => navigate(`/jobs/${job.id}?tab=PO`)}
                >
                  <td className="px-5 py-4 align-top">
                    <div className="font-semibold text-[var(--ds-text)]">JOB-{job.id} · {job.plate}</div>
                    <div className="mt-1 text-sm text-[var(--ds-muted)]">{job.customer}</div>
                    <div className="mt-1 text-xs text-slate-400">{job.supplier}</div>
                  </td>
                  <td className="px-5 py-4 align-top">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusClasses(job.status)}`}>
                      {job.status}
                    </span>
                    <div className="mt-2 text-xs text-slate-400">{job.followUpCount} follow-up sent</div>
                  </td>
                  <td className="px-5 py-4 align-top text-sm text-slate-700">
                    <div>{job.confirmedPo || job.detectedPo || "-"}</div>
                    <div className="mt-1 text-xs text-slate-400">
                      {job.confirmedPo ? "Confirmed" : job.detectedPo ? "Detected" : "Pending"}
                    </div>
                  </td>
                  <td className="px-5 py-4 align-top">
                    {job.unreadReplies > 0 ? (
                      <span className="inline-flex min-w-6 items-center justify-center rounded-full bg-red-100 px-2 py-1 text-xs font-semibold text-red-700">
                        {job.unreadReplies}
                      </span>
                    ) : (
                      <span className="text-sm text-slate-400">0</span>
                    )}
                  </td>
                  <td className="px-5 py-4 align-top text-sm text-slate-600">
                    <div>Last sent: {job.lastSent}</div>
                    <div className="mt-1">Last reply: {job.lastReply || "-"}</div>
                    {showNextFollowUp(job) ? (
                      <div className="mt-2">
                        <span className="inline-flex items-center rounded-full bg-[var(--ds-primary)] px-3 py-1 text-sm font-semibold text-white shadow-sm">
                          Next follow up: {job.nextFollowUp}
                        </span>
                      </div>
                    ) : null}
                  </td>
                  <td className="px-5 py-4 align-top text-right">
                    {canSendFollowUp(job) ? (
                      <div
                        className="inline-flex gap-2"
                        onClick={(event) => {
                          event.stopPropagation();
                        }}
                      >
                        <Button
                          variant="primary"
                          className="h-10 px-4"
                          leftIcon={<Mail className="h-4 w-4" />}
                          onClick={() => setConfirmingJob(job)}
                        >
                          发送催发
                        </Button>
                        {job.followUpEnabled ? (
                          <Button
                            className="h-10 px-4"
                            onClick={() => void handleCancelFollowUp(job.id)}
                            disabled={cancellingFollowUpJobId === job.id}
                          >
                            {cancellingFollowUpJobId === job.id ? "取消中..." : "取消催发"}
                          </Button>
                        ) : (
                          <Button className="h-10 px-4 border-slate-200 bg-slate-200 text-slate-500 hover:bg-slate-200" disabled>
                            已取消催发
                          </Button>
                        )}
                      </div>
                    ) : (
                      <span className="text-sm text-slate-300">-</span>
                    )}
                  </td>
                </tr>
              ))}
              {!loading && !loadError && filteredJobs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-10 text-center text-sm text-[var(--ds-muted)]">
                    No PO jobs matched the current filter.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Card>

      {confirmingJob ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <Card className="w-full max-w-lg p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-semibold text-[var(--ds-text)]">确认发送催发邮件</div>
                <div className="mt-1 text-sm text-[var(--ds-muted)]">
                  这只是预览弹层，用来确认手动动作是否合理。
                </div>
              </div>
              <button
                type="button"
                onClick={() => setConfirmingJob(null)}
                className="rounded-full p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-5 rounded-2xl border border-[var(--ds-border)] bg-slate-50 p-4 text-sm text-slate-600">
              <div className="font-semibold text-[var(--ds-text)]">JOB-{confirmingJob.id} · {confirmingJob.plate}</div>
              <div className="mt-1">{confirmingJob.customer}</div>
              <div className="mt-1">{confirmingJob.supplier}</div>
              <div className="mt-3">当前状态：{confirmingJob.status}</div>
              <div className="mt-1">第一次发送：{confirmingJob.firstSent || confirmingJob.lastSent}</div>
              <div className="mt-1">上次发出：{confirmingJob.lastSent}</div>
              <div className="mt-1">回复时间：{confirmingJob.lastReply || "-"}</div>
              <div className="mt-1">预计下次催发：{confirmingJob.nextFollowUp || "-"}</div>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <Button className="h-10 px-4" onClick={() => setConfirmingJob(null)}>
                取消
              </Button>
              <Button
                variant="primary"
                className="h-10 px-4"
                leftIcon={<Mail className="h-4 w-4" />}
                onClick={handleConfirmSendFollowUp}
                disabled={sendingFollowUp}
              >
                {sendingFollowUp ? "发送中..." : "确认发送"}
              </Button>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
