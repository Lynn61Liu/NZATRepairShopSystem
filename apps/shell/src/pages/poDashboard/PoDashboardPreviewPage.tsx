import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { GmailIcon } from "@/components/common/GmailSearchButton";
import { XeroIcon } from "@/components/common/XeroButton";
import { getGmailPlateSearchUrl } from "@/components/common/gmailSearch";
import { Button, Card, Input, Pagination, Select, useToast } from "@/components/ui";
import { Ban, Check, CheckSquare, ExternalLink, Mail, RefreshCw, Square } from "lucide-react";
import {
  completePoJobs,
  confirmPoBatch,
  confirmPoNumber,
  fetchPoTodo,
  manualConfirmPoSent,
} from "@/features/poTodo/poTodoApi";
import type { PoTodoRow, PoTodoTab } from "@/features/poTodo/poTodo.types";
import {
  formatPoTodoCreatedAt,
  formatPoTodoSentAt,
  getPoTodoTableColSpan,
  normalizePoNumberInput,
  shouldShowCompletionActionColumn,
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
const PO_TODO_PAGE_SIZE = 15;
const ALL_CUSTOMERS = "all";

function xeroInvoiceUrl(invoiceId?: string | null) {
  return invoiceId ? `https://go.xero.com/AccountsReceivable/View.aspx?InvoiceID=${encodeURIComponent(invoiceId)}` : "";
}

function gmailThreadUrl(threadId?: string | null) {
  return threadId ? `https://mail.google.com/mail/u/0/#inbox/${encodeURIComponent(threadId)}` : "";
}

function isSent(row: PoTodoRow) {
  return Boolean(row.lastRequestSentAt || row.firstRequestSentAt || row.sentSource);
}

function formatSubtotal(value?: number | null) {
  return value == null
    ? "-"
    : new Intl.NumberFormat("en-NZ", { style: "currency", currency: "NZD" }).format(value);
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
  const [customerFilter, setCustomerFilter] = useState(ALL_CUSTOMERS);
  const [plateSearch, setPlateSearch] = useState("");
  const [allRows, setAllRows] = useState<PoTodoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [poInputs, setPoInputs] = useState<Record<number, string>>({});
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [busyJobId, setBusyJobId] = useState<number | null>(null);
  const [ignoringJobIds, setIgnoringJobIds] = useState<number[]>([]);
  const [confirmingJobIds, setConfirmingJobIds] = useState<number[]>([]);
  const [batchConfirming, setBatchConfirming] = useState(false);

  const loadDashboard = useCallback(async (options?: { background?: boolean }) => {
    const background = options?.background === true;
    if (!background) {
      setLoading(true);
    }
    setError(null);
    try {
      const result = await fetchPoTodo();
      setAllRows(result.items);
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

  const hasProcessingConfirmations = useMemo(
    () => allRows.some((row) => row.confirmationStatus === "processing"),
    [allRows]
  );

  useEffect(() => {
    if (!hasProcessingConfirmations) return;
    const pollTimer = window.setInterval(() => {
      void loadDashboard({ background: true });
    }, 5_000);
    return () => window.clearInterval(pollTimer);
  }, [hasProcessingConfirmations, loadDashboard]);

  const handleTabChange = (tab: PoTodoTab) => {
    if (tab === activeTab) return;
    setActiveTab(tab);
    setCurrentPage(1);
    setCustomerFilter(ALL_CUSTOMERS);
    setPlateSearch("");
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
  const customerOptions = useMemo(() => {
    const customers = new Map<string, string>();
    for (const row of rowsByTab[activeTab]) {
      const key = row.customerId == null ? "unassigned" : String(row.customerId);
      const label = row.customerName?.trim() || row.code?.trim() || "未指定客户";
      customers.set(key, row.code?.trim() && row.code.trim() !== label ? `${label} · ${row.code.trim()}` : label);
    }
    return [...customers.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label, "zh-Hans-NZ"));
  }, [activeTab, rowsByTab]);
  const filteredRows = useMemo(() => {
    const normalizedPlateSearch = plateSearch.trim().toLocaleLowerCase();
    return rowsByTab[activeTab].filter((row) => {
      const matchesCustomer = customerFilter === ALL_CUSTOMERS
        || (row.customerId == null ? "unassigned" : String(row.customerId)) === customerFilter;
      const matchesPlate = !normalizedPlateSearch
        || row.plate?.trim().toLocaleLowerCase().includes(normalizedPlateSearch);
      return matchesCustomer && matchesPlate;
    });
  }, [activeTab, customerFilter, plateSearch, rowsByTab]);
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PO_TODO_PAGE_SIZE));
  const rows = useMemo(() => {
    const start = (currentPage - 1) * PO_TODO_PAGE_SIZE;
    return filteredRows.slice(start, start + PO_TODO_PAGE_SIZE);
  }, [currentPage, filteredRows]);
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const selectableRows = useMemo(
    () => activeTab === "awaitingPo"
      ? rows.filter((row) => row.confirmationStatus !== "processing")
      : rows,
    [activeTab, rows]
  );
  const allSelected = useMemo(
    () => selectableRows.length > 0 && selectableRows.every((row) => selectedIds.includes(row.jobId)),
    [selectableRows, selectedIds]
  );
  const showXeroColumn = shouldShowXeroColumn(activeTab);
  const showPoDraftColumn = shouldShowPoDraftColumn(activeTab);
  const showSentColumn = shouldShowSentColumn(activeTab);
  const showPoNumberColumn = shouldShowPoNumberColumn(activeTab);
  const showCompletionActionColumn = shouldShowCompletionActionColumn(activeTab);
  const tableColSpan = getPoTodoTableColSpan(activeTab);

  const toggleAll = () => {
    setSelectedIds(allSelected ? [] : selectableRows.map((row) => row.jobId));
  };

  const toggleOne = (jobId: number) => {
    setSelectedIds((prev) => (prev.includes(jobId) ? prev.filter((id) => id !== jobId) : [...prev, jobId]));
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

  const getPoInput = (row: PoTodoRow) => normalizePoNumberInput(
    poInputs[row.jobId] ?? row.pendingPoNumber ?? row.detectedPoNumber ?? ""
  );

  const handleConfirmPo = async (row: PoTodoRow, sendInvoice: boolean) => {
    if (row.confirmationStatus === "processing" || confirmingJobIds.includes(row.jobId)) {
      toast.info(`${row.plate || `Job ${row.jobId}`} 正在处理中，请稍候`);
      return;
    }

    const value = getPoInput(row);
    if (!value) {
      toast.error("Please enter PO number");
      return;
    }

    setConfirmingJobIds((prev) => [...new Set([...prev, row.jobId])]);
    setAllRows((prev) => prev.map((item) => item.jobId === row.jobId
      ? { ...item, pendingPoNumber: value, confirmationStatus: "processing", confirmationNote: null }
      : item));
    try {
      const result = await confirmPoNumber(row.jobId, value, sendInvoice);
      const warning = Object.values(result.steps).find((step) => step.status === "failed")?.message;
      if (result.success) {
        toast.success(sendInvoice ? "PO 已确认，Gmail 发票已发送（含 PDF）" : "PO 已确认");
        if (warning) toast.info(warning);
      } else {
        toast.error(warning || "PO 确认未完成");
      }
      await loadDashboard({ background: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to confirm PO");
      await loadDashboard({ background: true });
    } finally {
      setConfirmingJobIds((prev) => prev.filter((id) => id !== row.jobId));
    }
  };

  const handleBatchConfirm = async (sendInvoice: boolean) => {
    const selectedRows = rows.filter((row) => selectedIds.includes(row.jobId));
    if (selectedRows.length === 0) {
      toast.error("请先选择需要确认的记录");
      return;
    }
    const processing = selectedRows.filter((row) => row.confirmationStatus === "processing");
    if (processing.length > 0) {
      const plates = processing.map((row) => row.plate || `Job ${row.jobId}`).join(", ");
      toast.info(`${plates} 正在处理中，请等待完成后再重试`);
      return;
    }
    const missing = selectedRows.filter((row) => !getPoInput(row));
    if (missing.length > 0) {
      toast.error(`${missing.length} 条记录没有 PO Number`);
      return;
    }

    setBatchConfirming(true);
    setConfirmingJobIds((prev) => [...new Set([...prev, ...selectedRows.map((row) => row.jobId)])]);
    try {
      const result = await confirmPoBatch(
        selectedRows.map((row) => ({ jobId: row.jobId, poNumber: getPoInput(row) })),
        sendInvoice
      );
      if (result.failed > 0) {
        const firstFailure = result.results.find((item) => !item.success);
        const failedStep = firstFailure
          ? Object.values(firstFailure.steps).find((step) => step.status === "failed")
          : undefined;
        const failedRow = firstFailure
          ? selectedRows.find((row) => row.jobId === firstFailure.jobId)
          : undefined;
        const failedLabel = failedRow?.plate || (firstFailure ? `Job ${firstFailure.jobId}` : "首条失败记录");
        const failedMessage = failedStep?.message || "未提供失败原因";
        toast.error(`完成 ${result.succeeded} 条，失败 ${result.failed} 条。${failedLabel}: ${failedMessage}`);
      } else {
        toast.success(`已完成 ${result.succeeded} 条`);
      }
      setSelectedIds([]);
      await loadDashboard({ background: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to confirm selected PO jobs");
      await loadDashboard({ background: true });
    } finally {
      setConfirmingJobIds([]);
      setBatchConfirming(false);
    }
  };

  const handleCompleteSelected = async () => {
    if (selectedIds.length === 0) return;

    const targetIds = [...selectedIds];
    setIgnoringJobIds((prev) => [...new Set([...prev, ...targetIds])]);
    try {
      const result = await completePoJobs(targetIds);
      if (result.updated > 0 || result.skipped === targetIds.length) {
        setAllRows((prev) => prev.filter((row) => !targetIds.includes(row.jobId)));
        setSelectedIds((prev) => prev.filter((id) => !targetIds.includes(id)));
      }
      toast.success(`已忽略 ${result.updated} 个，跳过 ${result.skipped} 个`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to complete selected jobs");
    } finally {
      setIgnoringJobIds((prev) => prev.filter((id) => !targetIds.includes(id)));
    }
  };

  const handleCompleteAction = async (row: PoTodoRow) => {
    setIgnoringJobIds((prev) => [...new Set([...prev, row.jobId])]);
    try {
      const result = await completePoJobs([row.jobId]);
      if (result.updated > 0 || result.skipped > 0) {
        toast.success("已忽略");
        setSelectedIds((prev) => prev.filter((id) => id !== row.jobId));
        setAllRows((prev) => prev.filter((item) => item.jobId !== row.jobId));
      } else {
        toast.error("未能忽略该 job");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to ignore job");
    } finally {
      setIgnoringJobIds((prev) => prev.filter((id) => id !== row.jobId));
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-normal text-[var(--ds-text)]">PO TO REQUEST</h1>
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

      <Card className="flex flex-col gap-3 p-3 sm:flex-row sm:items-end">
        <div className="space-y-1.5">
          <label htmlFor="po-customer-filter" className="block text-sm font-semibold text-[var(--ds-text)]">客户</label>
          <Select
            id="po-customer-filter"
            value={customerFilter}
            onChange={(event) => {
              setCustomerFilter(event.target.value);
              setCurrentPage(1);
              setSelectedIds([]);
            }}
            className="sm:w-[320px]"
          >
            <option value={ALL_CUSTOMERS}>全部客户</option>
            {customerOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </Select>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="po-plate-search" className="block text-sm font-semibold text-[var(--ds-text)]">车牌</label>
          <Input
            id="po-plate-search"
            value={plateSearch}
            onChange={(event) => {
              setPlateSearch(event.target.value);
              setCurrentPage(1);
              setSelectedIds([]);
            }}
            placeholder="输入车牌搜索"
            className="sm:w-[220px]"
          />
        </div>
        {customerFilter !== ALL_CUSTOMERS || plateSearch ? (
          <Button onClick={() => {
              setCustomerFilter(ALL_CUSTOMERS);
              setPlateSearch("");
              setCurrentPage(1);
              setSelectedIds([]);
            }}>
            清除筛选
          </Button>
        ) : null}
      </Card>

      {activeTab === "pendingSend" ? (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button
            leftIcon={allSelected ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
            onClick={toggleAll}
            disabled={selectableRows.length === 0 || ignoringJobIds.length > 0}
          >
            全选
          </Button>
          <Button
            variant="primary"
            leftIcon={<Ban className="h-4 w-4" />}
            onClick={() => void handleCompleteSelected()}
            disabled={selectedIds.length === 0 || ignoringJobIds.length > 0}
          >
            批量忽略
          </Button>
        </div>
      ) : activeTab === "awaitingPo" ? (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button
            leftIcon={allSelected ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
            onClick={toggleAll}
            disabled={selectableRows.length === 0 || batchConfirming}
          >
            全选
          </Button>
          <Button
            variant="primary"
            leftIcon={<Check className="h-4 w-4" />}
            onClick={() => void handleBatchConfirm(false)}
            disabled={selectedIds.length === 0 || batchConfirming}
          >
            批量确认
          </Button>
          <Button
            leftIcon={<Mail className="h-4 w-4" />}
            onClick={() => void handleBatchConfirm(true)}
            disabled={selectedIds.length === 0 || batchConfirming}
          >
            批量确认并发送
          </Button>
        </div>
      ) : activeTab === "invoiced" ? (
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
            disabled={selectedIds.length === 0 || ignoringJobIds.length > 0}
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
                <th className="w-12 px-3 py-3"></th>
                <th className="px-3 py-3">创建时间</th>
                <th className="px-3 py-3">Code</th>
                <th className="px-3 py-3">车牌</th>
                <th className="px-3 py-3">型号</th>
                <th className="px-3 py-3">备注</th>
                <th className="px-3 py-3">Reference</th>
                {activeTab === "awaitingPo" ? <th className="px-3 py-3">Xero Subtotal</th> : null}
                {showXeroColumn ? <th className="px-3 py-3">Xero</th> : null}
                {showPoDraftColumn ? <th className="px-3 py-3">发PO</th> : null}
                {showSentColumn ? <th className="px-3 py-3">{activeTab === "awaitingPo" ? "发送时间" : "是否发送"}</th> : null}
                {showPoNumberColumn ? <th className="px-3 py-3">PO</th> : null}
                {activeTab === "awaitingPo" ? <th className="px-3 py-3">Note</th> : null}
                {activeTab === "invoiced" ? <th className="px-3 py-3">Gmail</th> : null}
                {showCompletionActionColumn ? <th className="px-3 py-3">操作</th> : null}
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
                const confirmationProcessing = row.confirmationStatus === "processing"
                  || confirmingJobIds.includes(row.jobId);
                const ignoring = ignoringJobIds.includes(row.jobId);
                return (
                  <tr key={row.jobId} className="border-t border-slate-100 align-top">
                    <td className="px-3 py-3">
                      <button
                        type="button"
                        onClick={() => toggleOne(row.jobId)}
                        disabled={(activeTab === "awaitingPo" && confirmationProcessing) || ignoring}
                        className="text-slate-500 hover:text-[var(--ds-primary)] disabled:cursor-not-allowed disabled:text-slate-300"
                      >
                        {selectedIds.includes(row.jobId) ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
                      </button>
                    </td>
                    <td className="whitespace-nowrap px-3 py-3 text-slate-600">{formatPoTodoCreatedAt(row.createdAt)}</td>
                    <td className="px-3 py-3 font-semibold text-[var(--ds-text)]">
                      <span>{row.code || "-"}</span>
                      {row.confirmedPoNumber ? (
                        <button
                          type="button"
                          className="ml-1 cursor-help"
                          title={`PO# ${row.confirmedPoNumber}`}
                          onClick={() => window.alert(`PO# ${row.confirmedPoNumber}`)}
                        >
                          🙂
                        </button>
                      ) : null}
                    </td>
                    <td className="px-3 py-3">
                      <Link to={`/jobs/${row.jobId}?tab=PO`} className="font-semibold text-[var(--ds-primary)] hover:underline">
                        {row.plate || `JOB-${row.jobId}`}
                      </Link>
                    </td>
                    <td className="max-w-[160px] px-3 py-3 text-slate-700">{row.model || "-"}</td>
                    <td className="max-w-[220px] px-3 py-3 text-slate-600">{row.notes || "-"}</td>
                    <td className="max-w-[220px] px-3 py-3 text-slate-700">{row.reference || "-"}</td>
                    {activeTab === "awaitingPo" ? (
                      <td className="whitespace-nowrap px-3 py-3">
                        <div className="font-semibold tabular-nums text-[var(--ds-text)]">{formatSubtotal(row.xeroSubtotal)}</div>
                        <div className="text-[11px] text-[var(--ds-muted)]">excl. GST</div>
                      </td>
                    ) : null}
                    {showXeroColumn ? (
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1.5">
                          {xeroUrl ? (
                            <a
                              className="inline-flex h-9 w-9 items-center justify-center rounded-[9px] border border-[#13B5EA]/25 bg-white text-[#13B5EA] hover:bg-[#13B5EA]/[0.06]"
                              title="Open Xero"
                              href={xeroUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <XeroIcon className="h-5 w-5" />
                            </a>
                          ) : null}
                          {getGmailPlateSearchUrl(row.plate) ? (
                            <a
                              className="inline-flex h-9 w-9 items-center justify-center rounded-[9px] border border-red-200 bg-white text-red-600 hover:bg-red-50"
                              title={`在 Gmail 搜索 ${row.plate}`}
                              href={getGmailPlateSearchUrl(row.plate)}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <GmailIcon className="h-5 w-5" />
                            </a>
                          ) : null}
                          {!xeroUrl && !getGmailPlateSearchUrl(row.plate) ? (
                            <span className="text-slate-400">-</span>
                          ) : null}
                        </div>
                      </td>
                    ) : null}
                    {showPoDraftColumn ? (
                      <td className="px-3 py-3">
                        <Button href={`/jobs/${row.jobId}?tab=PO`}>发PO</Button>
                      </td>
                    ) : null}
                    {showSentColumn ? (
                      <td className="px-3 py-3">
                        {activeTab === "awaitingPo" ? (
                          <span className="whitespace-nowrap text-sm font-medium text-slate-600">
                            {formatPoTodoSentAt(row.lastRequestSentAt || row.firstRequestSentAt || row.manuallyMarkedSentAt)}
                          </span>
                        ) : sent ? (
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
                        <div className="flex min-w-[330px] flex-wrap gap-2">
                          <input
                            value={poInputs[row.jobId] ?? normalizePoNumberInput(row.pendingPoNumber ?? row.detectedPoNumber ?? "")}
                            onChange={(event) => setPoInputs((prev) => ({ ...prev, [row.jobId]: normalizePoNumberInput(event.target.value) }))}
                            inputMode="numeric"
                            pattern="[0-9]*"
                            className="h-9 w-28 rounded-[8px] border border-[var(--ds-border)] px-2 text-sm outline-none focus:border-[var(--ds-primary)]"
                            placeholder="PO #"
                          />
                          <Button
                            variant="primary"
                            leftIcon={confirmationProcessing ? <RefreshCw className="h-4 w-4 animate-spin" /> : undefined}
                            onClick={() => void handleConfirmPo(row, false)}
                            disabled={confirmationProcessing}
                          >
                            {confirmationProcessing ? "处理中…" : "确认"}
                          </Button>
                          <Button
                            leftIcon={confirmationProcessing
                              ? <RefreshCw className="h-4 w-4 animate-spin" />
                              : <Mail className="h-4 w-4" />}
                            onClick={() => void handleConfirmPo(row, true)}
                            disabled={confirmationProcessing}
                          >
                            {confirmationProcessing ? "处理中…" : "确认并发送"}
                          </Button>
                        </div>
                      </td>
                    ) : null}
                    {activeTab === "awaitingPo" ? (
                      <td className="max-w-[280px] px-3 py-3">
                        {confirmationProcessing ? (
                          <span className="inline-flex items-center gap-1.5 font-medium text-blue-700">
                            <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Processing…
                          </span>
                        ) : row.confirmationNote ? (
                          <span className="text-sm text-red-700">{row.confirmationNote}</span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
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
                    {showCompletionActionColumn ? (
                      <td className="px-3 py-3">
                        <Button
                          leftIcon={<Ban className="h-4 w-4" />}
                          onClick={() => void handleCompleteAction(row)}
                          disabled={ignoring}
                        >
                          {ignoring ? "忽略中…" : "忽略"}
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
        {!loading && filteredRows.length > 0 ? (
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            pageSize={PO_TODO_PAGE_SIZE}
            totalItems={filteredRows.length}
            onPageChange={setCurrentPage}
          />
        ) : null}
      </Card>

    </div>
  );
}
