import { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { requestJson } from "@/utils/api";
import { notifyWorklogCostAlert } from "@/utils/refreshSignals";
import { Button, useToast } from "@/components/ui";
import { StaffManagement } from "@/features/worklog/components/StaffManagement";
import { WorkLogTable } from "@/features/worklog/components/WorkLogTable";
import { initialWorklogEntries, worklogJobs, worklogStaffProfiles } from "@/features/worklog/mockData";
import {
  buildStaffColorMap,
  calculateDuration,
  detectFlags,
  formatDateTime,
  parseTimeRange,
} from "@/features/worklog/worklog.utils";
import type { WorklogEntry, WorklogFlag, WorklogJob, WorklogStaffProfile } from "@/features/worklog/types";

export function WorklogPage() {
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [logs, setLogs] = useState<WorklogEntry[]>(() =>
    initialWorklogEntries.map((log) => ({
      ...log,
      flags: log.flagDismissed ? [] : detectFlags(log, initialWorklogEntries),
    }))
  );
  const [staffList, setStaffList] = useState<WorklogStaffProfile[]>(worklogStaffProfiles);
  const [nextId, setNextId] = useState(initialWorklogEntries.length + 1);
  const [nextStaffId, setNextStaffId] = useState(worklogStaffProfiles.length + 1);
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

    void loadJobs();
    return () => {
      cancelled = true;
    };
  }, []);

  const jobs = useMemo(() => {
    const merged = new Map<string, WorklogJob>();
    [...worklogJobs, ...apiJobs].forEach((job) => {
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

  const handleAddLog = (newLog: Omit<WorklogEntry, "id" | "created_at" | "created_by" | "flags">) => {
    const log: WorklogEntry = {
      ...newLog,
      id: String(nextId),
      created_at: formatDateTime(new Date()),
      created_by: "admin",
      flags: [],
    };
    const updated = recalculateFlags([...logs, log]);
    setLogs(updated);
    setEditingLogId(null);
    setNextId((prev) => prev + 1);
  };

  const handleEditLog = (id: string, updates: Partial<WorklogEntry>) => {
    const updated = recalculateFlags(logs.map((log) => (log.id === id ? { ...log, ...updates } : log)));
    setLogs(updated);
    setEditingLogId((prev) => (prev === id ? null : prev));
  };

  const handleCopyLog = (log: WorklogEntry) => {
    const copiedId = String(nextId);
    const copied: WorklogEntry = {
      ...log,
      id: copiedId,
      created_at: formatDateTime(new Date()),
      created_by: "admin",
      flagDismissed: false,
      flags: [],
    };
    const updated = recalculateFlags([...logs, copied]);
    setLogs(updated);
    setEditingLogId(copiedId);
    setNextId((prev) => prev + 1);
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

  const handleAddStaff = (newStaff: Omit<WorklogStaffProfile, "id">) => {
    setStaffList((prev) => [...prev, { ...newStaff, id: String(nextStaffId) }]);
    setNextStaffId((prev) => prev + 1);
  };

  const handleEditStaff = (id: string, updates: Partial<WorklogStaffProfile>) => {
    setStaffList((prev) => prev.map((staff) => (staff.id === id ? { ...staff, ...updates } : staff)));
  };

  const handleDeleteStaff = (id: string) => {
    setStaffList((prev) => prev.filter((staff) => staff.id !== id));
  };

  const handleDeleteLog = (id: string) => {
    setLogs((prev) => recalculateFlags(prev.filter((log) => log.id !== id)));
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

      const createdAt = formatDateTime(new Date());
      const imported: WorklogEntry[] = [];
      const errors: string[] = [];
      let nextLocalId = nextId;

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
          id: String(nextLocalId++),
          staff_name: staffName,
          team: "",
          role: staff?.role || "Technician",
          service_type: "PNP",
          rego,
          job_id: job?.id,
          job_note: job?.note || "",
          task_types: [],
          work_date: workDate,
          start_time: parsedRange.start,
          end_time: parsedRange.end,
          cost_rate: staff?.cost_rate || 0,
          admin_note: adminNote,
          source: "admin",
          created_at: createdAt,
          created_by: "import",
          flags: [],
          flagDismissed: false,
        });
      });

      if (!imported.length) {
        toast.error(errors[0] ?? "没有可导入的数据");
        return;
      }

      setLogs((prev) => recalculateFlags([...prev, ...imported]));
      setNextId(nextLocalId);

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
      className="min-h-full space-y-4 text-[14px]"
      style={{
        fontFamily: '"Manrope","Plus Jakarta Sans","Space Grotesk","Segoe UI",sans-serif',
      }}
    >
      <div className="mx-auto max-w-[1800px] p-6">
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
  );
}
