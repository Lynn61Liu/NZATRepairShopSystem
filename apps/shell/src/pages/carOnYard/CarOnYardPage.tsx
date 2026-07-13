import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, Archive, CarFront, Clock3, ExternalLink, RefreshCw, Save, SearchX, Settings2 } from "lucide-react";
import { getXeroInvoiceUrl, XeroIcon } from "@/components/common/XeroButton";
import { GmailIcon } from "@/components/common/GmailSearchButton";
import { getGmailPlateSearchUrl } from "@/components/common/gmailSearch";
import { useToast } from "@/components/ui";
import { updateJobStatus } from "@/features/jobDetail/api/jobDetailApi";
import { requestJson } from "@/utils/api";
import { formatNzDateTime, parseTimestamp } from "@/utils/date";
import type { JobRow } from "@/types/JobType";

type JobsListResponse = {
  items?: JobRow[];
  totalItems?: number;
  totalPages?: number;
  currentPage?: number;
  pageSize?: number;
};

type ReportSettingsResponse = {
  enabled: boolean;
  recipients: string[];
  sendTimes: string[];
  subject: string;
  timeZoneId: string;
  lastSentAtUtc?: string | null;
  lastError?: string | null;
};

type ReportSettingsForm = {
  enabled: boolean;
  recipients: string;
  sendTimes: string;
  subject: string;
};

const REFRESH_MS = 5 * 60 * 1000;
const PAGE_SIZE = 200;
const WI_CODE = "WI";
const OVERDUE_DAYS = 4;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function getDealerCode(row: JobRow) {
  const code = row.customerCode?.trim();
  return code ? code.toUpperCase() : WI_CODE;
}

function getAgeDays(createdAt?: string) {
  const created = parseTimestamp(createdAt);
  if (!created) return 0;
  return Math.max(0, Math.floor((Date.now() - created.getTime()) / MS_PER_DAY));
}

function getAgeLabel(createdAt?: string) {
  const days = getAgeDays(createdAt);
  if (days <= 0) return "Today";
  if (days === 1) return "1 day";
  return `${days} days`;
}

function isOverdue(row: JobRow) {
  return getAgeDays(row.createdAt) > OVERDUE_DAYS;
}

function getAgeLevel(days: number) {
  if (days >= 8) return "danger" as const;
  if (days >= 5) return "warn" as const;
  return "normal" as const;
}

function formatLastUpdated(value: Date | null) {
  if (!value) return "Not loaded";
  return formatNzDateTime(value);
}

function normalizeRows(rows: JobRow[]) {
  return rows.map((row) => ({
    ...row,
    selectedTags: Array.isArray(row.selectedTags) ? row.selectedTags : [],
    poUnreadReplyCount: Number(row.poUnreadReplyCount ?? 0),
  }));
}

async function fetchAllOpenJobs(signal?: AbortSignal) {
  const first = await requestJson<JobsListResponse>(`/api/jobs?page=1&pageSize=${PAGE_SIZE}`, {
    cache: "no-store",
    signal,
  });

  if (!first.ok) {
    throw new Error(first.error || "Failed to load jobs");
  }

  const firstRows = Array.isArray(first.data?.items) ? first.data.items : [];
  const totalPages = Math.max(1, Number(first.data?.totalPages ?? 1));
  const allRows = [...firstRows];

  for (let page = 2; page <= totalPages; page += 1) {
    const res = await requestJson<JobsListResponse>(`/api/jobs?page=${page}&pageSize=${PAGE_SIZE}`, {
      cache: "no-store",
      signal,
    });
    if (!res.ok) {
      throw new Error(res.error || "Failed to load jobs");
    }
    allRows.push(...(Array.isArray(res.data?.items) ? res.data.items : []));
  }

  return normalizeRows(allRows);
}

function buildDealerSummaries(rows: JobRow[]) {
  const grouped = new Map<string, JobRow[]>();

  rows.forEach((row) => {
    const code = getDealerCode(row);
    grouped.set(code, [...(grouped.get(code) ?? []), row]);
  });

  return Array.from(grouped.entries())
    .map(([code, jobs]) => ({
      code,
      count: jobs.length,
      overdueCount: jobs.filter(isOverdue).length,
      maxAgeDays: jobs.reduce((max, job) => Math.max(max, getAgeDays(job.createdAt)), 0),
      jobs,
    }))
    .sort((a, b) => {
      if (getAgeLevel(b.maxAgeDays) !== getAgeLevel(a.maxAgeDays)) {
        const weight = { danger: 2, warn: 1, normal: 0 };
        return weight[getAgeLevel(b.maxAgeDays)] - weight[getAgeLevel(a.maxAgeDays)];
      }
      if (b.maxAgeDays !== a.maxAgeDays) return b.maxAgeDays - a.maxAgeDays;
      if (b.count !== a.count) return b.count - a.count;
      return a.code.localeCompare(b.code);
    });
}

export function CarOnYardPage({ standalone = false }: { standalone?: boolean }) {
  const [rows, setRows] = useState<JobRow[]>([]);
  const [selectedDealer, setSelectedDealer] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [archivingIds, setArchivingIds] = useState<Set<string>>(() => new Set());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [reportSettings, setReportSettings] = useState<ReportSettingsResponse | null>(null);
  const [settingsForm, setSettingsForm] = useState<ReportSettingsForm>({
    enabled: true,
    recipients: "info@nzautotech.co.nz",
    sendTimes: "09:30,17:30",
    subject: "Car On Yard",
  });
  const toast = useToast();

  const load = useCallback(async (signal?: AbortSignal, quiet = false) => {
    if (quiet) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      const data = await fetchAllOpenJobs(signal);
      setRows(data);
      setLastUpdated(new Date());
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Failed to load jobs");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);

    const timer = window.setInterval(() => {
      void load(undefined, true);
    }, REFRESH_MS);

    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [load]);

  useEffect(() => {
    if (standalone) return;
    let cancelled = false;

    const loadSettings = async () => {
      setSettingsLoading(true);
      const res = await requestJson<ReportSettingsResponse>("/api/car-on-yard/report-settings", { cache: "no-store" });
      if (!cancelled) {
        setSettingsLoading(false);
        if (res.ok && res.data) {
          setReportSettings(res.data);
          setSettingsForm({
            enabled: res.data.enabled,
            recipients: res.data.recipients.join(", "),
            sendTimes: res.data.sendTimes.join(", "),
            subject: res.data.subject || "Car On Yard",
          });
        }
      }
    };

    void loadSettings();
    return () => {
      cancelled = true;
    };
  }, [standalone]);

  const dealerSummaries = useMemo(() => buildDealerSummaries(rows), [rows]);
  const totalOverdue = useMemo(() => rows.filter(isOverdue).length, [rows]);

  useEffect(() => {
    if (!selectedDealer) return;
    if (!dealerSummaries.some((dealer) => dealer.code === selectedDealer)) {
      setSelectedDealer(null);
    }
  }, [dealerSummaries, selectedDealer]);

  const tableRows = useMemo(() => {
    const source = selectedDealer
      ? rows.filter((row) => getDealerCode(row) === selectedDealer)
      : rows.filter(isOverdue);

    return [...source].sort((a, b) => getAgeDays(b.createdAt) - getAgeDays(a.createdAt));
  }, [rows, selectedDealer]);

  const shellClass = standalone
    ? "min-h-full bg-[var(--ds-bg)] p-5"
    : "min-h-full";
  const contentClass = standalone
    ? "flex min-h-0 flex-1 flex-col gap-4"
    : "flex flex-col gap-4 pb-6";
  const jobsSectionClass = standalone
    ? "flex min-h-0 flex-1 flex-col overflow-hidden rounded-[8px] border border-[var(--ds-border)] bg-white"
    : "rounded-[8px] border border-[var(--ds-border)] bg-white";
  const tableScrollClass = standalone
    ? "min-h-0 flex-1 overflow-auto"
    : "overflow-x-auto";
  const tableGridClass =
    "grid min-w-[1120px] grid-cols-[116px_82px_76px_162px_minmax(170px,0.7fr)_minmax(320px,1.4fr)_116px]";

  const handleArchive = useCallback(
    async (jobId: string) => {
      setArchivingIds((prev) => new Set(prev).add(jobId));
      const res = await updateJobStatus(jobId, "Archived");
      setArchivingIds((prev) => {
        const next = new Set(prev);
        next.delete(jobId);
        return next;
      });

      if (!res.ok) {
        toast.error(res.error || "归档失败");
        return;
      }

      setRows((prev) => prev.filter((row) => row.id !== jobId));
      toast.success("工单已归档");
    },
    [toast]
  );

  const saveReportSettings = useCallback(async () => {
    setSettingsSaving(true);
    const res = await requestJson<ReportSettingsResponse>("/api/car-on-yard/report-settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        enabled: settingsForm.enabled,
        recipients: settingsForm.recipients,
        sendTimes: settingsForm.sendTimes,
        subject: settingsForm.subject,
        timeZoneId: "Pacific/Auckland",
      }),
    });
    setSettingsSaving(false);

    if (!res.ok || !res.data) {
      toast.error(res.error || "保存报告设置失败");
      return;
    }

    setReportSettings(res.data);
    setSettingsForm({
      enabled: res.data.enabled,
      recipients: res.data.recipients.join(", "),
      sendTimes: res.data.sendTimes.join(", "),
      subject: res.data.subject || "Car On Yard",
    });
    toast.success("报告设置已保存");
  }, [settingsForm, toast]);

  return (
    <div className={shellClass}>
      <div className={contentClass}>
        <header className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase text-[var(--ds-muted)]">
              <CarFront className="h-4 w-4" />
              Car On Yard
            </div>
            <h1 className="mt-1 text-2xl font-semibold text-[var(--ds-text)]">
              {rows.length} open cars across {dealerSummaries.length} dealers
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="inline-flex h-9 items-center gap-2 rounded-[8px] border border-[var(--ds-border)] bg-white px-3 text-[var(--ds-muted)]">
              <Clock3 className="h-4 w-4" />
              Updated {formatLastUpdated(lastUpdated)}
            </span>
            <button
              type="button"
              className="inline-flex h-9 items-center gap-2 rounded-[8px] border border-[var(--ds-border)] bg-white px-3 font-medium text-[var(--ds-text)] hover:bg-slate-50 disabled:opacity-60"
              disabled={loading || refreshing}
              onClick={() => void load(undefined, true)}
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
              Refresh
            </button>
            {!standalone ? (
              <Link
                to="/car-on-yard-tv"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-9 items-center gap-2 rounded-[8px] border border-[var(--ds-border)] bg-white px-3 font-medium text-[var(--ds-text)] hover:bg-slate-50"
              >
                <ExternalLink className="h-4 w-4" />
                投屏版
              </Link>
            ) : null}
          </div>
        </header>

        {error ? (
          <div className="rounded-[8px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-7 2xl:grid-cols-9">
          {dealerSummaries.map((dealer) => {
            const active = selectedDealer === dealer.code;
            const ageLevel = getAgeLevel(dealer.maxAgeDays);
            const warning = ageLevel !== "normal";
            const cardTone =
              ageLevel === "danger"
                ? "border-red-300 bg-red-50 hover:border-red-400"
                : ageLevel === "warn"
                  ? "border-orange-300 bg-orange-50 hover:border-orange-400"
                  : "border-[var(--ds-border)] bg-white hover:border-slate-300 hover:bg-slate-50";
            const activeTone =
              ageLevel === "danger"
                ? "border-red-500 bg-red-50 ring-2 ring-red-200"
                : ageLevel === "warn"
                  ? "border-orange-500 bg-orange-50 ring-2 ring-orange-200"
                  : "border-slate-400 bg-slate-50 ring-2 ring-slate-200";
            const numberTone =
              ageLevel === "danger"
                ? "text-red-700"
                : ageLevel === "warn"
                  ? "text-orange-700"
                  : "text-slate-900";
            const badgeTone =
              ageLevel === "danger" ? "bg-red-100 text-red-700" : "bg-orange-100 text-orange-700";
            return (
              <button
                key={dealer.code}
                type="button"
                className={[
                  "group aspect-square rounded-[8px] border p-3 text-left shadow-sm transition",
                  active ? activeTone : cardTone,
                ].join(" ")}
                onClick={() => setSelectedDealer((current) => (current === dealer.code ? null : dealer.code))}
                title={`${dealer.code}: ${dealer.count} cars`}
              >
                <div className="flex h-full flex-col justify-between">
                  <div className="flex items-start justify-between gap-2">
                    <span className="max-w-full truncate text-xl font-bold tracking-normal text-[var(--ds-text)]">
                      {dealer.code}
                    </span>
                    {warning ? (
                      <AlertTriangle
                        className={`h-5 w-5 shrink-0 ${ageLevel === "danger" ? "text-red-500" : "text-orange-500"}`}
                      />
                    ) : null}
                  </div>

                  <div>
                    <div className={`text-5xl font-bold ${numberTone}`}>
                      {dealer.count}
                    </div>
                    <div className="mt-2 flex items-center justify-between text-xs font-medium text-[var(--ds-muted)]">
                      <span>cars</span>
                      {dealer.overdueCount > 0 ? (
                        <span className={`rounded-full px-2 py-0.5 ${badgeTone}`}>
                          {dealer.overdueCount} over 4d
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </section>

        <section className={jobsSectionClass}>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--ds-border)] px-4 py-3">
            <div>
              <h2 className="text-base font-semibold text-[var(--ds-text)]">
                {selectedDealer ? `${selectedDealer} open jobs` : `Jobs over ${OVERDUE_DAYS} days`}
              </h2>
              <p className="text-xs text-[var(--ds-muted)]">
                {selectedDealer ? "Click another dealer tile to switch the list." : "Dealer tiles with old jobs are highlighted in red."}
              </p>
            </div>
            {selectedDealer ? (
              <button
                type="button"
                className="h-8 rounded-[8px] border border-[var(--ds-border)] px-3 text-sm font-medium text-[var(--ds-text)] hover:bg-slate-50"
                onClick={() => setSelectedDealer(null)}
              >
                Show all overdue
              </button>
            ) : null}
          </div>

          <div className={tableScrollClass}>
            <div className={`${tableGridClass} gap-3 border-b border-[var(--ds-border)] bg-slate-50 px-4 py-3 text-center text-xs font-semibold text-[rgba(0,0,0,0.55)]`}>
              <div>创建时间</div>
              <div>在店时间</div>
              <div>code</div>
              <div>车牌</div>
              <div className="text-left">汽车型号</div>
              <div className="text-left">备注</div>
              <div>操作</div>
            </div>

            {loading ? (
              <div className="flex min-h-[220px] items-center justify-center text-sm text-[var(--ds-muted)]">
                Loading car yard board...
              </div>
            ) : tableRows.length === 0 ? (
              <div className="flex min-h-[220px] flex-col items-center justify-center gap-2 text-sm text-[var(--ds-muted)]">
                <SearchX className="h-8 w-8 text-slate-300" />
                No open jobs to show here.
              </div>
            ) : (
              tableRows.map((row, index) => {
                const ageDays = getAgeDays(row.createdAt);
                const ageLevel = getAgeLevel(ageDays);
                const rowTone =
                  ageLevel === "danger"
                    ? "bg-red-50/70"
                    : ageLevel === "warn"
                      ? "bg-orange-50/70"
                      : index % 2 === 1
                        ? "bg-slate-50/70"
                        : "bg-white";
                const ageTone =
                  ageLevel === "danger"
                    ? "font-semibold text-red-700"
                    : ageLevel === "warn"
                      ? "font-semibold text-orange-700"
                      : "text-[rgba(0,0,0,0.62)]";
                const archiving = archivingIds.has(row.id);
                return (
                  <div
                    key={row.id}
                    className={[
                      `${tableGridClass} items-center gap-3 border-b border-[rgba(0,0,0,0.06)] px-4 py-3 text-center text-sm`,
                      rowTone,
                    ].join(" ")}
                  >
                    <div className="text-xs text-[rgba(0,0,0,0.62)]">{formatNzDateTime(row.createdAt)}</div>
                    <div className={ageTone}>
                      {getAgeLabel(row.createdAt)}
                    </div>
                    <button
                      type="button"
                      className="mx-auto h-8 max-w-full rounded-[8px] px-2 text-sm font-semibold text-blue-700 underline hover:bg-blue-50"
                      onClick={() => setSelectedDealer(getDealerCode(row))}
                    >
                      {getDealerCode(row)}
                    </button>
                    <div className="min-w-0 text-left">
                      <Link to={`/jobs/${row.id}`} className="font-semibold text-blue-700 underline break-all">
                        {row.plate || "-"}
                      </Link>
                    </div>
                    <div className="truncate text-left font-medium text-[rgba(0,0,0,0.68)]" title={row.vehicleModel}>
                      {row.vehicleModel || "-"}
                    </div>
                    <div className="truncate text-left text-[rgba(0,0,0,0.58)]" title={row.notes || ""}>
                      {row.notes || "-"}
                    </div>
                    <div className="flex items-center justify-center gap-1.5">
                      {row.externalInvoiceId ? (
                        <button
                          type="button"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] border border-[#13B5EA]/30 bg-white text-[#13B5EA] hover:bg-[#13B5EA]/[0.06]"
                          title="Open Xero"
                          onClick={() => window.open(getXeroInvoiceUrl(row.externalInvoiceId), "_blank", "noopener,noreferrer")}
                        >
                          <XeroIcon className="h-4 w-4" />
                        </button>
                      ) : null}
                      {getGmailPlateSearchUrl(row.plate) ? (
                        <a
                          className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] border border-red-200 bg-white text-red-600 hover:bg-red-50"
                          title={`在 Gmail 搜索 ${row.plate}`}
                          href={getGmailPlateSearchUrl(row.plate)}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <GmailIcon className="h-4 w-4" />
                        </a>
                      ) : null}
                      <button
                        type="button"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] border border-red-200 bg-white text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                        title="Archive"
                        disabled={archiving}
                        onClick={() => void handleArchive(row.id)}
                      >
                        <Archive className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--ds-border)] px-4 py-2 text-xs text-[var(--ds-muted)]">
            <span>Auto refresh every 5 minutes.</span>
            <span>{totalOverdue} cars currently over {OVERDUE_DAYS} days.</span>
          </div>
        </section>

        {!standalone ? (
          <section className="rounded-[8px] border border-[var(--ds-border)] bg-white">
            <button
              type="button"
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
              onClick={() => setSettingsOpen((open) => !open)}
            >
              <span className="flex items-center gap-2 font-semibold text-[var(--ds-text)]">
                <Settings2 className="h-4 w-4" />
                报告设置
              </span>
              <span className="text-xs text-[var(--ds-muted)]">
                {reportSettings?.enabled === false ? "已关闭" : "自动发送"} · {settingsForm.sendTimes || "未设置时间"}
              </span>
            </button>

            {settingsOpen ? (
              <div className="grid gap-4 border-t border-[var(--ds-border)] px-4 py-4 md:grid-cols-[1fr_1fr_auto]">
                <label className="flex flex-col gap-1">
                  <span className="text-xs font-semibold text-[var(--ds-muted)]">发送时间</span>
                  <input
                    className="h-10 rounded-[8px] border border-[var(--ds-border)] px-3 text-sm outline-none focus:border-[var(--ds-primary)]"
                    value={settingsForm.sendTimes}
                    placeholder="09:30, 17:30"
                    disabled={settingsLoading || settingsSaving}
                    onChange={(event) => setSettingsForm((prev) => ({ ...prev, sendTimes: event.target.value }))}
                  />
                </label>

                <label className="flex flex-col gap-1">
                  <span className="text-xs font-semibold text-[var(--ds-muted)]">收件人</span>
                  <input
                    className="h-10 rounded-[8px] border border-[var(--ds-border)] px-3 text-sm outline-none focus:border-[var(--ds-primary)]"
                    value={settingsForm.recipients}
                    placeholder="info@nzautotech.co.nz"
                    disabled={settingsLoading || settingsSaving}
                    onChange={(event) => setSettingsForm((prev) => ({ ...prev, recipients: event.target.value }))}
                  />
                </label>

                <div className="flex items-end gap-2">
                  <label className="inline-flex h-10 items-center gap-2 rounded-[8px] border border-[var(--ds-border)] px-3 text-sm">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-[var(--ds-primary)]"
                      checked={settingsForm.enabled}
                      disabled={settingsLoading || settingsSaving}
                      onChange={(event) => setSettingsForm((prev) => ({ ...prev, enabled: event.target.checked }))}
                    />
                    启用
                  </label>
                  <button
                    type="button"
                    className="inline-flex h-10 items-center gap-2 rounded-[8px] bg-[var(--ds-primary)] px-4 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
                    disabled={settingsLoading || settingsSaving}
                    onClick={() => void saveReportSettings()}
                  >
                    <Save className="h-4 w-4" />
                    保存
                  </button>
                </div>

                <label className="flex flex-col gap-1 md:col-span-2">
                  <span className="text-xs font-semibold text-[var(--ds-muted)]">邮件主题</span>
                  <input
                    className="h-10 rounded-[8px] border border-[var(--ds-border)] px-3 text-sm outline-none focus:border-[var(--ds-primary)]"
                    value={settingsForm.subject}
                    disabled={settingsLoading || settingsSaving}
                    onChange={(event) => setSettingsForm((prev) => ({ ...prev, subject: event.target.value }))}
                  />
                </label>

                <div className="flex items-end text-xs text-[var(--ds-muted)]">
                  NZ time · {reportSettings?.lastSentAtUtc ? `Last sent ${formatNzDateTime(reportSettings.lastSentAtUtc)}` : "Not sent yet"}
                  {reportSettings?.lastError ? ` · ${reportSettings.lastError}` : ""}
                </div>
              </div>
            ) : null}
          </section>
        ) : null}
      </div>
    </div>
  );
}
