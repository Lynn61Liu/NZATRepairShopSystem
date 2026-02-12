import { useCallback, useEffect, useRef, useState } from "react";
import type {
  JobDetailData,
  PartsService,
  PartsServiceStatus,
  WofCheckItem,
  WofFailReason,
  WofRecord,
  WofRecordUpdatePayload,
} from "@/types";
import type { TagOption } from "@/components/MultiTagSelect";
import { fetchJob, fetchTags, updateJobTags, deleteJob as apiDeleteJob } from "../api/jobDetailApi";
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

type UseJobDetailDataArgs = {
  jobId?: string;
  onDeleted?: () => void;
};

export function useJobDetailData({ jobId, onDeleted }: UseJobDetailDataArgs) {
  const isMountedRef = useRef(true);
  const [jobData, setJobData] = useState<JobDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [wofRecords, setWofRecords] = useState<WofRecord[]>([]);
  const [wofLoading, setWofLoading] = useState(false);
  const [wofCheckItems, setWofCheckItems] = useState<WofCheckItem[]>([]);
  const [wofFailReasons, setWofFailReasons] = useState<WofFailReason[]>([]);
  const [partsServices, setPartsServices] = useState<PartsService[]>([]);
  const [partsLoading, setPartsLoading] = useState(false);
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

  const createWofServerForJob = useCallback(async () => {
    if (!jobId || wofLoading) return;
    if (hasWofRecord || wofRecords.length > 0 || wofCheckItems.length > 0) return;
    const res = await createWofServer(jobId);
    if (res.ok && jobId) {
      await refreshWofServer();
    }
  }, [jobId, wofLoading, hasWofRecord, wofRecords.length, wofCheckItems.length, refreshWofServer]);

  const saveWofResult = useCallback(
    async (payload: { result: "Pass" | "Fail"; expiryDate?: string; failReasonId?: string; note?: string }) => {
      if (!jobId) {
        return { success: false, message: "缺少工单 ID" };
      }

      const res = await createWofResult(jobId, payload);
      if (!res.ok) {
        return { success: false, message: res.error || "保存失败" };
      }

      await refreshWofServer();
      return { success: true, message: "保存成功" };
    },
    [jobId, refreshWofServer]
  );

  const deleteWofServerForJob = useCallback(async () => {
    if (!jobId) {
      return { success: false, message: "缺少工单 ID" };
    }

    const res = await deleteWofServer(jobId);
    if (!res.ok) {
      return { success: false, message: res.error || "删除失败" };
    }

    await refreshWofServer();
    return { success: true, message: "删除成功" };
  }, [jobId, refreshWofServer]);

  const createWofRecordRow = useCallback(
    async (payload: WofRecordUpdatePayload) => {
      if (!jobId) {
        return { success: false, message: "缺少工单 ID" };
      }

      const res = await createWofRecord(jobId, payload);
      if (!res.ok) {
        return { success: false, message: res.error || "保存失败" };
      }

      await refreshWofServer();
      return { success: true, message: "保存成功" };
    },
    [jobId, refreshWofServer]
  );

  const updateWofRecordRow = useCallback(
    async (recordId: string, payload: WofRecordUpdatePayload) => {
      if (!jobId) {
        return { success: false, message: "缺少工单 ID" };
      }

      const res = await updateWofRecord(jobId, recordId, payload);
      if (!res.ok) {
        return { success: false, message: res.error || "保存失败" };
      }

      await refreshWofServer();
      return { success: true, message: "保存成功" };
    },
    [jobId, refreshWofServer]
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
      return { success: false, message: res.error || "导入失败" };
    }

    await refreshWofServer();
    const inserted = Number(res.data?.inserted ?? 0);
    const updated = Number(res.data?.updated ?? 0);
    const skipped = Number(res.data?.skipped ?? 0);
    const sourceFile = res.data?.sourceFile ? `（${res.data.sourceFile}）` : "";
    return {
      success: true,
      message: `导入完成${sourceFile}：新增 ${inserted} 条，更新 ${updated} 条，跳过 ${skipped} 条`,
    };
  }, [jobId, wofLoading, refreshWofServer]);

  const createPartsServiceRow = useCallback(
    async (payload: { description: string; status?: PartsServiceStatus }) => {
      if (!jobId) {
        return { success: false, message: "缺少工单 ID" };
      }

      const res = await createPartsService(jobId, payload);
      if (!res.ok) {
        return { success: false, message: res.error || "保存失败" };
      }

      await refreshPartsServices();
      return { success: true, message: "保存成功" };
    },
    [jobId, refreshPartsServices]
  );

  const updatePartsServiceRow = useCallback(
    async (serviceId: string, payload: { description?: string; status?: PartsServiceStatus }) => {
      if (!jobId) {
        return { success: false, message: "缺少工单 ID" };
      }

      const res = await updatePartsService(jobId, serviceId, payload);
      if (!res.ok) {
        return { success: false, message: res.error || "保存失败" };
      }

      await refreshPartsServices();
      return { success: true, message: "保存成功" };
    },
    [jobId, refreshPartsServices]
  );

  const deletePartsServiceRow = useCallback(
    async (serviceId: string) => {
      if (!jobId) {
        return { success: false, message: "缺少工单 ID" };
      }

      const res = await deletePartsService(jobId, serviceId);
      if (!res.ok) {
        return { success: false, message: res.error || "删除失败" };
      }

      await refreshPartsServices();
      return { success: true, message: "删除成功" };
    },
    [jobId, refreshPartsServices]
  );

  const createPartsNoteRow = useCallback(
    async (serviceId: string, note: string) => {
      if (!jobId) {
        return { success: false, message: "缺少工单 ID" };
      }

      const res = await createPartsNote(jobId, serviceId, note);
      if (!res.ok) {
        return { success: false, message: res.error || "保存失败" };
      }

      await refreshPartsServices();
      return { success: true, message: "保存成功" };
    },
    [jobId, refreshPartsServices]
  );

  const updatePartsNoteRow = useCallback(
    async (noteId: string, note: string) => {
      if (!jobId) {
        return { success: false, message: "缺少工单 ID" };
      }

      const res = await updatePartsNote(jobId, noteId, note);
      if (!res.ok) {
        return { success: false, message: res.error || "保存失败" };
      }

      await refreshPartsServices();
      return { success: true, message: "保存成功" };
    },
    [jobId, refreshPartsServices]
  );

  const deletePartsNoteRow = useCallback(
    async (noteId: string) => {
      if (!jobId) {
        return { success: false, message: "缺少工单 ID" };
      }

      const res = await deletePartsNote(jobId, noteId);
      if (!res.ok) {
        return { success: false, message: res.error || "删除失败" };
      }

      await refreshPartsServices();
      return { success: true, message: "删除成功" };
    },
    [jobId, refreshPartsServices]
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
      onDeleted?.();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "删除失败");
    } finally {
      setDeletingJob(false);
    }
  }, [jobId, onDeleted]);

  const saveTags = useCallback(
    async (tagIds: string[]) => {
      if (!jobId) return { success: false, message: "缺少工单 ID" };
      const res = await updateJobTags(
        jobId,
        tagIds.map((t) => Number(t))
      );
      if (!res.ok) {
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
      return { success: true, message: "保存成功", tags: res.data?.tags };
    },
    [jobId, tagOptions]
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
      return { success: false, message: importRes.error || "抓取失败，请稍后重试" };
    }

    const jobRes = await fetchJob(jobId);
    if (!jobRes.ok) {
      return { success: false, message: jobRes.error || "刷新车辆信息失败" };
    }

    const data = jobRes.data as any;
    const job = data?.job ?? data;
    setJobData(job ?? null);

    const vehicle = job?.vehicle;
    const label = [vehicle?.year, vehicle?.make, vehicle?.model].filter(Boolean).join(" ");
    return { success: true, message: label ? `抓取成功：${label}` : "抓取成功" };
  }, [jobId, jobData?.vehicle?.plate]);

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
  }, [jobId, refreshWofServer, refreshPartsServices]);

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
    refreshVehicleInfo,
  };
}
