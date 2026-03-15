import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button, Card } from "@/components/ui";
import { Mail, Search, X } from "lucide-react";

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
  firstSent?: string;
  lastSent: string;
  lastReply?: string;
  nextFollowUp?: string;
};

const summaryCards: SummaryCard[] = [
  { label: "Needs PO", value: 46, note: "所有仍在跟进的工单" },
  { label: "Draft", value: 8, note: "未发出 request" },
  { label: "Awaiting Reply", value: 17, note: "已发邮件，等待商户回复" },
  { label: "Escalation Required", value: 9, note: "催发 2 次后仍未回复，需 admin 处理" },
  { label: "Pending Confirmation", value: 7, note: "已检测到候选 PO" },
  { label: "PO Confirmed", value: 14, note: "人工确认并落库" },
];

const jobs: PoJob[] = [
  {
    id: "226",
    plate: "QZT482",
    customer: "Fleetline Logistics",
    supplier: "parts@ultra.co.nz",
    status: "Escalation Required",
    detectedPo: "98431-UL",
    unreadReplies: 2,
    followUpCount: 2,
    firstSent: "2026-03-13 09:00",
    lastSent: "2026-03-14 10:00",
    lastReply: "2026-03-14 14:18",
    nextFollowUp: "Now",
  },
  {
    id: "241",
    plate: "JHA771",
    customer: "North City Rentals",
    supplier: "service@metroparts.co.nz",
    status: "Awaiting Reply",
    unreadReplies: 0,
    followUpCount: 1,
    firstSent: "2026-03-14 06:30",
    lastSent: "2026-03-14 11:30",
    nextFollowUp: "Mon 09:00",
  },
  {
    id: "255",
    plate: "PWE903",
    customer: "Apex Panel Care",
    supplier: "orders@apexparts.co.nz",
    status: "PO Confirmed",
    confirmedPo: "PO-884102",
    unreadReplies: 0,
    followUpCount: 0,
    firstSent: "2026-03-13 09:05",
    lastSent: "2026-03-13 09:05",
    lastReply: "2026-03-13 11:42",
  },
  {
    id: "263",
    plate: "LKC115",
    customer: "A1 Insurance Repairs",
    supplier: "team@impactsupply.co.nz",
    status: "Draft",
    unreadReplies: 0,
    followUpCount: 0,
    firstSent: "-",
    lastSent: "-",
  },
  {
    id: "274",
    plate: "TMM908",
    customer: "Atlas Claims",
    supplier: "ops@alliedparts.co.nz",
    status: "Pending Confirmation",
    detectedPo: "PO-11728",
    unreadReplies: 1,
    followUpCount: 1,
    firstSent: "2026-03-14 08:20",
    lastSent: "2026-03-14 08:20",
    lastReply: "2026-03-14 12:02",
  },
];

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

export function PoDashboardPreviewPage() {
  const navigate = useNavigate();
  const [selectedFilter, setSelectedFilter] = useState<SummaryFilter>("Needs PO");
  const [searchText, setSearchText] = useState("");
  const [confirmingJob, setConfirmingJob] = useState<PoJob | null>(null);

  const filteredJobs = useMemo(() => {
    const normalizedSearch = searchText.trim().toLowerCase();

    return jobs.filter((job) => {
      const matchesSummary = selectedFilter === "Needs PO" ? true : job.status === selectedFilter;
      const matchesSearch =
        !normalizedSearch ||
        job.id.toLowerCase().includes(normalizedSearch) ||
        job.plate.toLowerCase().includes(normalizedSearch) ||
        job.customer.toLowerCase().includes(normalizedSearch) ||
        job.supplier.toLowerCase().includes(normalizedSearch) ||
        (job.confirmedPo || job.detectedPo || "").toLowerCase().includes(normalizedSearch);

      return matchesSummary && matchesSearch;
    });
  }, [searchText, selectedFilter]);

  const canSendFollowUp = (job: PoJob) => job.status === "Awaiting Reply";

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--ds-muted)]">Preview</div>
          <h1 className="text-3xl font-semibold tracking-[-0.04em] text-[var(--ds-text)]">PO Operations Dashboard</h1>
          <p className="mt-2 max-w-3xl text-sm text-[var(--ds-muted)]">
            KPI 卡可直接筛选列表。点击某个 job 后，直接跳到 Job Detail 的 PO tab 处理。
          </p>
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
            <div className="mt-3 text-3xl font-semibold tracking-[-0.04em]">{card.value}</div>
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
                当前 KPI：<span className="font-medium text-[var(--ds-text)]">{selectedFilter}</span>
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
                    <div className="mt-1 text-xs font-semibold text-[var(--ds-primary)]">Next: {job.nextFollowUp || "-"}</div>
                  </td>
                  <td className="px-5 py-4 align-top text-right">
                    {canSendFollowUp(job) ? (
                      <div
                        className="inline-flex"
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
                      </div>
                    ) : (
                      <span className="text-sm text-slate-300">-</span>
                    )}
                  </td>
                </tr>
              ))}
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
              <Button variant="primary" className="h-10 px-4" leftIcon={<Mail className="h-4 w-4" />} onClick={() => setConfirmingJob(null)}>
                确认发送
              </Button>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
