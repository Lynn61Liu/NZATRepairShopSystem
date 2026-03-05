import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { requestJson } from "@/utils/api";
import { notifyWorklogCostAlert } from "@/utils/refreshSignals";
import { Button, useToast } from "@/components/ui";
import { StaffManagement } from "@/features/worklog/components/StaffManagement";
import { WorkLogTable } from "@/features/worklog/components/WorkLogTable";
import {
  createStaff,
  createWorklog,
  deleteStaff,
  deleteWorklog,
  fetchStaff,
  fetchWorklogs,
  updateStaff,
  updateWorklog,
} from "@/features/worklog/api/worklogApi";
import { buildStaffColorMap, calculateDuration, detectFlags, parseTimeRange } from "@/features/worklog/worklog.utils";
import type {
  WorklogEntry,
  WorklogFlag,
  WorklogJob,
  WorklogStaffProfile,
  WorklogRole,
} from "@/features/worklog/types";

export function WorklogPage() {
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [logs, setLogs] = useState<WorklogEntry[]>([]);
  const [staffList, setStaffList] = useState<WorklogStaffProfile[]>([]);
  const [apiJobs, setApiJobs] = useState<WorklogJob[]>([]);
  const [editingLogId, setEditingLogId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadJobs = async () => {
      const res = await requestJson<any[]>("/api/jobs");
      if (!res.ok || !Array.isArray(res.data) || cancelled) return;
      setApiJobs(
        res.data
          .filter((job) => job?.id && job?.plate)
          .map((job) => ({
            id: String(job.id),
            rego: String(job.plate),
            note: String(job.notes ?? ""),
            created_date: String(job.createdAt ?? "").slice(0, 10).replace(/\//g, "-"),
            makeModel: String(job.vehicleModel ?? [job.make, job.model].filter(Boolean).join(" ")).trim() || undefined,
            panels: typeof job.panels === "number" ? job.panels : null,
            customerCode: String(job.customerCode ?? ""),
          }))
      );
    };

    const loadStaff = async () => {
      const res = await fetchStaff();
      if (!res.ok || !Array.isArray(res.data) || cancelled) return;
      setStaffList(
        res.data.map((item) => ({
          id: String(item.id),
          name: String(item.name ?? ""),
          role: "Technician" as WorklogRole,
          cost_rate: Number(item.cost_rate ?? 0),
        }))
      );
    };

    const loadWorklogs = async () => {
      const res = await fetchWorklogs();
      if (!res.ok || !Array.isArray(res.data) || cancelled) return;
      const entries = res.data.map((row) => ({
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
      }));
      setLogs(recalculateFlags(entries));
    };

    void loadJobs();
    void loadStaff();
    void loadWorklogs();
    return () => {
      cancelled = true;
    };
  }, []);

  const jobs = useMemo(() => {
    const merged = new Map<string, WorklogJob>();
    [...apiJobs].forEach((job) => {
      merged.set(job.rego, job);
    });
    return Array.from(merged.values());
  }, [apiJobs]);

  const staffColorMap = useMemo(
    () => buildStaffColorMap(staffList.map((staff) => staff.name)),
    [staffList]
  );

  const worklogCostAlertCount = useMemo(() => {
    const totals = new Map<string, number>();
    logs.forEach((log) => {
      const key = log.job_id || log.rego;
      const hours = calculateDuration(log.start_time, log.end_time);
      const cost = hours * log.cost_rate;
      totals.set(key, (totals.get(key) ?? 0) + cost);
    });
    return Array.from(totals.values()).filter((total) => total > 300).length;
  }, [logs]);

  useEffect(() => {
    notifyWorklogCostAlert(worklogCostAlertCount);
  }, [worklogCostAlertCount]);

  const recalculateFlags = (entries: WorklogEntry[]) =>
    entries.map((log) => ({
      ...log,
      flags: log.flagDismissed ? [] : detectFlags(log, entries),
    }));

  const refreshWorklogs = async () => {
    const res = await fetchWorklogs();
    if (!res.ok || !Array.isArray(res.data)) return;
    const entries = res.data.map((row) => ({
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
    }));
    setLogs(recalculateFlags(entries));
  };

  const handleAddLog = async (newLog: Omit<WorklogEntry, "id" | "created_at" | "created_by" | "flags">) => {
    if (!newLog.job_id || !newLog.staff_id) {
      toast.error("请选择有效的工单和员工");
      return;
    }
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
    if (!res.ok) {
      toast.error(res.error || "新增失败");
      return;
    }
    await refreshWorklogs();
    setEditingLogId(null);
  };

  const handleEditLog = async (id: string, updates: Partial<WorklogEntry>) => {
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
    if (!res.ok) {
      toast.error(res.error || "更新失败");
      return;
    }
    await refreshWorklogs();
    setEditingLogId((prev) => (prev === id ? null : prev));
  };

  const handleCopyLog = async (log: WorklogEntry) => {
    if (!log.job_id || !log.staff_id) return;
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
    if (!res.ok) {
      toast.error(res.error || "复制失败");
      return;
    }
    await refreshWorklogs();
    const newId = res.data && typeof res.data === "object" ? String((res.data as any).id ?? "") : "";
    if (newId) {
      setEditingLogId(newId);
    }
  };

  const handleDismissFlag = (id: string, flag: WorklogFlag) => {
    setLogs((prev) =>
      prev.map((log) =>
        log.id === id
          ? {
              ...log,
              flags: log.flags.filter((item) => item !== flag),
              flagDismissed: log.flags.length === 1 ? true : log.flagDismissed,
            }
          : log
      )
    );
  };

  const handleAddStaff = async (newStaff: Omit<WorklogStaffProfile, "id">) => {
    const res = await createStaff({ name: newStaff.name, costRate: newStaff.cost_rate });
    if (!res.ok) {
      toast.error(res.error || "新增员工失败");
      return;
    }
    const refreshed = await fetchStaff();
    if (refreshed.ok && Array.isArray(refreshed.data)) {
      setStaffList(
        refreshed.data.map((item) => ({
          id: String(item.id),
          name: String(item.name ?? ""),
          role: "Technician" as WorklogRole,
          cost_rate: Number(item.cost_rate ?? 0),
        }))
      );
    }
  };

  const handleEditStaff = async (id: string, updates: Partial<WorklogStaffProfile>) => {
    const res = await updateStaff(id, {
      name: updates.name,
      costRate: updates.cost_rate,
    });
    if (!res.ok) {
      toast.error(res.error || "更新员工失败");
      return;
    }
    const refreshed = await fetchStaff();
    if (refreshed.ok && Array.isArray(refreshed.data)) {
      setStaffList(
        refreshed.data.map((item) => ({
          id: String(item.id),
          name: String(item.name ?? ""),
          role: "Technician" as WorklogRole,
          cost_rate: Number(item.cost_rate ?? 0),
        }))
      );
    }
  };

  const handleDeleteStaff = async (id: string) => {
    const res = await deleteStaff(id);
    if (!res.ok) {
      toast.error(res.error || "删除员工失败");
      return;
    }
    setStaffList((prev) => prev.filter((staff) => staff.id !== id));
  };

  const handleDeleteLog = async (id: string) => {
    const res = await deleteWorklog(id);
    if (!res.ok) {
      toast.error(res.error || "删除失败");
      return;
    }
    await refreshWorklogs();
  };

  const handleDownloadTemplate = () => {
    const headers = ["日期", "员工", "开始-结束时间", "Rego", "工时备注"];
    const sample = ["2026-03-05", "张三", "9.30-13.45", "ABC123", "示例工时备注"];
    const worksheet = XLSX.utils.aoa_to_sheet([headers, sample]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Worklog");
    XLSX.writeFile(workbook, "worklog-import-template.xlsx");
  };

  const normalizeDateValue = (value: unknown) => {
    if (!value) return "";
    if (value instanceof Date && !Number.isNaN(value.getTime())) {
      return value.toISOString().slice(0, 10);
    }
    if (typeof value === "number") {
      const parsed = XLSX.SSF.parse_date_code(value);
      if (parsed) {
        const year = String(parsed.y).padStart(4, "0");
        const month = String(parsed.m).padStart(2, "0");
        const day = String(parsed.d).padStart(2, "0");
        return `${year}-${month}-${day}`;
      }
    }
    const text = String(value).trim();
    if (!text) return "";
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
    const parsedDate = new Date(text);
    if (!Number.isNaN(parsedDate.getTime())) {
      return parsedDate.toISOString().slice(0, 10);
    }
    return "";
  };

  const handleImportFile = async (file: File) => {
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      if (!worksheet) {
        toast.error("未找到可读取的表格");
        return;
      }
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: "" });
      if (!rows.length) {
        toast.error("表格没有数据");
        return;
      }

      const imported: WorklogEntry[] = [];
      const errors: string[] = [];

      rows.forEach((row, index) => {
        const rowNumber = index + 2;
        const workDate = normalizeDateValue(row["日期"] ?? row["Date"]);
        const staffName = String(row["员工"] ?? row["Staff"] ?? "").trim();
        const timeRange = String(row["开始-结束时间"] ?? row["时间"] ?? row["TimeRange"] ?? "").trim();
        const rego = String(row["Rego"] ?? row["车牌号"] ?? row["Plate"] ?? "").trim().toUpperCase();
        const adminNote = String(row["工时备注"] ?? row["备注"] ?? row["Note"] ?? "").trim();

        const parsedRange = timeRange ? parseTimeRange(timeRange) : null;
        if (!workDate || !staffName || !rego || !parsedRange) {
          errors.push(`第 ${rowNumber} 行数据不完整或时间格式错误`);
          return;
        }

        const staff = staffList.find((item) => item.name === staffName);
        const job = jobs.find((item) => item.rego === rego);

        imported.push({
          id: "",
          staff_name: staffName,
          staff_id: staff?.id,
          team: "",
          role: staff?.role || "Technician",
          service_type: "PNP",
          rego,
          job_id: job?.id,
          job_note: "",
          task_types: [],
          work_date: workDate,
          start_time: parsedRange.start,
          end_time: parsedRange.end,
          cost_rate: staff?.cost_rate || 0,
          admin_note: adminNote,
          source: "admin",
          created_at: "",
          created_by: "import",
          flags: [],
          flagDismissed: false,
        });
      });

      if (!imported.length) {
        toast.error(errors[0] ?? "没有可导入的数据");
        return;
      }

      for (const item of imported) {
        if (!item.job_id || !item.staff_id) {
          errors.push("导入数据缺少工单或员工");
          continue;
        }
        await createWorklog({
          jobId: String(item.job_id),
          staffId: String(item.staff_id),
          serviceType: item.service_type ?? "PNP",
          workDate: item.work_date,
          startTime: item.start_time,
          endTime: item.end_time,
          adminNote: item.admin_note ?? "",
          source: item.source ?? "admin",
        });
      }
      await refreshWorklogs();

      if (errors.length) {
        toast.error(`部分行导入失败：${errors.slice(0, 3).join("；")}`);
      } else {
        toast.success(`成功导入 ${imported.length} 条工时记录`);
      }
    } catch (error) {
      toast.error("导入失败，请检查文件格式");
    }
  };

  return (
    <div
      className="flex min-h-full flex-col text-[14px]"
      style={{
        fontFamily: '"Manrope","Plus Jakarta Sans","Space Grotesk","Segoe UI",sans-serif',
      }}
    >
      <div className="mx-auto flex w-full max-w-[1800px] flex-1 flex-col p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-3xl font-semibold text-[rgba(0,0,0,0.72)]">工时明细列表</h1>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="ghost" onClick={handleDownloadTemplate}>
              下载模板
            </Button>
            <Button variant="primary" onClick={() => fileInputRef.current?.click()}>
              导入 Excel
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) {
                  void handleImportFile(file);
                  event.target.value = "";
                }
              }}
            />
          </div>
        </div>

        <StaffManagement
          staffProfiles={staffList}
          staffColorMap={staffColorMap}
          onAddStaff={handleAddStaff}
          onEditStaff={handleEditStaff}
          onDeleteStaff={handleDeleteStaff}
        />

        <div className="flex min-h-0 flex-1 flex-col">
          <WorkLogTable
            logs={logs}
            staffProfiles={staffList}
            jobs={jobs}
            staffColorMap={staffColorMap}
            editingLogId={editingLogId}
            onAddLog={handleAddLog}
            onEditLog={handleEditLog}
            onCopyLog={handleCopyLog}
            onDismissFlag={handleDismissFlag}
            onDeleteLog={handleDeleteLog}
          />
        </div>
      </div>
    </div>
  );
}
