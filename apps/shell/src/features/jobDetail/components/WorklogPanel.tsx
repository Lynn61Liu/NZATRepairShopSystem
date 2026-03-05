import { useMemo } from "react";
import { useToast } from "@/components/ui";
import { WorkLogTable } from "@/features/worklog/components/WorkLogTable";
import { useWorklogData } from "@/features/worklog/hooks/useWorklogData";
import { buildStaffColorMap } from "@/features/worklog/worklog.utils";
import type { WorklogEntry } from "@/features/worklog/types";
import type { JobDetailData } from "@/types";

type WorklogPanelProps = {
  jobData: JobDetailData;
  paintPanels?: number | null;
};

export function WorklogPanel({ jobData, paintPanels }: WorklogPanelProps) {
  const toast = useToast();
  const {
    logs,
    staffList,
    editingLogId,
    setEditingLogId,
    handleAddLog,
    handleEditLog,
    handleCopyLog,
    handleDeleteLog,
  } = useWorklogData({ jobId: jobData.id });

  const staffColorMap = useMemo(
    () => buildStaffColorMap(staffList.map((staff) => staff.name)),
    [staffList]
  );

  const jobs = useMemo(() => {
    const makeModel = [jobData.vehicle.year, jobData.vehicle.make, jobData.vehicle.model]
      .filter(Boolean)
      .join(" ");
    return [
      {
        id: jobData.id,
        rego: jobData.vehicle.plate,
        note: jobData.notes ?? "",
        created_date: String(jobData.createdAt ?? "").slice(0, 10),
        makeModel: makeModel || undefined,
        panels: typeof paintPanels === "number" ? paintPanels : null,
        customerCode: jobData.customer.businessCode ?? "",
      },
    ];
  }, [jobData, paintPanels]);

  const logsWithJobNote = useMemo(
    () =>
      logs.map((log) => ({
        ...log,
        job_note: jobData.notes ?? log.job_note,
      })),
    [jobData.notes, logs]
  );

  const handleAdd = async (
    newLog: Omit<WorklogEntry, "id" | "created_at" | "created_by" | "flags">
  ) => {
    const res = await handleAddLog(newLog);
    if (!res.ok) {
      toast.error("新增失败");
      return;
    }
    setEditingLogId(null);
  };

  const handleEdit = async (id: string, updates: Partial<WorklogEntry>) => {
    const res = await handleEditLog(id, updates);
    if (!res.ok) {
      toast.error("更新失败");
      return;
    }
    setEditingLogId((prev) => (prev === id ? null : prev));
  };

  const handleCopy = async (log: WorklogEntry) => {
    const res = await handleCopyLog(log);
    if (!res.ok) {
      toast.error("复制失败");
      return;
    }
    if (res.id) {
      setEditingLogId(res.id);
    }
  };

  const handleDelete = async (id: string) => {
    const res = await handleDeleteLog(id);
    if (!res.ok) {
      toast.error("删除失败");
    }
  };

  return (
    <div className="flex min-h-[520px] flex-1 flex-col">
      <WorkLogTable
        logs={logsWithJobNote}
        staffProfiles={staffList}
        jobs={jobs}
        staffColorMap={staffColorMap}
        editingLogId={editingLogId}
        onAddLog={handleAdd}
        onEditLog={handleEdit}
        onCopyLog={handleCopy}
        onDismissFlag={() => {}}
        onDeleteLog={handleDelete}
      />
    </div>
  );
}
