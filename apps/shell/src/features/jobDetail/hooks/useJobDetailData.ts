import { useCallback, useEffect, useRef, useState } from "react";
import type {
  JobDetailData,
  JobDetailTabKey,
  MechService,
  PaintService,
  PartsService,
  PartsServiceStatus,
  WofCheckItem,
  WofFailReason,
  WofRecord,
  WofRecordUpdatePayload,
} from "@/types";
import type { TagOption } from "@/components/MultiTagSelect";
import {
  fetchJob,
  fetchTags,
  updateJobNotes,
  updateJobTags,
  updateJobStatus,
  updateJobCustomer,
  updateVehicleInfo,
  syncVehicleNztaInfo as apiSyncVehicleNztaInfo,
  deleteJob as apiDeleteJob,
  createJobXeroDraftInvoice as apiCreateJobXeroDraftInvoice,
  attachJobXeroInvoice as apiAttachJobXeroInvoice,
  detachJobXeroInvoice as apiDetachJobXeroInvoice,
} from "../api/jobDetailApi";
import { notifyPaintBoardRefresh } from "@/utils/refreshSignals";
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
  deleteWofRecord,
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
import {
  createMechService,
  deleteMechService,
  fetchMechServices,
  updateMechService,
} from "@/features/mech/api/mechApi";
import { useToast } from "@/components/ui";

type UseJobDetailDataArgs = {
  jobId?: string;
  activeTab?: JobDetailTabKey;
};

export type DeleteJobStepResult = {
  status?: string;
  message?: string;
};

export type DeleteJobActionResult = {
  success: boolean;
  message?: string;
  steps?: {
    xero?: DeleteJobStepResult;
    gmail?: DeleteJobStepResult;
    jobStep?: DeleteJobStepResult;
  };
};

export type VehicleNztaSyncActionResult = {
  success: boolean;
  message?: string;
  steps?: {
    lookup?: DeleteJobStepResult;
    parse?: DeleteJobStepResult;
    save?: DeleteJobStepResult;
  };
};

export function useJobDetailData({ jobId, activeTab }: UseJobDetailDataArgs) {
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
  const [mechServices, setMechServices] = useState<MechService[]>([]);
  const [mechLoading, setMechLoading] = useState(false);
  const [paintService, setPaintService] = useState<PaintService | null>(null);
  const [paintLoading, setPaintLoading] = useState(false);
  const [tagOptions, setTagOptions] = useState<TagOption[]>([]);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deletingJob, setDeletingJob] = useState(false);
  const [archivingJob, setArchivingJob] = useState(false);
  const [creatingXeroInvoice, setCreatingXeroInvoice] = useState(false);
  const [attachingXeroInvoice, setAttachingXeroInvoice] = useState(false);
  const [detachingXeroInvoice, setDetachingXeroInvoice] = useState(false);
  const [hasWofRecord, setHasWofRecord] = useState(false);
  const [wofInitialized, setWofInitialized] = useState(false);
  const [wofFailReasonsInitialized, setWofFailReasonsInitialized] = useState(false);
  const [partsInitialized, setPartsInitialized] = useState(false);
  const [mechInitialized, setMechInitialized] = useState(false);
  const [paintInitialized, setPaintInitialized] = useState(false);
  const [tagOptionsInitialized, setTagOptionsInitialized] = useState(false);

  const refreshWofServer = useCallback(async () => {
    if (!jobId) return;
    setWofLoading(true);
    try {
      const wofRes = await fetchWofServer(jobId);
      if (!wofRes.ok) {
        throw new Error(wofRes.error || "Failed to load WOF records");
      }
      if (isMountedRef.current) {
        const wofData = wofRes.data;
        const hasWofServer = Boolean(wofData?.hasWofServer);
        setHasWofRecord(hasWofServer);
        setWofCheckItems(Array.isArray(wofData?.checkItems) ? wofData.checkItems : []);
        const results = Array.isArray(wofData?.results) ? wofData.results : [];
        setWofRecords(results.map(mapWofRecord));
        setWofInitialized(true);
      }
    } catch {
      if (isMountedRef.current) {
        setWofRecords([]);
        setWofCheckItems([]);
        setWofInitialized(true);
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
        throw new Error(res.error || "Failed to load accessories service");
      }
      if (isMountedRef.current) {
        const list = Array.isArray(res.data) ? res.data : [];
        setPartsServices(list);
        setPartsInitialized(true);
      }
    } catch {
      if (isMountedRef.current) {
        setPartsServices([]);
        setPartsInitialized(true);
      }
    } finally {
      if (isMountedRef.current) {
        setPartsLoading(false);
      }
    }
  }, [jobId]);

  const refreshMechServices = useCallback(async () => {
    if (!jobId) return;
    setMechLoading(true);
    try {
      const res = await fetchMechServices(jobId);
      if (!res.ok) {
        throw new Error(res.error || "Failed to load machine repair project");
      }
      if (isMountedRef.current) {
        const list = Array.isArray(res.data) ? res.data : [];
        setMechServices(list);
        setMechInitialized(true);
      }
    } catch {
      if (isMountedRef.current) {
        setMechServices([]);
        setMechInitialized(true);
      }
    } finally {
      if (isMountedRef.current) {
        setMechLoading(false);
      }
    }
  }, [jobId]);

  const refreshPaintService = useCallback(async () => {
    if (!jobId) return;
    setPaintLoading(true);
    try {
      const res = await fetchPaintService(jobId);
      if (!res.ok) {
        throw new Error(res.error || "Failed to load paint service");
      }
      const service = res.data?.service ? res.data.service : null;
      if (isMountedRef.current) {
        setPaintService(service);
        setPaintInitialized(true);
      }
    } catch {
      if (isMountedRef.current) {
        setPaintService(null);
        setPaintInitialized(true);
      }
    } finally {
      if (isMountedRef.current) {
        setPaintLoading(false);
      }
    }
  }, [jobId]);

  const refreshJobSummary = useCallback(async () => {
    if (!jobId) return;

    const jobRes = await fetchJob(jobId);
    if (jobRes.ok) {
      const data = jobRes.data as any;
      const job = data?.job ?? data;
      setJobData(job ?? null);
      if (typeof data?.hasWofRecord === "boolean") {
        setHasWofRecord(data.hasWofRecord);
      }
    }
  }, [jobId]);

  const createWofServerForJob = useCallback(async () => {
    if (!jobId || wofLoading) return;
    if (hasWofRecord || wofRecords.length > 0 || wofCheckItems.length > 0) return;
    const res = await createWofServer(jobId);
    if (!res.ok) {
      toast.error(res.error || "Creation failed");
      return;
    }
    if (jobId) {
      await Promise.all([refreshJobSummary(), refreshWofServer()]);
      if (res.data?.alreadyExists) {
        toast.success("WOF service already exists");
      } else if (res.data?.xeroSyncQueued) {
        toast.success("WOF service has been created and Xero draft is being updated in the background");
      } else {
        toast.success("WOF service created");
      }
    }
  }, [
    jobId,
    wofLoading,
    hasWofRecord,
    wofRecords.length,
    wofCheckItems.length,
    refreshJobSummary,
    refreshWofServer,
    toast,
  ]);

  const saveWofResult = useCallback(
    async (payload: { result: "Pass" | "Fail"; expiryDate?: string; failReasonId?: string; note?: string }) => {
      if (!jobId) {
        return { success: false, message: "Missing ticket ID" };
      }

      const res = await createWofResult(jobId, payload);
      if (!res.ok) {
        toast.error(res.error || "Save failed");
        return { success: false, message: res.error || "Save failed" };
      }

      await Promise.all([refreshWofServer(), refreshJobSummary()]);
      toast.success("Saved successfully");
      return { success: true, message: "Saved successfully" };
    },
    [jobId, refreshJobSummary, refreshWofServer, toast]
  );

  const deleteWofServerForJob = useCallback(async () => {
    if (!jobId) {
      return { success: false, message: "Missing ticket ID" };
    }

    const res = await deleteWofServer(jobId);
    if (!res.ok) {
      toast.error(res.error || "Delete failed");
      return { success: false, message: res.error || "Delete failed" };
    }

    await Promise.all([refreshJobSummary(), refreshWofServer()]);
    toast.success(res.data?.xeroSyncQueued ? "Deletion successful, Xero draft is being updated in the background" : "Delete successfully");
    return { success: true, message: "Delete successfully" };
  }, [jobId, refreshJobSummary, refreshWofServer, toast]);

  const createPaintServiceRow = useCallback(
    async (status?: string, panels?: number) => {
      if (!jobId) {
        return { success: false, message: "Missing ticket ID" };
      }
      const res = await createPaintService(jobId, status, panels);
      if (!res.ok) {
        toast.error(res.error || "Creating spray painting service failed");
        return { success: false, message: res.error || "Creating spray painting service failed" };
      }
      setPaintService(res.data ?? null);
      toast.success("Painting service created");
      notifyPaintBoardRefresh();
      return { success: true, message: "Painting service created" };
    },
    [jobId, toast]
  );

  const updatePaintStageRow = useCallback(
    async (stageIndex: number) => {
      if (!jobId) {
        return { success: false, message: "Missing ticket ID" };
      }
      const res = await updatePaintStage(jobId, stageIndex);
      if (!res.ok) {
        toast.error(res.error || "Update painting phase failed");
        return { success: false, message: res.error || "Update painting phase failed" };
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
      toast.success("The painting stage has been updated");
      notifyPaintBoardRefresh();
      return { success: true, message: "The painting stage has been updated" };
    },
    [jobId, toast]
  );

  const updatePaintPanelsRow = useCallback(
    async (panels: number) => {
      if (!jobId) {
        return { success: false, message: "Missing ticket ID" };
      }
      const res = await updatePaintPanels(jobId, panels);
      if (!res.ok) {
        toast.error(res.error || "Failed to update the number of paint chips");
        return { success: false, message: res.error || "Failed to update the number of paint chips" };
      }
      setPaintService((prev) =>
        prev ? { ...prev, panels: typeof res.data?.panels === "number" ? res.data.panels : panels } : prev
      );
      toast.success("The number of paint chips has been updated");
      notifyPaintBoardRefresh();
      return { success: true, message: "The number of paint chips has been updated" };
    },
    [jobId, toast]
  );

  const deletePaintServiceRow = useCallback(
    async () => {
      if (!jobId) {
        return { success: false, message: "Missing ticket ID" };
      }
      const res = await deletePaintService(jobId);
      if (!res.ok) {
        toast.error(res.error || "Failed to delete spray painting service");
        return { success: false, message: res.error || "Failed to delete spray painting service" };
      }
      setPaintService(null);
      toast.success("Painting service removed");
      notifyPaintBoardRefresh();
      return { success: true, message: "Painting service removed" };
    },
    [jobId, toast]
  );

  const saveJobNotes = useCallback(
    async (notes: string) => {
      if (!jobId) {
        return { success: false, message: "Missing ticket ID" };
      }

      const res = await updateJobNotes(jobId, notes);
      if (!res.ok) {
        toast.error(res.error || "Failed to save notes");
        return { success: false, message: res.error || "Failed to save notes" };
      }

      setJobData((prev) => (prev ? { ...prev, notes } : prev));
      toast.success("Note has been updated");
      notifyPaintBoardRefresh();
      return { success: true, message: "Note has been updated" };
    },
    [jobId, toast]
  );

  const createWofRecordRow = useCallback(
    async (payload: WofRecordUpdatePayload) => {
      if (!jobId) {
        return { success: false, message: "Missing ticket ID" };
      }

      const res = await createWofRecord(jobId, payload);
      if (!res.ok) {
        toast.error(res.error || "Save failed");
        return { success: false, message: res.error || "Save failed" };
      }

      await Promise.all([refreshWofServer(), refreshJobSummary()]);
      toast.success("Saved successfully");
      return { success: true, message: "Saved successfully" };
    },
    [jobId, refreshJobSummary, refreshWofServer, toast]
  );

  const updateWofRecordRow = useCallback(
    async (recordId: string, payload: WofRecordUpdatePayload) => {
      if (!jobId) {
        return { success: false, message: "Missing ticket ID" };
      }

      const res = await updateWofRecord(jobId, recordId, payload);
      if (!res.ok) {
        toast.error(res.error || "Save failed");
        return { success: false, message: res.error || "Save failed" };
      }

      await refreshWofServer();
      toast.success("Saved successfully");
      return { success: true, message: "Saved successfully" };
    },
    [jobId, refreshWofServer, toast]
  );

  const deleteWofRecordRow = useCallback(
    async (recordId: string) => {
      if (!jobId) {
        return { success: false, message: "Missing ticket ID" };
      }

      const res = await deleteWofRecord(jobId, recordId);
      if (!res.ok) {
        toast.error(res.error || "Delete failed");
        return { success: false, message: res.error || "Delete failed" };
      }

      await refreshWofServer();
      await refreshJobSummary();
      toast.success("Delete successfully");
      return { success: true, message: "Delete successfully" };
    },
    [jobId, refreshJobSummary, refreshWofServer, toast]
  );

  const importWofRecordsForJob = useCallback(async () => {
    if (!jobId) {
      return { success: false, message: "Missing ticket ID" };
    }
    if (wofLoading) {
      return { success: false, message: "Loading, please wait" };
    }

    const res = await importWofRecords(jobId);
    if (!res.ok) {
      toast.error(res.error || "Import failed");
      return { success: false, message: res.error || "Import failed" };
    }

    await Promise.all([refreshWofServer(), refreshJobSummary()]);
    const inserted = Number(res.data?.inserted ?? 0);
    const updated = Number(res.data?.updated ?? 0);
    const skipped = Number(res.data?.skipped ?? 0);
    const sourceFile = res.data?.sourceFile ? `(${res.data.sourceFile})` : ""; const message = `Import completed${sourceFile}: added ${inserted} items, updated ${updated} items, skipped ${skipped} items`; toast.success(message); return { success: true, message, }; }, [jobId, wofLoading, refreshJobSummary, refreshWofServer, toast]); const createPartsServiceRow = useCallback( async (payload: { description: string; status?: PartsServiceStatus }) => { if (!jobId) { return { success: false, message:"Missing work order ID" };
      }

      const res = await createPartsService(jobId, payload);
      if (!res.ok) {
        toast.error(res.error || "Save failed");
        return { success: false, message: res.error || "Save failed" };
      }

      await refreshPartsServices();
      toast.success("Saved successfully");
      return { success: true, message: "Saved successfully" };
    },
    [jobId, refreshPartsServices, toast]
  );

  const updatePartsServiceRow = useCallback(
    async (serviceId: string, payload: { description?: string; status?: PartsServiceStatus }) => {
      if (!jobId) {
        return { success: false, message: "Missing ticket ID" };
      }

      const res = await updatePartsService(jobId, serviceId, payload);
      if (!res.ok) {
        toast.error(res.error || "Save failed");
        return { success: false, message: res.error || "Save failed" };
      }

      await refreshPartsServices();
      toast.success("Saved successfully");
      return { success: true, message: "Saved successfully" };
    },
    [jobId, refreshPartsServices, toast]
  );

  const deletePartsServiceRow = useCallback(
    async (serviceId: string) => {
      if (!jobId) {
        return { success: false, message: "Missing ticket ID" };
      }

      const res = await deletePartsService(jobId, serviceId);
      if (!res.ok) {
        toast.error(res.error || "Delete failed");
        return { success: false, message: res.error || "Delete failed" };
      }

      await refreshPartsServices();
      toast.success("Delete successfully");
      return { success: true, message: "Delete successfully" };
    },
    [jobId, refreshPartsServices, toast]
  );

  const createMechServiceRow = useCallback(
    async (payload: { description: string; cost?: number | null }) => {
      if (!jobId) {
        return { success: false, message: "Missing ticket ID" };
      }
      const res = await createMechService(jobId, payload);
      if (!res.ok) {
        toast.error(res.error || "Save failed");
        return { success: false, message: res.error || "Save failed" };
      }
      await refreshMechServices();
      toast.success("Saved successfully");
      return { success: true, message: "Saved successfully" };
    },
    [jobId, refreshMechServices, toast]
  );

  const updateMechServiceRow = useCallback(
    async (serviceId: string, payload: { description?: string; cost?: number | null }) => {
      if (!jobId) {
        return { success: false, message: "Missing ticket ID" };
      }
      const res = await updateMechService(jobId, serviceId, payload);
      if (!res.ok) {
        toast.error(res.error || "Save failed");
        return { success: false, message: res.error || "Save failed" };
      }
      await refreshMechServices();
      toast.success("Saved successfully");
      return { success: true, message: "Saved successfully" };
    },
    [jobId, refreshMechServices, toast]
  );

  const deleteMechServiceRow = useCallback(
    async (serviceId: string) => {
      if (!jobId) {
        return { success: false, message: "Missing ticket ID" };
      }
      const res = await deleteMechService(jobId, serviceId);
      if (!res.ok) {
        toast.error(res.error || "Delete failed");
        return { success: false, message: res.error || "Delete failed" };
      }
      await refreshMechServices();
      toast.success("Delete successfully");
      return { success: true, message: "Delete successfully" };
    },
    [jobId, refreshMechServices, toast]
  );

  const createPartsNoteRow = useCallback(
    async (serviceId: string, note: string) => {
      if (!jobId) {
        return { success: false, message: "Missing ticket ID" };
      }

      const res = await createPartsNote(jobId, serviceId, note);
      if (!res.ok) {
        toast.error(res.error || "Save failed");
        return { success: false, message: res.error || "Save failed" };
      }

      await refreshPartsServices();
      toast.success("Saved successfully");
      return { success: true, message: "Saved successfully" };
    },
    [jobId, refreshPartsServices, toast]
  );

  const updatePartsNoteRow = useCallback(
    async (noteId: string, note: string) => {
      if (!jobId) {
        return { success: false, message: "Missing ticket ID" };
      }

      const res = await updatePartsNote(jobId, noteId, note);
      if (!res.ok) {
        toast.error(res.error || "Save failed");
        return { success: false, message: res.error || "Save failed" };
      }

      await refreshPartsServices();
      toast.success("Saved successfully");
      return { success: true, message: "Saved successfully" };
    },
    [jobId, refreshPartsServices, toast]
  );

  const deletePartsNoteRow = useCallback(
    async (noteId: string) => {
      if (!jobId) {
        return { success: false, message: "Missing ticket ID" };
      }

      const res = await deletePartsNote(jobId, noteId);
      if (!res.ok) {
        toast.error(res.error || "Delete failed");
        return { success: false, message: res.error || "Delete failed" };
      }

      await refreshPartsServices();
      toast.success("Delete successfully");
      return { success: true, message: "Delete successfully" };
    },
    [jobId, refreshPartsServices, toast]
  );

  const deleteJob = useCallback(async (): Promise<DeleteJobActionResult> => {
    if (!jobId) {
      return { success: false, message: "Missing ticket ID" };
    }
    setDeletingJob(true);
    setDeleteError(null);
    try {
      const res = await apiDeleteJob(jobId);
      if (!res.ok) {
        return {
          success: false,
          message: res.error || "Delete failed",
          steps: (res.data as { steps?: DeleteJobActionResult["steps"] } | null)?.steps,
        };
      }

      return {
        success: true,
        message: "Deleted",
        steps: (res.data as { steps?: DeleteJobActionResult["steps"] } | null)?.steps,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Delete failed";
      return { success: false, message };
    } finally {
      setDeletingJob(false);
    }
  }, [jobId]);

  const archiveJob = useCallback(async () => {
    if (!jobId) return { success: false, message: "Missing ticket ID" };
    if (jobData?.status === "Archived") return { success: true, message: "Ticket archived" };

    setArchivingJob(true);
    try {
      const res = await updateJobStatus(jobId, "Archived");
      if (!res.ok) {
        const message = res.error || "Archiving failed";
        toast.error(message);
        return { success: false, message };
      }

      setJobData((prev) =>
        prev
          ? {
              ...prev,
              status: "Archived",
            }
          : prev
      );
      toast.success("Archived");
      return { success: true, message: "Archived" };
    } finally {
      setArchivingJob(false);
    }
  }, [jobData?.status, jobId, toast]);

  useEffect(() => {
    if (!jobData || jobData.invoice) return;
    const processingStatus = jobData.invoiceProcessing?.status;
    if (processingStatus !== "pending" && processingStatus !== "processing") return;

    const timer = window.setInterval(() => {
      void refreshJobSummary();
    }, 2000);

    return () => window.clearInterval(timer);
  }, [jobData, refreshJobSummary]);

  const createJobXeroDraftInvoice = useCallback(async () => {
    if (!jobId || !jobData) {
      return { success: false, message: "Missing ticket data" };
    }

    setCreatingXeroInvoice(true);
    try {
      const res = await apiCreateJobXeroDraftInvoice(jobId);
      if (!res.ok) {
        const message = res.error || "Failed to create Xero invoice";
        toast.error(message);
        return { success: false, message };
      }

      await refreshJobSummary();
      const message = res.data?.alreadyExists ? "Xero invoice already exists or is being processed in the background" : "Xero invoice has been added to the background creation queue";
      toast.success(message);
      return { success: true, message };
    } finally {
      setCreatingXeroInvoice(false);
    }
  }, [jobData, jobId, refreshJobSummary, toast]);

  const attachJobXeroInvoice = useCallback(async (invoiceNumber: string) => {
    if (!jobId) {
      return { success: false, message: "Missing ticket ID" };
    }

    const normalizedInvoiceNumber = invoiceNumber.trim();
    if (!normalizedInvoiceNumber) {
      return { success: false, message: "Invoice Number is required" };
    }

    setAttachingXeroInvoice(true);
    try {
      const res = await apiAttachJobXeroInvoice(jobId, normalizedInvoiceNumber);
      if (!res.ok) {
        const message = res.error || "Failed to associate Xero invoice";
        toast.error(message);
        return { success: false, message };
      }

      await refreshJobSummary();
      const message = res.data?.alreadyExists ? "Xero invoice already exists or is being processed in the background" : "Joined the background associated Xero invoice queue";
      toast.success(message);
      return { success: true, message };
    } finally {
      setAttachingXeroInvoice(false);
    }
  }, [jobId, refreshJobSummary, toast]);

  const detachJobXeroInvoice = useCallback(async () => {
    if (!jobId) {
      return { success: false, message: "Missing ticket ID" };
    }

    setDetachingXeroInvoice(true);
    try {
      const res = await apiDetachJobXeroInvoice(jobId);
      if (!res.ok) {
        const message = res.error || "Failed to unbind Invoice";
        toast.error(message);
        return { success: false, message };
      }

      await refreshJobSummary();
      toast.success("Invoice binding has been released");
      return { success: true, message: "Invoice binding has been released" };
    } finally {
      setDetachingXeroInvoice(false);
    }
  }, [jobId, refreshJobSummary, toast]);

  const saveTags = useCallback(
    async (tagIds: string[]) => {
      if (!jobId) return { success: false, message: "Missing ticket ID" };
      const res = await updateJobTags(
        jobId,
        tagIds.map((t) => Number(t))
      );
      if (!res.ok) {
        toast.error(res.error || "Save failed");
        return { success: false, message: res.error || "Save failed" };
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
      toast.success("Saved successfully");
      return { success: true, message: "Saved successfully", tags: res.data?.tags };
    },
    [jobId, tagOptions, toast]
  );

  const refreshVehicleInfo = useCallback(async () => {
    if (!jobId) {
      return { success: false, message: "Missing ticket ID" };
    }
    const plate = jobData?.vehicle?.plate;
    if (!plate) {
      return { success: false, message: "Missing license plate information" };
    }

    const importRes = await requestJson<any>(`/api/carjam/import?plate=${encodeURIComponent(plate)}`, { method: "POST", }); if (!importRes.ok) { toast.error(importRes.error || "Fetching failed, please try again later"); return { success: false, message: importRes.error || "Fetch failed, please try again later" }; } const jobRes = await fetchJob(jobId); if (!jobRes.ok) { toast.error(jobRes.error || "Failed to refresh vehicle information"); return { success: false, message: jobRes.error || "Failed to refresh vehicle information" }; } const data = jobRes.data as any; const job = data?.job ?? data; setJobData(job ?? null); const vehicle = job?.vehicle; const label = [vehicle?.year, vehicle?.make, vehicle?.model].filter(Boolean).join(" "); toast.success(label?`Fetched successfully: ${label}`: "Catch successfully"); return { success: true, message: label ?`Fetched successfully: ${label}` : "Fetched successfully" };
  }, [jobId, jobData?.vehicle?.plate, toast]);

  const syncVehicleNztaInfo = useCallback(async (): Promise<VehicleNztaSyncActionResult> => {
    if (!jobId) {
      return { success: false, message: "Missing ticket ID" };
    }

    const res = await apiSyncVehicleNztaInfo(jobId);
    if (!res.ok) {
      return {
        success: false,
        message: res.error || "NZTA sync failed",
        steps: (res.data as { steps?: VehicleNztaSyncActionResult["steps"] } | null)?.steps,
      };
    }

    const jobRes = await fetchJob(jobId);
    if (!jobRes.ok) {
      return {
        success: false,
        message: jobRes.error || "Synchronization was successful, but refreshing work order details failed.",
        steps: (res.data as { steps?: VehicleNztaSyncActionResult["steps"] } | null)?.steps,
      };
    }

    const data = jobRes.data as any;
    const job = data?.job ?? data;
    setJobData(job ?? null);
    toast.success((res.data as { message?: string } | null)?.message || "NZTA synchronization completed");

    return {
      success: true,
      message: (res.data as { message?: string } | null)?.message || "NZTA synchronization completed",
      steps: (res.data as { steps?: VehicleNztaSyncActionResult["steps"] } | null)?.steps,
    };
  }, [jobId, toast]);

  const saveVehicleInfo = useCallback(
    async (payload: {
      year?: number | null;
      make?: string | null;
      fuelType?: string | null;
      vin?: string | null;
      nzFirstRegistration?: string | null;
    }) => {
      if (!jobId) return { success: false, message: "Missing ticket ID" };

      const res = await updateVehicleInfo(jobId, payload);
      if (!res.ok) {
        const message = res.error || "Failed to save vehicle information";
        toast.error(message);
        return { success: false, message };
      }

      const nextVehicle = res.data?.vehicle ?? {};
      setJobData((prev) =>
        prev
          ? {
              ...prev,
              vehicle: {
                ...prev.vehicle,
                ...nextVehicle,
              },
            }
          : prev
      );
      toast.success("Vehicle information has been updated");
      return { success: true, message: "Vehicle information has been updated", vehicle: nextVehicle };
    },
    [jobId, toast]
  );

  const saveCustomerInfo = useCallback(
    async (
      payload:
        | { type: "Business"; customerId: string }
        | { type: "Personal"; name: string; phone?: string | null; email?: string | null; address?: string | null; notes?: string | null }
    ) => {
      if (!jobId) return { success: false, message: "Missing ticket ID" };

      const res = await updateJobCustomer(jobId, payload);
      if (!res.ok) {
        const message = res.error || "Failed to save customer information";
        toast.error(message);
        return { success: false, message };
      }

      const nextCustomer = res.data?.customer ?? {};
      const nextInvoice = res.data?.invoice ?? null;
      const nextSteps = res.data?.steps;
      const overallSuccess = typeof res.data?.success === "boolean" ? Boolean(res.data.success) : true;
      const message = res.data?.message || (overallSuccess ? "Customer information has been updated" : "Customer information updated, but invoice Contact Name update failed");
      setJobData((prev) =>
        prev
          ? {
              ...prev,
              customer: {
                ...prev.customer,
                ...nextCustomer,
              },
              invoice: nextInvoice
                ? {
                    ...prev.invoice,
                    ...nextInvoice,
                  }
                : prev.invoice,
              vehicle:
                payload.type === "Business"
                  ? {
                      ...prev.vehicle,
                      customerId: Number(nextCustomer.id ?? prev.vehicle.customerId ?? 0) || prev.vehicle.customerId,
                    }
                  : prev.vehicle,
            }
          : prev
      );
      if (overallSuccess) {
        toast.success("Customer information has been updated");
      } else {
        toast.error(message);
      }
      return { success: overallSuccess, message, customer: nextCustomer, steps: nextSteps, invoice: nextInvoice };
    },
    [jobId, toast]
  );

  const loadWofFailReasons = useCallback(async () => {
    const res = await fetchWofFailReasons();
    if (!res.ok) {
      if (isMountedRef.current) {
        setWofFailReasons([]);
        setWofFailReasonsInitialized(true);
      }
      return;
    }

    if (isMountedRef.current) {
      const list = Array.isArray(res.data) ? res.data : [];
      const active = list.filter((item) => item?.isActive !== false);
      setWofFailReasons(active.length ? active : list);
      setWofFailReasonsInitialized(true);
    }
  }, []);

  const loadTagOptions = useCallback(async () => {
    const res = await fetchTags();
    if (!res.ok) {
      if (isMountedRef.current) {
        setTagOptions([]);
        setTagOptionsInitialized(true);
      }
      return;
    }

    if (isMountedRef.current) {
      const tags = Array.isArray(res.data) ? res.data : [];
      setTagOptions(
        tags
          .filter((tag: any) => tag?.isActive !== false && typeof tag?.name === "string")
          .map((tag: any) => ({ id: String(tag.id), label: tag.name }))
      );
      setTagOptionsInitialized(true);
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    setWofRecords([]);
    setWofCheckItems([]);
    setWofFailReasons([]);
    setPartsServices([]);
    setMechServices([]);
    setPaintService(null);
    setTagOptions([]);
    setHasWofRecord(false);
    setWofLoading(false);
    setPartsLoading(false);
    setMechLoading(false);
    setPaintLoading(false);
    setWofInitialized(false);
    setWofFailReasonsInitialized(false);
    setPartsInitialized(false);
    setMechInitialized(false);
    setPaintInitialized(false);
    setTagOptionsInitialized(false);
  }, [jobId]);

  useEffect(() => {
    let cancelled = false;
    isMountedRef.current = true;

    const loadJob = async () => {
      if (!jobId) {
        setLoadError("Missing ticket ID");
        setLoading(false);
        return;
      }

      setLoading(true);
      setLoadError(null);

      try {
        const res = await fetchJob(jobId);
        if (!res.ok) {
          throw new Error(res.error || "Failed to load work order");
        }

        const data = res.data;
        const job = (data as any)?.job ?? data;

        if (!cancelled) {
          setJobData(job ?? null);
          if (typeof (data as any)?.hasWofRecord === "boolean") {
            setHasWofRecord((data as any).hasWofRecord);
          }
          setLoading(false);
        }
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : "Failed to load work order");
          setJobData(null);
          setLoading(false);
        }
      }
    };

    void loadJob();

    return () => {
      cancelled = true;
      isMountedRef.current = false;
    };
  }, [jobId]);

  useEffect(() => {
    if (!jobId || tagOptionsInitialized) return;
    void loadTagOptions();
  }, [jobId, tagOptionsInitialized, loadTagOptions]);

  useEffect(() => {
    if (!jobId || partsInitialized || partsLoading) return;
    void refreshPartsServices();
  }, [jobId, partsInitialized, partsLoading, refreshPartsServices]);

  useEffect(() => {
    if (activeTab !== "WOF") return;
    if (!wofInitialized && !wofLoading) {
      void refreshWofServer();
    }
    if (!wofFailReasonsInitialized) {
      void loadWofFailReasons();
    }
  }, [activeTab, loadWofFailReasons, refreshWofServer, wofFailReasonsInitialized, wofInitialized, wofLoading]);

  useEffect(() => {
    if (activeTab !== "Mechanical" || mechInitialized || mechLoading) return;
    void refreshMechServices();
  }, [activeTab, mechInitialized, mechLoading, refreshMechServices]);

  useEffect(() => {
    if ((activeTab !== "Paint" && activeTab !== "Worklog") || paintInitialized || paintLoading) return;
    void refreshPaintService();
  }, [activeTab, paintInitialized, paintLoading, refreshPaintService]);

  return {
    jobData,
    loading,
    loadError,
    deleteError,
    deletingJob,
    archivingJob,
    creatingXeroInvoice,
    attachingXeroInvoice,
    detachingXeroInvoice,
    hasWofRecord,
    wofRecords,
    wofCheckItems,
    wofFailReasons,
    wofLoading,
    partsServices,
    partsLoading,
    mechServices,
    mechLoading,
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
    deleteWofRecord: deleteWofRecordRow,
    importWofRecords: importWofRecordsForJob,
    createPartsService: createPartsServiceRow,
    updatePartsService: updatePartsServiceRow,
    deletePartsService: deletePartsServiceRow,
    createMechService: createMechServiceRow,
    updateMechService: updateMechServiceRow,
    deleteMechService: deleteMechServiceRow,
    refreshMechServices,
    createPartsNote: createPartsNoteRow,
    updatePartsNote: updatePartsNoteRow,
    deletePartsNote: deletePartsNoteRow,
    refreshPartsServices,
    archiveJob,
    deleteJob,
    createJobXeroDraftInvoice,
    attachJobXeroInvoice,
    detachJobXeroInvoice,
    saveTags,
    saveJobNotes,
    createPaintService: createPaintServiceRow,
    updatePaintStage: updatePaintStageRow,
    updatePaintPanels: updatePaintPanelsRow,
    deletePaintService: deletePaintServiceRow,
    refreshPaintService,
    refreshVehicleInfo,
    syncVehicleNztaInfo,
    saveVehicleInfo,
    saveCustomerInfo,
  };
}
