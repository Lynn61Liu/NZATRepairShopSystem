import { useCallback, useEffect, useMemo, useState } from "react";
import type { WorklogEntry, WorklogRole, WorklogStaffProfile } from "../types";
import { detectFlags } from "../worklog.utils";
import {
  createStaff,
  createWorklog,
  deleteStaff,
  deleteWorklog,
  fetchStaff,
  fetchWorklogs,
  updateStaff,
  updateWorklog,
} from "../api/worklogApi";

type UseWorklogDataOptions = {
  jobId?: string;
};

export function useWorklogData({ jobId }: UseWorklogDataOptions = {}) {
  const [logs, setLogs] = useState<WorklogEntry[]>([]);
  const [staffList, setStaffList] = useState<WorklogStaffProfile[]>([]);
  const [editingLogId, setEditingLogId] = useState<string | null>(null);

  const recalculateFlags = useCallback(
    (entries: WorklogEntry[]) =>
      entries.map((log) => ({
        ...log,
        flags: log.flagDismissed ? [] : detectFlags(log, entries),
      })),
    []
  );

  const mapWorklogRows = useCallback(
    (rows: any[]) =>
      rows.map((row) => ({
        id: String(row.id),
        staff_name: String(row.staff_name ?? ""),
        staff_id: String(row.staff_id ?? ""),
        team: "",
        role: "Technician" as WorklogRole,
        service_type: String(row.service_type ?? "PNP") as "PNP" | "MECH",
        rego: String(row.rego ?? ""),
        job_id: String(row.job_id ?? ""),
        job_note: "",
        task_types: [],
        work_date: String(row.work_date ?? ""),
        start_time: String(row.start_time ?? ""),
        end_time: String(row.end_time ?? ""),
        cost_rate: Number(row.cost_rate ?? 0),
        admin_note: String(row.admin_note ?? ""),
        source: String(row.source ?? "admin") as WorklogEntry["source"],
        created_at: String(row.created_at ?? ""),
        created_by: "db",
        flags: [],
      })),
    []
  );

  const refreshStaff = useCallback(async () => {
    const res = await fetchStaff();
    if (!res.ok || !Array.isArray(res.data)) return;
    setStaffList(
      res.data.map((item) => ({
        id: String(item.id),
        name: String(item.name ?? ""),
        role: "Technician" as WorklogRole,
        cost_rate: Number(item.cost_rate ?? 0),
      }))
    );
  }, []);

  const refreshWorklogs = useCallback(async () => {
    const res = await fetchWorklogs(jobId);
    if (!res.ok || !Array.isArray(res.data)) return;
    setLogs(recalculateFlags(mapWorklogRows(res.data)));
  }, [jobId, mapWorklogRows, recalculateFlags]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      await refreshStaff();
      if (!cancelled) {
        await refreshWorklogs();
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [refreshStaff, refreshWorklogs]);

  const handleAddLog = useCallback(
    async (newLog: Omit<WorklogEntry, "id" | "created_at" | "created_by" | "flags">) => {
      if (!newLog.job_id || !newLog.staff_id) return { ok: false, error: "missing_fields" as const };
      const res = await createWorklog({
        jobId: String(newLog.job_id),
        staffId: String(newLog.staff_id),
        serviceType: newLog.service_type ?? "PNP",
        workDate: newLog.work_date,
        startTime: newLog.start_time,
        endTime: newLog.end_time,
        adminNote: newLog.admin_note ?? "",
        source: newLog.source ?? "admin",
      });
      if (!res.ok) return { ok: false, error: res.error || "request_failed" as const };
      await refreshWorklogs();
      return { ok: true, id: String((res.data as any)?.id ?? "") };
    },
    [refreshWorklogs]
  );

  const handleEditLog = useCallback(
    async (id: string, updates: Partial<WorklogEntry>) => {
      const res = await updateWorklog(id, {
        jobId: updates.job_id,
        staffId: updates.staff_id,
        serviceType: updates.service_type,
        workDate: updates.work_date,
        startTime: updates.start_time,
        endTime: updates.end_time,
        adminNote: updates.admin_note,
        source: updates.source,
      });
      if (!res.ok) return { ok: false, error: res.error || "request_failed" as const };
      await refreshWorklogs();
      return { ok: true };
    },
    [refreshWorklogs]
  );

  const handleCopyLog = useCallback(
    async (log: WorklogEntry) => {
      if (!log.job_id || !log.staff_id) return { ok: false, error: "missing_fields" as const };
      const res = await createWorklog({
        jobId: String(log.job_id),
        staffId: String(log.staff_id),
        serviceType: log.service_type ?? "PNP",
        workDate: log.work_date,
        startTime: log.start_time,
        endTime: log.end_time,
        adminNote: log.admin_note ?? "",
        source: log.source ?? "admin",
      });
      if (!res.ok) return { ok: false, error: res.error || "request_failed" as const };
      await refreshWorklogs();
      return { ok: true, id: String((res.data as any)?.id ?? "") };
    },
    [refreshWorklogs]
  );

  const handleDeleteLog = useCallback(
    async (id: string) => {
      const res = await deleteWorklog(id);
      if (!res.ok) return { ok: false, error: res.error || "request_failed" as const };
      await refreshWorklogs();
      return { ok: true };
    },
    [refreshWorklogs]
  );

  const handleAddStaff = useCallback(async (newStaff: Omit<WorklogStaffProfile, "id">) => {
    const res = await createStaff({ name: newStaff.name, costRate: newStaff.cost_rate });
    if (!res.ok) return { ok: false, error: res.error || "request_failed" as const };
    await refreshStaff();
    return { ok: true };
  }, [refreshStaff]);

  const handleEditStaff = useCallback(async (id: string, updates: Partial<WorklogStaffProfile>) => {
    const res = await updateStaff(id, { name: updates.name, costRate: updates.cost_rate });
    if (!res.ok) return { ok: false, error: res.error || "request_failed" as const };
    await refreshStaff();
    return { ok: true };
  }, [refreshStaff]);

  const handleDeleteStaff = useCallback(async (id: string) => {
    const res = await deleteStaff(id);
    if (!res.ok) return { ok: false, error: res.error || "request_failed" as const };
    await refreshStaff();
    return { ok: true };
  }, [refreshStaff]);

  const value = useMemo(
    () => ({
      logs,
      staffList,
      editingLogId,
      setEditingLogId,
      refreshWorklogs,
      handleAddLog,
      handleEditLog,
      handleCopyLog,
      handleDeleteLog,
      handleAddStaff,
      handleEditStaff,
      handleDeleteStaff,
    }),
    [
      logs,
      staffList,
      editingLogId,
      refreshWorklogs,
      handleAddLog,
      handleEditLog,
      handleCopyLog,
      handleDeleteLog,
      handleAddStaff,
      handleEditStaff,
      handleDeleteStaff,
    ]
  );

  return value;
}
