import { Link, useSearchParams } from "react-router-dom";
import { Archive, Plus, RefreshCw, Tags, Trash2 } from "lucide-react";
import { DeleteJobDialog } from "@/components/common/DeleteJobDialog";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import {
  createDeletingDeleteJobSteps,
  createInitialDeleteJobSteps,
  type DeleteJobApiSteps,
  resolveDeleteJobDialogSteps,
} from "@/components/common/DeleteJobDialogState";
import { Card, Button, EmptyState, Alert, useToast, Pagination } from "@/components/ui";
import { withApiBase } from "@/utils/api";
import { JobsFiltersCard } from "./JobsFiltersCard";
import { JobsTable } from "./JobsTable";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  useJobsQuery, JOBS_PAGE_SIZE, filtersToSearchParams,
  searchParamsToFilters,
  getPageFromSearchParams,
  DEFAULT_JOBS_FILTERS,
  usePoUnreadSummary,
} from "@/features/jobs";
import { useJobSheetPrinter } from "@/features/printing/useJobSheetPrinter";
import { MultiTagSelect, type TagOption } from "@/components/MultiTagSelect";
import {
  deleteJob,
  fetchJob,
  updateJobCreatedAt,
  updateJobStatus,
  updateJobTags,
} from "@/features/jobDetail/api/jobDetailApi";
import { fetchPaintService, updatePaintStage } from "@/features/paint/api/paintApi";
import { updateMechWorkflow, type MechWorkflowStatus } from "@/features/mechWorkflow";
import { parseTimestamp } from "@/utils/date";
import type { SilentPrintRouteKey } from "@/features/printing/silentPrint.routes";
import type { JobRow } from "@/types/JobType";
import {
  notifyPaintBoardRefresh,
  notifyPartsFlowRefresh,
  notifyPoDashboardRefresh,
  notifyWofScheduleRefresh,
} from "@/utils/refreshSignals";

type JobsListResponse = {
  items?: JobRow[];
  totalItems?: number;
  totalPages?: number;
  currentPage?: number;
  pageSize?: number;
};

type ApiErrorPayload = {
  error?: string;
};

type XeroStatusSyncResponse = {
  requested: number;
  processed: number;
  succeeded: number;
  skipped: number;
  failed: number;
  requeued: number;
};

type TagsApiRow = {
  isActive?: boolean;
  name?: string;
};

type JobDetailApiData = {
  job?: JobDetailPayload;
} & Partial<JobDetailPayload>;

type JobDetailPayload = {
  notes?: string | null;
  createdAt?: string | null;
  hasWofService?: boolean | null;
  customer?: {
    notes?: string | null;
    businessCode?: string | null;
    name?: string | null;
  } | null;
  vehicle?: {
    plate?: string | null;
    make?: string | null;
    model?: string | null;
    year?: number | string | null;
    nzFirstRegistration?: string | null;
    vin?: string | null;
  } | null;
};

type PrintJobSheetRow = {
  plate: string;
  vehicleModel: string;
  customerCode: string;
  customerName: string;
  createdAt: string;
  panels: number | null;
  nzFirstRegistration: string;
  vin: string;
};

export function JobsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialFilters = searchParamsToFilters(searchParams);
  const initialPage = getPageFromSearchParams(searchParams);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tagOptions, setTagOptions] = useState<TagOption[]>([]);
  const [totalItems, setTotalItems] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteDialogPhase, setDeleteDialogPhase] = useState<"confirm" | "status">("confirm");
  const [deleteDialogSteps, setDeleteDialogSteps] = useState(() => createInitialDeleteJobSteps());
  const [deleteDialogError, setDeleteDialogError] = useState<string | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [deleteCompletedId, setDeleteCompletedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [batchTags, setBatchTags] = useState<string[]>([]);
  const [batchBusy, setBatchBusy] = useState<"archive" | "delete" | "tag" | "xero" | null>(null);
  const [pendingBatchAction, setPendingBatchAction] = useState<"archive" | "delete" | null>(null);
  const toast = useToast();
  const poUnreadSummary = usePoUnreadSummary();

  const buildCreatedAtWithDate = (prevValue: string, date: string) => {
    const parsed = parseTimestamp(prevValue);
    const [year, month, day] = date.split("-").map((x) => Number(x));
    if (!year || !month || !day) return prevValue;
    const hours = parsed?.getUTCHours() ?? 0;
    const minutes = parsed?.getUTCMinutes() ?? 0;
    const seconds = parsed?.getUTCSeconds() ?? 0;
    const millis = parsed?.getUTCMilliseconds() ?? 0;
    const next = new Date(Date.UTC(year, month - 1, day, hours, minutes, seconds, millis));
    return Number.isNaN(next.getTime()) ? prevValue : next.toISOString();
  };

  const {
    filters,
    setFilters,
    currentPage,
    setCurrentPage,
    pageSize,
    visibleRows,
    setAllRows,
  } = useJobsQuery({
    initialRows: [],
    pageSize: JOBS_PAGE_SIZE,
    initialFilters,
    initialPage,
  });

  const safePage = Math.min(Math.max(1, currentPage), Math.max(1, totalPages));

  const didSyncRef = useRef(false);
  useEffect(() => {
    if (!didSyncRef.current) {
      didSyncRef.current = true;
      return;
    }

    const next = filtersToSearchParams(filters);
    if (safePage > 1) next.set("page", String(safePage));
    setSearchParams(next, { replace: true });
  }, [filters, safePage, setSearchParams]);

  const onReset = () => {
    setFilters(DEFAULT_JOBS_FILTERS);
    setCurrentPage(1);
    setSearchParams(new URLSearchParams(), { replace: true });
  };

  const loadJobs = useCallback(async (isCancelled: () => boolean = () => false) => {
    setLoading(true);
    setLoadError(null);
    try {
      const params = filtersToSearchParams(filters);
      params.set("page", String(currentPage));
      params.set("pageSize", String(pageSize));

      const query = params.toString();
      const res = await fetch(withApiBase(`/api/jobs${query ? `?${query}` : ""}`));
      const data: JobsListResponse | JobRow[] | null = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error((data as ApiErrorPayload | null)?.error || "加载工单失败");
      }

      const rows = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : [];
      const rowsWithUnreadDefaults: JobRow[] = rows.map((row) => ({
        ...row,
        poUnreadReplyCount: Number(row.poUnreadReplyCount ?? 0),
        selectedTags: Array.isArray(row.selectedTags) ? row.selectedTags : [],
      }));

      if (!isCancelled()) {
        setAllRows(rowsWithUnreadDefaults);
        setTotalItems(Array.isArray(data) ? rows.length : Number(data?.totalItems ?? rows.length));
        setTotalPages(Array.isArray(data) ? Math.max(1, Math.ceil(rows.length / pageSize)) : Math.max(1, Number(data?.totalPages ?? 1)));
        if (!Array.isArray(data) && data?.currentPage && Number(data.currentPage) !== currentPage) {
          setCurrentPage(Number(data.currentPage));
        }
      }
    } catch (err) {
      if (!isCancelled()) {
        setAllRows([]);
        setTotalItems(0);
        setTotalPages(1);
        const message = err instanceof Error ? err.message : "加载工单失败";
        setLoadError(message);
        toast.error(message);
      }
    } finally {
      if (!isCancelled()) setLoading(false);
    }
  }, [currentPage, filters, pageSize, setAllRows, setCurrentPage, toast]);

  useEffect(() => {
    let cancelled = false;
    void loadJobs(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, [loadJobs]);

  useEffect(() => {
    let cancelled = false;

    const loadTags = async () => {
      try {
        const res = await fetch(withApiBase("/api/tags"));
        const data: TagsApiRow[] | ApiErrorPayload | null = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error((data as ApiErrorPayload | null)?.error || "加载标签失败");
        }
        const tags = Array.isArray(data) ? data : [];
        if (!cancelled) {
          const activeTags = tags.filter(
            (tag) => tag?.isActive !== false && typeof tag?.name === "string"
          );
          setTagOptions(activeTags.map((tag) => ({ id: tag.name!, label: tag.name! })));
        }
      } catch {
        if (!cancelled) {
          setTagOptions([]);
        }
      }
    };

    loadTags();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const unreadByJobId = new Map(
      poUnreadSummary.items.map((item) => [item.jobId, Number(item.unreadReplyCount) || 0])
    );

    setAllRows((prev) =>
      prev.map((item) => ({
        ...item,
        poUnreadReplyCount: unreadByJobId.get(item.id) ?? 0,
      }))
    );
  }, [poUnreadSummary.items, setAllRows]);

  useEffect(() => {
    const visibleIds = new Set(visibleRows.map((row) => row.id));
    setSelectedIds((prev) => {
      const next = new Set(Array.from(prev).filter((id) => visibleIds.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [visibleRows]);

  const selectedRows = visibleRows.filter((row) => selectedIds.has(row.id));
  const selectedCount = selectedRows.length;

  const toggleSelected = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAllVisible = useCallback(
    (checked: boolean) => {
      setSelectedIds(checked ? new Set(visibleRows.map((row) => row.id)) : new Set());
    },
    [visibleRows]
  );

  const clearSelection = useCallback(() => {
    setSelectedIds(new Set());
    setBatchTags([]);
  }, []);

  const handleArchive = useCallback(
    async (id: string) => {
      const res = await updateJobStatus(id, "Archived");
      if (!res.ok) {
        setLoadError(res.error || "归档失败");
        toast.error(res.error || "归档失败");
        return;
      }
      setAllRows((prev) =>
        prev.map((item) =>
          item.id === id
            ? {
                ...item,
                vehicleStatus: "Archived",
              }
            : item
        )
      );
      notifyPaintBoardRefresh();
      notifyWofScheduleRefresh();
      notifyPartsFlowRefresh();
      notifyPoDashboardRefresh();
      toast.success("已归档");
      void loadJobs();
    },
    [loadJobs, setAllRows, toast]
  );

  const handleBatchXeroStatusSync = useCallback(async () => {
    if (selectedCount === 0) return;
    setBatchBusy("xero");
    try {
      const res = await fetch(withApiBase("/api/jobs/xero-status/sync"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobIds: selectedRows.map((row) => Number(row.id)) }),
      });
      const data: XeroStatusSyncResponse | ApiErrorPayload | null = await res.json().catch(() => null);
      if (!res.ok) throw new Error((data as ApiErrorPayload | null)?.error || "获取 Xero 状态失败");

      const result = data as XeroStatusSyncResponse;
      if (result.failed > 0) {
        toast.error(
          `Xero 状态已更新 ${result.succeeded} 个，重新请求创建 ${result.requeued} 个，失败 ${result.failed} 个`
        );
      } else if (result.requeued > 0) {
        toast.success(
          `Xero 状态已更新 ${result.succeeded} 个，已重新请求创建 ${result.requeued} 个缺失发票`
        );
      } else if (result.skipped > 0) {
        toast.success(`Xero 状态已更新 ${result.succeeded} 个，${result.skipped} 个没有关联发票`);
      } else {
        toast.success(`已更新 ${result.succeeded} 个工单的 Xero 状态`);
      }
      clearSelection();
      await loadJobs();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "获取 Xero 状态失败");
    } finally {
      setBatchBusy(null);
    }
  }, [clearSelection, loadJobs, selectedCount, selectedRows, toast]);

  const handleBatchArchive = useCallback(async () => {
    if (selectedCount === 0) return;
    setBatchBusy("archive");
    const results = await Promise.all(selectedRows.map((row) => updateJobStatus(row.id, "Archived")));
    const failed = results.filter((res) => !res.ok);
    setBatchBusy(null);

    if (failed.length > 0) {
      toast.error(`${failed.length} 个工单归档失败`);
    } else {
      toast.success(`已归档 ${selectedCount} 个工单`);
    }

    notifyPaintBoardRefresh();
    notifyWofScheduleRefresh();
    notifyPartsFlowRefresh();
    notifyPoDashboardRefresh();
    clearSelection();
    void loadJobs();
  }, [clearSelection, loadJobs, selectedCount, selectedRows, toast]);

  const handleBatchDelete = useCallback(async () => {
    if (selectedCount === 0) return;

    setBatchBusy("delete");
    const results = await Promise.all(selectedRows.map((row) => deleteJob(row.id)));
    const failed = results.filter((res) => !res.ok);
    setBatchBusy(null);

    if (failed.length > 0) {
      toast.error(`${failed.length} 个工单删除失败`);
    } else {
      toast.success(`已删除 ${selectedCount} 个工单`);
    }

    clearSelection();
    void loadJobs();
  }, [clearSelection, loadJobs, selectedCount, selectedRows, toast]);

  const handleConfirmBatchAction = useCallback(async () => {
    const action = pendingBatchAction;
    if (action === "archive") {
      await handleBatchArchive();
    } else if (action === "delete") {
      await handleBatchDelete();
    }
    setPendingBatchAction(null);
  }, [handleBatchArchive, handleBatchDelete, pendingBatchAction]);

  const handleBatchAddTags = useCallback(async () => {
    if (selectedCount === 0) return;
    if (batchTags.length === 0) {
      toast.info("请选择要添加的 tag");
      return;
    }

    setBatchBusy("tag");
    const results = await Promise.all(
      selectedRows.map((row) => {
        const nextTags = Array.from(new Set([...(row.selectedTags ?? []), ...batchTags]));
        return updateJobTags(row.id, [], nextTags);
      })
    );
    const failed = results.filter((res) => !res.ok);
    setBatchBusy(null);

    if (failed.length > 0) {
      toast.error(`${failed.length} 个工单添加 tag 失败`);
    } else {
      toast.success(`已给 ${selectedCount} 个工单添加 tag`);
    }

    clearSelection();
    void loadJobs();
  }, [batchTags, clearSelection, loadJobs, selectedCount, selectedRows, toast]);


  const handleDelete = useCallback(
    async () => {
      if (!deleteTargetId) return;

      setDeleteDialogPhase("status");
      setDeleteDialogError(null);
      setDeleteDialogSteps(createDeletingDeleteJobSteps());

      const res = await deleteJob(deleteTargetId);
      setDeleteDialogSteps(
        resolveDeleteJobDialogSteps(
          (res.data as { steps?: DeleteJobApiSteps } | null)?.steps,
          res.ok
        )
      );
      setDeleteDialogError(res.ok ? null : res.error || "删除失败");
      setDeleteCompletedId(res.ok ? deleteTargetId : null);
    },
    [deleteTargetId]
  );

  const openDeleteDialog = useCallback((id: string) => {
    setDeleteTargetId(id);
    setDeleteCompletedId(null);
    setDeleteDialogError(null);
    setDeleteDialogPhase("confirm");
    setDeleteDialogSteps(createInitialDeleteJobSteps());
    setDeleteDialogOpen(true);
  }, []);

  const closeDeleteDialog = useCallback(() => {
    setDeleteDialogOpen(false);
    if (deleteCompletedId) {
      setAllRows((prev) => prev.filter((item) => item.id !== deleteCompletedId));
      setTotalItems((prev) => Math.max(0, prev - 1));
      void loadJobs();
    }
    setDeleteTargetId(null);
    setDeleteCompletedId(null);
  }, [deleteCompletedId, loadJobs, setAllRows]);

  const handleUpdateCreatedAt = useCallback(
    async (id: string, date: string) => {
      const res = await updateJobCreatedAt(id, date);
      if (!res.ok) {
        setLoadError(res.error || "更新创建日期失败");
        toast.error(res.error || "更新创建日期失败");
        return false;
      }
      setAllRows((prev) =>
        prev.map((item) =>
          item.id === id
            ? {
                ...item,
                createdAt: res.data?.createdAt
                  ? String(res.data.createdAt)
                  : buildCreatedAtWithDate(item.createdAt, date),
              }
            : item
        )
      );
      toast.success("创建日期已更新");
      void loadJobs();
      return true;
    },
    [loadJobs, setAllRows, toast]
  );

  const handleUpdatePaintStatus = useCallback(
    async (id: string, stageIndex: number) => {
      const res = await updatePaintStage(id, stageIndex);
      if (!res.ok) {
        setLoadError(res.error || "更新喷漆状态失败");
        toast.error(res.error || "更新喷漆状态失败");
        return false;
      }

      setAllRows((prev) =>
        prev.map((item) =>
          item.id === id
            ? {
                ...item,
                paintStatus: res.data?.status ?? item.paintStatus,
                paintCurrentStage:
                  typeof res.data?.currentStage === "number" ? Number(res.data.currentStage) : item.paintCurrentStage,
              }
            : item
        )
      );
      toast.success("喷漆状态已更新");
      void loadJobs();
      return true;
    },
    [loadJobs, setAllRows, toast]
  );

  const handleUpdateMechStatus = useCallback(
    async (id: string, status: MechWorkflowStatus) => {
      const res = await updateMechWorkflow(id, status, { direct: true });
      if (!res.ok || !res.data) {
        setLoadError(res.error || "更新机修状态失败");
        toast.error(res.error || "更新机修状态失败");
        return false;
      }

      setAllRows((prev) =>
        prev.map((item) =>
          item.id === id
            ? { ...item, mechStatus: res.data?.status ?? status }
            : item
        )
      );
      localStorage.setItem("mech-board:workflow-updated", String(Date.now()));
      window.dispatchEvent(new Event("mech-board:workflow-updated"));
      toast.success("机修状态已更新");
      return true;
    },
    [setAllRows, toast]
  );

  const resolveJobSheetData = useCallback(
    async (id: string) => {
      const jobRes = await fetchJob(id);
      if (!jobRes.ok) return null;
      const payload = jobRes.data as JobDetailApiData | null;
      const job = payload?.job ?? payload;

      const paintRes = await fetchPaintService(id);
      const paintPanels =
        paintRes.ok && paintRes.data?.exists && paintRes.data?.service?.panels !== undefined
          ? Number(paintRes.data.service.panels)
          : null;

      const notes = job?.notes ?? job?.customer?.notes ?? "";

      const row: PrintJobSheetRow = {
        plate: job?.vehicle?.plate ?? "",
        vehicleModel: [job?.vehicle?.make, job?.vehicle?.model, job?.vehicle?.year]
          .filter(Boolean)
          .join(" "),
        customerCode: job?.customer?.businessCode ?? "",
        customerName: job?.customer?.name ?? "",
        createdAt: job?.createdAt ?? "",
        panels: Number.isFinite(paintPanels) ? paintPanels : null,
        nzFirstRegistration: job?.vehicle?.nzFirstRegistration ?? "",
        vin: job?.vehicle?.vin ?? "",
      };

      return {
        row,
        notes,
        routeKey: job?.hasWofService ? "job-wof" : "job-mech",
      } satisfies { row: PrintJobSheetRow; notes: string; routeKey: SilentPrintRouteKey };
    },
    []
  );

  const { printById } = useJobSheetPrinter({
    onPopupBlocked: () => toast.error("打印预览窗口被浏览器拦截，请允许弹窗后重试"),
    resolveById: resolveJobSheetData,
    printMode: "preview",
  });

  const handlePrintTemplate = useCallback(
    async (id: string, type: "mech" | "paint") => {
      const routeKey = type === "paint" ? "job-pnp" : undefined;
      await printById(id, type, routeKey);
    },
    [printById]
  );

  const handlePrintMech = useCallback(
    async (id: string) => handlePrintTemplate(id, "mech"),
    [handlePrintTemplate]
  );

  const handlePrintPaint = useCallback(
    async (id: string) => handlePrintTemplate(id, "paint"),
    [handlePrintTemplate]
  );

  return (
    <div className="space-y-4 text-[14px]">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold text-[rgba(0,0,0,0.72)]">Jobs</h1>
        {poUnreadSummary.totalUnreadReplies > 0 ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
            待处理 PO 回复 {poUnreadSummary.totalUnreadReplies} 封，涉及 {poUnreadSummary.affectedJobs} 个工单
          </div>
        ) : null}
      </div>

      {loadError ? (
        <Alert variant="error" description={loadError} onClose={() => setLoadError(null)} />
      ) : null}

      <JobsFiltersCard value={filters} onChange={setFilters} onReset={onReset} tagOptions={tagOptions} />

      <div className="flex justify-end">
        <Link to="/jobs/new">
          <Button variant="primary" leftIcon={<Plus size={16} />}>
            Add New Job
          </Button>
        </Link>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[8px] border border-[var(--ds-border)] bg-white px-3 py-3">
        <div className="text-sm font-medium text-[var(--ds-text)]">
          已选择 {selectedCount} 个工单
        </div>
        <div className="flex min-w-[280px] flex-1 flex-wrap items-center justify-end gap-2">
          <div className="w-[260px]">
            <MultiTagSelect
              options={tagOptions}
              value={batchTags}
              onChange={setBatchTags}
              placeholder="批量添加 tag"
              maxChips={1}
            />
          </div>
          <Button
            leftIcon={<Tags size={16} />}
            disabled={selectedCount === 0 || batchBusy !== null}
            onClick={() => void handleBatchAddTags()}
          >
            加 Tag
          </Button>
          <Button
            leftIcon={<Archive size={16} />}
            disabled={selectedCount === 0 || batchBusy !== null}
            onClick={() => setPendingBatchAction("archive")}
          >
            归档
          </Button>
          <Button
            leftIcon={<RefreshCw size={16} className={batchBusy === "xero" ? "animate-spin" : ""} />}
            disabled={selectedCount === 0 || batchBusy !== null}
            onClick={() => void handleBatchXeroStatusSync()}
          >
            {batchBusy === "xero" ? "正在获取..." : "批量获取 Xero 状态"}
          </Button>
          <Button
            leftIcon={<Trash2 size={16} />}
            disabled={selectedCount === 0 || batchBusy !== null}
            className="text-red-600 hover:bg-red-50"
            onClick={() => setPendingBatchAction("delete")}
          >
            删除
          </Button>
          {selectedCount > 0 ? (
            <Button disabled={batchBusy !== null} onClick={clearSelection}>
              清空
            </Button>
          ) : null}
        </div>
      </div>

      <Card className="overflow-hidden">
        {loading ? (
          <div className="py-10 text-center text-sm text-[var(--ds-muted)]">加载中...</div>
        ) : totalItems === 0 ? (
          <EmptyState message="暂无工单" />
        ) : (
          <>
            <JobsTable
              rows={visibleRows}
              selectedIds={selectedIds}
              onToggleSelected={toggleSelected}
              onToggleAllVisible={toggleAllVisible}
              onArchive={handleArchive}
              onDelete={openDeleteDialog}
              onUpdateCreatedAt={handleUpdateCreatedAt}
              onUpdateMechStatus={handleUpdateMechStatus}
              onUpdatePaintStatus={handleUpdatePaintStatus}
              onPrintMech={handlePrintMech}
              onPrintPaint={handlePrintPaint}
            />

            <Pagination
              currentPage={safePage}
              totalPages={totalPages}
              pageSize={pageSize}
              totalItems={totalItems}
              onPageChange={setCurrentPage}
            />
          </>
        )}
      </Card>
      <DeleteJobDialog
        open={deleteDialogOpen}
        isDeleting={deleteDialogPhase === "status" && !deleteDialogError && !deleteCompletedId}
        phase={deleteDialogPhase}
        errorMessage={deleteDialogError}
        steps={deleteDialogSteps}
        onConfirm={() => void handleDelete()}
        onClose={closeDeleteDialog}
      />
      <ConfirmDialog
        open={pendingBatchAction !== null}
        title={pendingBatchAction === "archive" ? "确认批量归档" : "确认批量删除"}
        message={
          pendingBatchAction === "archive"
            ? `即将归档选中的 ${selectedCount} 个工单。\n请确认这不是误触，是否继续？`
            : `即将永久删除选中的 ${selectedCount} 个工单。\n删除操作无法撤销，请确认是否继续？`
        }
        confirmLabel={pendingBatchAction === "archive" ? "Yes，确认归档" : "Yes，确认删除"}
        cancelLabel="Cancel"
        isProcessing={batchBusy === pendingBatchAction}
        onConfirm={() => void handleConfirmBatchAction()}
        onClose={() => {
          if (batchBusy !== null) return;
          setPendingBatchAction(null);
        }}
      />
    </div>
  );
}
