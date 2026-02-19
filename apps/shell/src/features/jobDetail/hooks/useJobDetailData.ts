import { useCallback, useEffect, useRef, useState } from "react";
import type {
  JobDetailData,
  PaintService,
  PartsService,
  PartsServiceStatus,
  WofCheckItem,
  WofFailReason,
  WofRecord,
  WofRecordUpdatePayload,
} from "@/types";
import type { TagOption } from "@/components/MultiTagSelect";
import { fetchJob, fetchTags, updateJobNotes, updateJobTags, deleteJob as apiDeleteJob } from "../api/jobDetailApi";
import {
  fetchPaintService,
  createPaintService,
  updatePaintStage,
  updatePaintPanels,
  deletePaintService,
} from "@/features/paint/api/paintApi";
import { requestJson } from "@/utils/api";
import {
  createWofRecord,
  createWofResult,
  createWofServer,
  deleteWofServer,
  fetchWofFailReasons,
  fetchWofServer,
  importWofRecords,
  updateWofRecord,
} from "@/features/wof/api/wofApi";
import { mapWofRecord } from "@/features/wof/utils/mapWofRecord";
import {
  createPartsNote,
  createPartsService,
  deletePartsNote,
  deletePartsService,
  fetchPartsServices,
  updatePartsNote,
  updatePartsService,
} from "@/features/parts/api/partsApi";
import { useToast } from "@/components/ui";

type UseJobDetailDataArgs = {
  jobId?: string;
  onDeleted?: () => void;
};

export function useJobDetailData({ jobId, onDeleted }: UseJobDetailDataArgs) {
  const isMountedRef = useRef(true);
  const toast = useToast();
  const [jobData, setJobData] = useState<JobDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [wofRecords, setWofRecords] = useState<WofRecord[]>([]);
  const [wofLoading, setWofLoading] = useState(false);
  const [wofCheckItems, setWofCheckItems] = useState<WofCheckItem[]>([]);
  const [wofFailReasons, setWofFailReasons] = useState<WofFailReason[]>([]);
  const [partsServices, setPartsServices] = useState<PartsService[]>([]);
  const [partsLoading, setPartsLoading] = useState(false);
  const [paintService, setPaintService] = useState<PaintService | null>(null);
  const [paintLoading, setPaintLoading] = useState(false);
  const [tagOptions, setTagOptions] = useState<TagOption[]>([]);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deletingJob, setDeletingJob] = useState(false);
  const [hasWofRecord, setHasWofRecord] = useState(false);

  const refreshWofServer = useCallback(async () => {
    if (!jobId) return;
    setWofLoading(true);
    try {
      const wofRes = await fetchWofServer(jobId);
      if (!wofRes.ok) {
        throw new Error(wofRes.error || "加载 WOF 记录失败");
      }
      if (isMountedRef.current) {
        const wofData = wofRes.data;
        const hasWofServer = Boolean(wofData?.hasWofServer);
        setHasWofRecord(hasWofServer);
        setWofCheckItems(Array.isArray(wofData?.checkItems) ? wofData.checkItems : []);
        const results = Array.isArray(wofData?.results) ? wofData.results : [];
        setWofRecords(results.map(mapWofRecord));
      }
    } catch {
      if (isMountedRef.current) {
        setWofRecords([]);
        setWofCheckItems([]);
      }
    } finally {
      if (isMountedRef.current) {
        setWofLoading(false);
      }
    }
  }, [jobId]);

  const refreshPartsServices = useCallback(async () => {
    if (!jobId) return;
    setPartsLoading(true);
    try {
      const res = await fetchPartsServices(jobId);
      if (!res.ok) {
        throw new Error(res.error || "加载配件服务失败");
      }
      if (isMountedRef.current) {
        const list = Array.isArray(res.data) ? res.data : [];
        setPartsServices(list);
      }
    } catch {
      if (isMountedRef.current) {
        setPartsServices([]);
      }
    } finally {
      if (isMountedRef.current) {
        setPartsLoading(false);
      }
    }
  }, [jobId]);

  const refreshPaintService = useCallback(async () => {
    if (!jobId) return;
    setPaintLoading(true);
    try {
      const res = await fetchPaintService(jobId);
      if (!res.ok) {
        throw new Error(res.error || "加载喷漆服务失败");
      }
      const service = res.data?.service ? res.data.service : null;
      setPaintService(service);
    } catch {
      setPaintService(null);
    } finally {
      setPaintLoading(false);
    }
  }, [jobId]);

  const createWofServerForJob = useCallback(async () => {
    if (!jobId || wofLoading) return;
    if (hasWofRecord || wofRecords.length > 0 || wofCheckItems.length > 0) return;
    const res = await createWofServer(jobId);
    if (!res.ok) {
      toast.error(res.error || "创建失败");
      return;
    }
    if (jobId) {
      await refreshWofServer();
      toast.success("已创建 WOF 记录");
    }
  }, [jobId, wofLoading, hasWofRecord, wofRecords.length, wofCheckItems.length, refreshWofServer, toast]);

  const saveWofResult = useCallback(
    async (payload: { result: "Pass" | "Fail"; expiryDate?: string; failReasonId?: string; note?: string }) => {
      if (!jobId) {
        return { success: false, message: "缺少工单 ID" };
      }

      const res = await createWofResult(jobId, payload);
      if (!res.ok) {
        toast.error(res.error || "保存失败");
        return { success: false, message: res.error || "保存失败" };
      }

      await refreshWofServer();
      toast.success("保存成功");
      return { success: true, message: "保存成功" };
    },
    [jobId, refreshWofServer, toast]
  );

  const deleteWofServerForJob = useCallback(async () => {
    if (!jobId) {
      return { success: false, message: "缺少工单 ID" };
    }

    const res = await deleteWofServer(jobId);
    if (!res.ok) {
      toast.error(res.error || "删除失败");
      return { success: false, message: res.error || "删除失败" };
    }

    await refreshWofServer();
    toast.success("删除成功");
    return { success: true, message: "删除成功" };
  }, [jobId, refreshWofServer, toast]);

  const createPaintServiceRow = useCallback(
    async (status?: string, panels?: number) => {
      if (!jobId) {
        return { success: false, message: "缺少工单 ID" };
      }
      const res = await createPaintService(jobId, status, panels);
      if (!res.ok) {
        toast.error(res.error || "创建喷漆服务失败");
        return { success: false, message: res.error || "创建喷漆服务失败" };
      }
      setPaintService(res.data ?? null);
      toast.success("喷漆服务已创建");
      return { success: true, message: "喷漆服务已创建" };
    },
    [jobId, toast]
  );

  const updatePaintStageRow = useCallback(
    async (stageIndex: number) => {
      if (!jobId) {
        return { success: false, message: "缺少工单 ID" };
      }
      const res = await updatePaintStage(jobId, stageIndex);
      if (!res.ok) {
        toast.error(res.error || "更新喷漆阶段失败");
        return { success: false, message: res.error || "更新喷漆阶段失败" };
      }
      setPaintService((prev) =>
        prev
          ? {
              ...prev,
              status: res.data?.status ?? prev.status,
              currentStage: typeof res.data?.currentStage === "number" ? res.data.currentStage : prev.currentStage,
            }
          : prev
      );
      toast.success("喷漆阶段已更新");
      return { success: true, message: "喷漆阶段已更新" };
    },
    [jobId, toast]
  );

  const updatePaintPanelsRow = useCallback(
    async (panels: number) => {
      if (!jobId) {
        return { success: false, message: "缺少工单 ID" };
      }
      const res = await updatePaintPanels(jobId, panels);
      if (!res.ok) {
        toast.error(res.error || "更新喷漆片数失败");
        return { success: false, message: res.error || "更新喷漆片数失败" };
      }
      setPaintService((prev) =>
        prev ? { ...prev, panels: typeof res.data?.panels === "number" ? res.data.panels : panels } : prev
      );
      toast.success("喷漆片数已更新");
      return { success: true, message: "喷漆片数已更新" };
    },
    [jobId, toast]
  );

  const deletePaintServiceRow = useCallback(
    async () => {
      if (!jobId) {
        return { success: false, message: "缺少工单 ID" };
      }
      const res = await deletePaintService(jobId);
      if (!res.ok) {
        toast.error(res.error || "删除喷漆服务失败");
        return { success: false, message: res.error || "删除喷漆服务失败" };
      }
      setPaintService(null);
      toast.success("喷漆服务已删除");
      return { success: true, message: "喷漆服务已删除" };
    },
    [jobId, toast]
  );

  const saveJobNotes = useCallback(
    async (notes: string) => {
      if (!jobId) {
        return { success: false, message: "缺少工单 ID" };
      }

      const res = await updateJobNotes(jobId, notes);
      if (!res.ok) {
        toast.error(res.error || "保存备注失败");
        return { success: false, message: res.error || "保存备注失败" };
      }

      setJobData((prev) => (prev ? { ...prev, notes } : prev));
      toast.success("备注已更新");
      return { success: true, message: "备注已更新" };
    },
    [jobId, toast]
  );

  const createWofRecordRow = useCallback(
    async (payload: WofRecordUpdatePayload) => {
      if (!jobId) {
        return { success: false, message: "缺少工单 ID" };
      }

      const res = await createWofRecord(jobId, payload);
      if (!res.ok) {
        toast.error(res.error || "保存失败");
        return { success: false, message: res.error || "保存失败" };
      }

      await refreshWofServer();
      toast.success("保存成功");
      return { success: true, message: "保存成功" };
    },
    [jobId, refreshWofServer, toast]
  );

  const updateWofRecordRow = useCallback(
    async (recordId: string, payload: WofRecordUpdatePayload) => {
      if (!jobId) {
        return { success: false, message: "缺少工单 ID" };
      }

      const res = await updateWofRecord(jobId, recordId, payload);
      if (!res.ok) {
        toast.error(res.error || "保存失败");
        return { success: false, message: res.error || "保存失败" };
      }

      await refreshWofServer();
      toast.success("保存成功");
      return { success: true, message: "保存成功" };
    },
    [jobId, refreshWofServer, toast]
  );

  const importWofRecordsForJob = useCallback(async () => {
    if (!jobId) {
      return { success: false, message: "缺少工单 ID" };
    }
    if (wofLoading) {
      return { success: false, message: "正在加载，请稍后" };
    }

    const res = await importWofRecords(jobId);
    if (!res.ok) {
      toast.error(res.error || "导入失败");
      return { success: false, message: res.error || "导入失败" };
    }

    await refreshWofServer();
    const inserted = Number(res.data?.inserted ?? 0);
    const updated = Number(res.data?.updated ?? 0);
    const skipped = Number(res.data?.skipped ?? 0);
    const sourceFile = res.data?.sourceFile ? `（${res.data.sourceFile}）` : "";
    const message = `导入完成${sourceFile}：新增 ${inserted} 条，更新 ${updated} 条，跳过 ${skipped} 条`;
    toast.success(message);
    return {
      success: true,
      message,
    };
  }, [jobId, wofLoading, refreshWofServer, toast]);

  const createPartsServiceRow = useCallback(
    async (payload: { description: string; status?: PartsServiceStatus }) => {
      if (!jobId) {
        return { success: false, message: "缺少工单 ID" };
      }

      const res = await createPartsService(jobId, payload);
      if (!res.ok) {
        toast.error(res.error || "保存失败");
        return { success: false, message: res.error || "保存失败" };
      }

      await refreshPartsServices();
      toast.success("保存成功");
      return { success: true, message: "保存成功" };
    },
    [jobId, refreshPartsServices, toast]
  );

  const updatePartsServiceRow = useCallback(
    async (serviceId: string, payload: { description?: string; status?: PartsServiceStatus }) => {
      if (!jobId) {
        return { success: false, message: "缺少工单 ID" };
      }

      const res = await updatePartsService(jobId, serviceId, payload);
      if (!res.ok) {
        toast.error(res.error || "保存失败");
        return { success: false, message: res.error || "保存失败" };
      }

      await refreshPartsServices();
      toast.success("保存成功");
      return { success: true, message: "保存成功" };
    },
    [jobId, refreshPartsServices, toast]
  );

  const deletePartsServiceRow = useCallback(
    async (serviceId: string) => {
      if (!jobId) {
        return { success: false, message: "缺少工单 ID" };
      }

      const res = await deletePartsService(jobId, serviceId);
      if (!res.ok) {
        toast.error(res.error || "删除失败");
        return { success: false, message: res.error || "删除失败" };
      }

      await refreshPartsServices();
      toast.success("删除成功");
      return { success: true, message: "删除成功" };
    },
    [jobId, refreshPartsServices, toast]
  );

  const createPartsNoteRow = useCallback(
    async (serviceId: string, note: string) => {
      if (!jobId) {
        return { success: false, message: "缺少工单 ID" };
      }

      const res = await createPartsNote(jobId, serviceId, note);
      if (!res.ok) {
        toast.error(res.error || "保存失败");
        return { success: false, message: res.error || "保存失败" };
      }

      await refreshPartsServices();
      toast.success("保存成功");
      return { success: true, message: "保存成功" };
    },
    [jobId, refreshPartsServices, toast]
  );

  const updatePartsNoteRow = useCallback(
    async (noteId: string, note: string) => {
      if (!jobId) {
        return { success: false, message: "缺少工单 ID" };
      }

      const res = await updatePartsNote(jobId, noteId, note);
      if (!res.ok) {
        toast.error(res.error || "保存失败");
        return { success: false, message: res.error || "保存失败" };
      }

      await refreshPartsServices();
      toast.success("保存成功");
      return { success: true, message: "保存成功" };
    },
    [jobId, refreshPartsServices, toast]
  );

  const deletePartsNoteRow = useCallback(
    async (noteId: string) => {
      if (!jobId) {
        return { success: false, message: "缺少工单 ID" };
      }

      const res = await deletePartsNote(jobId, noteId);
      if (!res.ok) {
        toast.error(res.error || "删除失败");
        return { success: false, message: res.error || "删除失败" };
      }

      await refreshPartsServices();
      toast.success("删除成功");
      return { success: true, message: "删除成功" };
    },
    [jobId, refreshPartsServices, toast]
  );

  const deleteJob = useCallback(async () => {
    if (!jobId) return;
    if (!window.confirm("确定删除该工单及相关数据？")) return;
    setDeletingJob(true);
    setDeleteError(null);
    try {
      const res = await apiDeleteJob(jobId);
      if (!res.ok) {
        throw new Error(res.error || "删除失败");
      }
      toast.success("已删除");
      onDeleted?.();
    } catch (err) {
      const message = err instanceof Error ? err.message : "删除失败";
      setDeleteError(message);
      toast.error(message);
    } finally {
      setDeletingJob(false);
    }
  }, [jobId, onDeleted, toast]);

  const saveTags = useCallback(
    async (tagIds: string[]) => {
      if (!jobId) return { success: false, message: "缺少工单 ID" };
      const res = await updateJobTags(
        jobId,
        tagIds.map((t) => Number(t))
      );
      if (!res.ok) {
        toast.error(res.error || "保存失败");
        return { success: false, message: res.error || "保存失败" };
      }
      const nameMap = new Map(tagOptions.map((t) => [t.id, t.label]));
      setJobData((prev) =>
        prev
          ? {
              ...prev,
              tags: tagIds.map((t) => nameMap.get(String(t)) || String(t)),
            }
          : prev
      );
      toast.success("保存成功");
      return { success: true, message: "保存成功", tags: res.data?.tags };
    },
    [jobId, tagOptions, toast]
  );

  const refreshVehicleInfo = useCallback(async () => {
    if (!jobId) {
      return { success: false, message: "缺少工单 ID" };
    }
    const plate = jobData?.vehicle?.plate;
    if (!plate) {
      return { success: false, message: "缺少车牌信息" };
    }

    const importRes = await requestJson<any>("/api/carjam/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plate }),
    });
    if (!importRes.ok) {
      toast.error(importRes.error || "抓取失败，请稍后重试");
      return { success: false, message: importRes.error || "抓取失败，请稍后重试" };
    }

    const jobRes = await fetchJob(jobId);
    if (!jobRes.ok) {
      toast.error(jobRes.error || "刷新车辆信息失败");
      return { success: false, message: jobRes.error || "刷新车辆信息失败" };
    }

    const data = jobRes.data as any;
    const job = data?.job ?? data;
    setJobData(job ?? null);

    const vehicle = job?.vehicle;
    const label = [vehicle?.year, vehicle?.make, vehicle?.model].filter(Boolean).join(" ");
    toast.success(label ? `抓取成功：${label}` : "抓取成功");
    return { success: true, message: label ? `抓取成功：${label}` : "抓取成功" };
  }, [jobId, jobData?.vehicle?.plate, toast]);

  useEffect(() => {
    let cancelled = false;
    isMountedRef.current = true;

    const loadWofFailReasons = async () => {
      const res = await fetchWofFailReasons();
      if (!res.ok) {
        if (!cancelled) setWofFailReasons([]);
        return;
      }
      if (!cancelled) {
        const list = Array.isArray(res.data) ? res.data : [];
        setWofFailReasons(list.filter((item) => item?.isActive !== false));
      }
    };

    const loadTagOptions = async () => {
      const res = await fetchTags();
      if (!res.ok) {
        if (!cancelled) setTagOptions([]);
        return;
      }
      if (!cancelled) {
        const tags = Array.isArray(res.data) ? res.data : [];
        setTagOptions(
          tags
            .filter((tag: any) => tag?.isActive !== false && typeof tag?.name === "string")
            .map((tag: any) => ({ id: String(tag.id), label: tag.name }))
        );
      }
    };

    const loadJob = async () => {
      if (!jobId) {
        setLoadError("缺少工单 ID");
        setLoading(false);
        return;
      }

      setLoading(true);
      setLoadError(null);

      try {
        const res = await fetchJob(jobId);
        if (!res.ok) {
          throw new Error(res.error || "加载工单失败");
        }

        const data = res.data;
        const job = (data as any)?.job ?? data;

        if (!cancelled) {
          setJobData(job ?? null);
          if (typeof (data as any)?.hasWofRecord === "boolean") {
            setHasWofRecord((data as any).hasWofRecord);
          }
        }

        await refreshWofServer();
        await refreshPartsServices();
        await refreshPaintService();
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : "加载工单失败");
          setJobData(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadJob();
    loadWofFailReasons();
    loadTagOptions();

    return () => {
      cancelled = true;
      isMountedRef.current = false;
    };
  }, [jobId, refreshWofServer, refreshPartsServices, refreshPaintService]);

  return {
    jobData,
    loading,
    loadError,
    deleteError,
    deletingJob,
    hasWofRecord,
    wofRecords,
    wofCheckItems,
    wofFailReasons,
    wofLoading,
    partsServices,
    partsLoading,
    paintService,
    paintLoading,
    tagOptions,
    setLoadError,
    setDeleteError,
    createWofServer: createWofServerForJob,
    saveWofResult,
    deleteWofServer: deleteWofServerForJob,
    createWofRecordRow,
    updateWofRecord: updateWofRecordRow,
    importWofRecords: importWofRecordsForJob,
    createPartsService: createPartsServiceRow,
    updatePartsService: updatePartsServiceRow,
    deletePartsService: deletePartsServiceRow,
    createPartsNote: createPartsNoteRow,
    updatePartsNote: updatePartsNoteRow,
    deletePartsNote: deletePartsNoteRow,
    refreshPartsServices,
    deleteJob,
    saveTags,
    saveJobNotes,
    createPaintService: createPaintServiceRow,
    updatePaintStage: updatePaintStageRow,
    updatePaintPanels: updatePaintPanelsRow,
    deletePaintService: deletePaintServiceRow,
    refreshPaintService,
    refreshVehicleInfo,
  };
}
