import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button, Card, Pagination, useToast } from "@/components/ui";
import { Ban, Check, CheckSquare, ExternalLink, Eye, Square, X } from "lucide-react";
import {
  completePoJobs,
  confirmPoNumber,
  fetchPoDraftPreview,
  fetchPoTodo,
  manualConfirmPoSent,
} from "@/features/poTodo/poTodoApi";
import type { ConfirmPoResponse, PoDraftPreview, PoTodoRow, PoTodoTab } from "@/features/poTodo/poTodo.types";
import {
  getPoTodoTableColSpan,
  normalizePoNumberInput,
  shouldShowPoDraftColumn,
  shouldShowPoNumberColumn,
  shouldShowSentColumn,
  shouldShowXeroColumn,
} from "./poDashboardPreviewPage.utils";

const TABS: Array<{ key: PoTodoTab; label: string }> = [
  { key: "pendingSend", label: "待发邮件" },
  { key: "awaitingPo", label: "等待 PO" },
  { key: "invoiced", label: "Invoiced" },
];
const PO_TODO_PAGE_SIZE = 10;

function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-NZ", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function xeroInvoiceUrl(invoiceId?: string | null) {
  return invoiceId ? `https://go.xero.com/AccountsReceivable/View.aspx?InvoiceID=${encodeURIComponent(invoiceId)}` : "";
}

function gmailThreadUrl(threadId?: string | null) {
  return threadId ? `https://mail.google.com/mail/u/0/#inbox/${encodeURIComponent(threadId)}` : "";
}

function isSent(row: PoTodoRow) {
  return Boolean(row.lastRequestSentAt || row.firstRequestSentAt || row.sentSource);
}

function stepSummary(result: ConfirmPoResponse | null) {
  if (!result) return [];
  return Object.entries(result.steps);
}

function tabForStatus(status: string): PoTodoTab | null {
  switch (status) {
    case "draft":
      return "pendingSend";
    case "awaitingReply":
    case "pendingConfirmation":
    case "escalationRequired":
      return "awaitingPo";
    case "poConfirmed":
      return "invoiced";
    default:
      return null;
  }
}

export function PoDashboardPreviewPage() {
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<PoTodoTab>("pendingSend");
  const [currentPage, setCurrentPage] = useState(1);
  const [allRows, setAllRows] = useState<PoTodoRow[]>([]);
  const [lastGmailSyncedAt, setLastGmailSyncedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [poInputs, setPoInputs] = useState<Record<number, string>>({});
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [busyJobId, setBusyJobId] = useState<number | null>(null);
  const [preview, setPreview] = useState<PoDraftPreview | null>(null);
  const [previewLoadingJobId, setPreviewLoadingJobId] = useState<number | null>(null);
  const [confirmResult, setConfirmResult] = useState<ConfirmPoResponse | null>(null);

  const loadDashboard = useCallback(async (options?: { background?: boolean }) => {
    const background = options?.background === true;
    if (!background) {
      setLoading(true);
    }
    setError(null);
    try {
      const result = await fetchPoTodo();
      setAllRows(result.items);
      setLastGmailSyncedAt(result.lastGmailSyncedAt ?? null);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to load PO TODO list";
      setError(message);
      if (!background) {
        setAllRows([]);
      }
    } finally {
      if (!background) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const handleTabChange = (tab: PoTodoTab) => {
    if (tab === activeTab) return;
    setActiveTab(tab);
    setCurrentPage(1);
    setSelectedIds([]);
  };

  const rowsByTab = useMemo(() => {
    const next: Record<PoTodoTab, PoTodoRow[]> = { pendingSend: [], awaitingPo: [], invoiced: [] };
    for (const row of allRows) {
      const tab = tabForStatus(row.status);
      if (tab) next[tab].push(row);
    }
    return next;
  }, [allRows]);
  const counts = useMemo(
    () => ({
      pendingSend: rowsByTab.pendingSend.length,
      awaitingPo: rowsByTab.awaitingPo.length,
      invoiced: rowsByTab.invoiced.length,
    }),
    [rowsByTab]
  );
  const totalPages = Math.max(1, Math.ceil(counts[activeTab] / PO_TODO_PAGE_SIZE));
  const rows = useMemo(() => {
    const start = (currentPage - 1) * PO_TODO_PAGE_SIZE;
    return rowsByTab[activeTab].slice(start, start + PO_TODO_PAGE_SIZE);
  }, [activeTab, currentPage, rowsByTab]);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const allSelected = useMemo(() => rows.length > 0 && rows.every((row) => selectedIds.includes(row.jobId)), [rows, selectedIds]);
  const showXeroColumn = shouldShowXeroColumn(activeTab);
  const showPoDraftColumn = shouldShowPoDraftColumn(activeTab);
  const showSentColumn = shouldShowSentColumn(activeTab);
  const showPoNumberColumn = shouldShowPoNumberColumn(activeTab);
  const showIgnoreColumn = activeTab === "pendingSend";
  const tableColSpan = getPoTodoTableColSpan(activeTab);

  const toggleAll = () => {
    setSelectedIds(allSelected ? [] : rows.map((row) => row.jobId));
  };

  const toggleOne = (jobId: number) => {
    setSelectedIds((prev) => (prev.includes(jobId) ? prev.filter((id) => id !== jobId) : [...prev, jobId]));
  };

  const handlePreview = async (row: PoTodoRow) => {
    setPreviewLoadingJobId(row.jobId);
    try {
      setPreview(await fetchPoDraftPreview(row.jobId));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load draft preview");
    } finally {
      setPreviewLoadingJobId(null);
    }
  };

  const handleManualSent = async (row: PoTodoRow) => {
    setBusyJobId(row.jobId);
    try {
      await manualConfirmPoSent(row.jobId);
      toast.success("已标记发送");
      await loadDashboard({ background: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to mark sent");
    } finally {
      setBusyJobId(null);
    }
  };

  const handleConfirmPo = async (row: PoTodoRow) => {
    const value = normalizePoNumberInput(poInputs[row.jobId] ?? row.detectedPoNumber ?? "");
    if (!value) {
      toast.error("Please enter PO number");
      return;
    }

    setBusyJobId(row.jobId);
    setConfirmResult(null);
    try {
      const result = await confirmPoNumber(row.jobId, value);
      setConfirmResult(result);
      if (result.success) {
        toast.success("PO 已确认");
        await loadDashboard({ background: true });
      } else {
        toast.error("PO 确认未完成");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to confirm PO");
    } finally {
      setBusyJobId(null);
    }
  };

  const handleCompleteSelected = async () => {
    if (selectedIds.length === 0) return;

    setBusyJobId(-1);
    try {
      const result = await completePoJobs(selectedIds);
      toast.success(`完成 ${result.updated} 个，跳过 ${result.skipped} 个`);
      setSelectedIds([]);
      await loadDashboard({ background: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to complete selected jobs");
    } finally {
      setBusyJobId(null);
    }
  };

  const handleIgnoreJob = async (row: PoTodoRow) => {
    setBusyJobId(row.jobId);
    try {
      const result = await completePoJobs([row.jobId]);
      if (result.updated > 0) {
        toast.success("已忽略");
        setSelectedIds((prev) => prev.filter((id) => id !== row.jobId));
        await loadDashboard({ background: true });
      } else {
        toast.error("未能忽略该 job");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to ignore job");
    } finally {
      setBusyJobId(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal text-[var(--ds-text)]">PO TODO</h1>
          <div className="mt-1 text-sm text-[var(--ds-muted)]">最后 Gmail 同步：{formatDate(lastGmailSyncedAt)}</div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => handleTabChange(tab.key)}
            className={[
              "inline-flex h-10 items-center gap-2 rounded-[8px] border px-4 text-sm font-semibold transition",
              activeTab === tab.key
                ? "border-[var(--ds-primary)] bg-[var(--ds-primary)] text-white"
                : "border-[var(--ds-border)] bg-white text-[var(--ds-text)] hover:border-[var(--ds-primary)]",
            ].join(" ")}
          >
            <span>{tab.label}</span>
            <span className={activeTab === tab.key ? "text-white/80" : "text-[var(--ds-muted)]"}>{counts[tab.key]}</span>
          </button>
        ))}
      </div>

      {activeTab === "invoiced" ? (
        <div className="flex justify-end">
          <Button
            leftIcon={allSelected ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
            onClick={toggleAll}
            disabled={rows.length === 0}
          >
            全选
          </Button>
          <Button
            variant="primary"
            className="ml-2"
            leftIcon={<Check className="h-4 w-4" />}
            onClick={() => void handleCompleteSelected()}
            disabled={selectedIds.length === 0 || busyJobId === -1}
          >
            标记完成
          </Button>
        </div>
      ) : null}

      <Card className="overflow-hidden">
        {error ? <div className="border-b border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div> : null}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1180px] border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-normal text-[var(--ds-muted)]">
                {activeTab === "invoiced" ? <th className="w-12 px-3 py-3"></th> : null}
                <th className="px-3 py-3">创建时间</th>
                <th className="px-3 py-3">Code</th>
                <th className="px-3 py-3">车牌</th>
                <th className="px-3 py-3">型号</th>
                <th className="px-3 py-3">备注</th>
                <th className="px-3 py-3">Reference</th>
                {showXeroColumn ? <th className="px-3 py-3">Xero</th> : null}
                {showPoDraftColumn ? <th className="px-3 py-3">PO草稿</th> : null}
                {showSentColumn ? <th className="px-3 py-3">是否发送</th> : null}
                {showPoNumberColumn ? <th className="px-3 py-3">PO</th> : null}
                {activeTab === "invoiced" ? <th className="px-3 py-3">Gmail</th> : null}
                {showIgnoreColumn ? <th className="px-3 py-3">操作</th> : null}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={tableColSpan} className="px-4 py-10 text-center text-sm text-[var(--ds-muted)]">
                    Loading...
                  </td>
                </tr>
              ) : null}
              {!loading ? rows.map((row) => {
                const sent = isSent(row);
                const xeroUrl = xeroInvoiceUrl(row.xeroInvoiceId);
                const gmailUrl = gmailThreadUrl(row.gmailThreadId);
                return (
                  <tr key={row.jobId} className="border-t border-slate-100 align-top">
                    {activeTab === "invoiced" ? (
                      <td className="px-3 py-3">
                        <button type="button" onClick={() => toggleOne(row.jobId)} className="text-slate-500 hover:text-[var(--ds-primary)]">
                          {selectedIds.includes(row.jobId) ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                        </button>
                      </td>
                    ) : null}
                    <td className="whitespace-nowrap px-3 py-3 text-slate-600">{formatDate(row.createdAt)}</td>
                    <td className="px-3 py-3 font-semibold text-[var(--ds-text)]">{row.code || "-"}</td>
                    <td className="px-3 py-3">
                      <Link to={`/jobs/${row.jobId}?tab=PO`} className="font-semibold text-[var(--ds-primary)] hover:underline">
                        {row.plate || `JOB-${row.jobId}`}
                      </Link>
                    </td>
                    <td className="max-w-[160px] px-3 py-3 text-slate-700">{row.model || "-"}</td>
                    <td className="max-w-[220px] px-3 py-3 text-slate-600">{row.notes || "-"}</td>
                    <td className="max-w-[220px] px-3 py-3 text-slate-700">{row.reference || "-"}</td>
                    {showXeroColumn ? (
                      <td className="px-3 py-3">
                        {xeroUrl ? (
                          <Button href={xeroUrl} target="_blank" rel="noreferrer" rightIcon={<ExternalLink className="h-4 w-4" />}>
                            Open
                          </Button>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                    ) : null}
                    {showPoDraftColumn ? (
                      <td className="px-3 py-3">
                        <Button
                          leftIcon={<Eye className="h-4 w-4" />}
                          onClick={() => void handlePreview(row)}
                          disabled={sent || previewLoadingJobId === row.jobId}
                        >
                          预览
                        </Button>
                      </td>
                    ) : null}
                    {showSentColumn ? (
                      <td className="px-3 py-3">
                        {sent ? (
                          <span className="inline-flex rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">已发送</span>
                        ) : (
                          <Button onClick={() => void handleManualSent(row)} disabled={busyJobId === row.jobId}>
                            标记为发送
                          </Button>
                        )}
                      </td>
                    ) : null}
                    {showPoNumberColumn ? (
                      <td className="px-3 py-3">
                        <div className="flex min-w-[180px] gap-2">
                          <input
                            value={poInputs[row.jobId] ?? normalizePoNumberInput(row.detectedPoNumber ?? "")}
                            onChange={(event) => setPoInputs((prev) => ({ ...prev, [row.jobId]: normalizePoNumberInput(event.target.value) }))}
                            inputMode="numeric"
                            pattern="[0-9]*"
                            className="h-9 w-28 rounded-[8px] border border-[var(--ds-border)] px-2 text-sm outline-none focus:border-[var(--ds-primary)]"
                            placeholder="PO #"
                          />
                          <Button variant="primary" onClick={() => void handleConfirmPo(row)} disabled={busyJobId === row.jobId}>
                            确认
                          </Button>
                        </div>
                      </td>
                    ) : null}
                    {activeTab === "invoiced" ? (
                      <td className="px-3 py-3">
                        {gmailUrl ? (
                          <Button href={gmailUrl} target="_blank" rel="noreferrer" rightIcon={<ExternalLink className="h-4 w-4" />}>
                            Thread
                          </Button>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                    ) : null}
                    {showIgnoreColumn ? (
                      <td className="px-3 py-3">
                        <Button
                          leftIcon={<Ban className="h-4 w-4" />}
                          onClick={() => void handleIgnoreJob(row)}
                          disabled={busyJobId === row.jobId}
                        >
                          忽略
                        </Button>
                      </td>
                    ) : null}
                  </tr>
                );
              }) : null}
              {!loading && rows.length === 0 ? (
                <tr>
                  <td colSpan={tableColSpan} className="px-4 py-10 text-center text-sm text-[var(--ds-muted)]">
                    No PO jobs.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        {!loading && counts[activeTab] > 0 ? (
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            pageSize={PO_TODO_PAGE_SIZE}
            totalItems={counts[activeTab]}
            onPageChange={setCurrentPage}
          />
        ) : null}
      </Card>

      {confirmResult ? (
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="font-semibold text-[var(--ds-text)]">Confirm PO</div>
            <button type="button" onClick={() => setConfirmResult(null)} className="rounded-full p-1 text-slate-500 hover:bg-slate-100">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="grid gap-2 md:grid-cols-4">
            {stepSummary(confirmResult).map(([key, step]) => (
              <div key={key} className="rounded-[8px] border border-[var(--ds-border)] p-3">
                <div className="text-xs font-semibold uppercase text-[var(--ds-muted)]">{key}</div>
                <div className="mt-1 font-semibold text-[var(--ds-text)]">{step.status}</div>
                <div className="mt-1 text-xs text-[var(--ds-muted)]">{step.message}</div>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {preview ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <Card className="max-h-[86vh] w-full max-w-3xl overflow-hidden">
            <div className="flex items-start justify-between gap-3 border-b border-[var(--ds-border)] p-4">
              <div>
                <div className="font-semibold text-[var(--ds-text)]">{preview.subject}</div>
                <div className="mt-1 text-sm text-[var(--ds-muted)]">{preview.to || "-"}</div>
              </div>
              <button type="button" onClick={() => setPreview(null)} className="rounded-full p-2 text-slate-500 hover:bg-slate-100">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="max-h-[64vh] overflow-auto bg-white p-5" dangerouslySetInnerHTML={{ __html: preview.htmlBody }} />
          </Card>
        </div>
      ) : null}
    </div>
  );
}
