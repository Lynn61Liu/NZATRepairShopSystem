import { useEffect, useMemo, useState } from "react";
import { Pagination } from "@/components/ui";
import { paginate } from "@/utils/pagination";
import { calculateDuration } from "../worklog.utils";
import { WorkLogAddRow } from "./WorkLogAddRow";
import { WorkLogRow } from "./WorkLogRow";
import type { WorklogEntry, WorklogFlag, WorklogJob, WorklogStaffProfile } from "../types";

type Props = {
  logs: WorklogEntry[];
  staffProfiles: WorklogStaffProfile[];
  jobs: WorklogJob[];
  staffColorMap: Map<string, { pill: string; row: string }>;
  editingLogId: string | null;
  jobTotals?: Map<string, { hours: number; cost: number }>;
  onAddLog: (log: Omit<WorklogEntry, "id" | "created_at" | "created_by" | "flags">) => void;
  onEditLog: (id: string, updates: Partial<WorklogEntry>) => void;
  onCopyLog: (log: WorklogEntry) => void;
  onDismissFlag: (id: string, flag: WorklogFlag) => void;
  onDeleteLog: (id: string) => void;
};

const ITEMS_PER_PAGE = 10;

export function WorkLogTable({
  logs,
  staffProfiles,
  jobs,
  staffColorMap,
  editingLogId,
  jobTotals,
  onAddLog,
  onEditLog,
  onCopyLog,
  onDismissFlag,
  onDeleteLog,
}: Props) {
  const [currentPage, setCurrentPage] = useState(1);
  const totalsByJob = useMemo(() => {
    if (jobTotals) return jobTotals;
    const map = new Map<string, { hours: number; cost: number }>();
    logs.forEach((log) => {
      const key = log.job_id || log.rego;
      const duration = calculateDuration(log.start_time, log.end_time);
      const cost = duration * log.cost_rate;
      const prev = map.get(key) ?? { hours: 0, cost: 0 };
      map.set(key, { hours: prev.hours + duration, cost: prev.cost + cost });
    });
    return map;
  }, [jobTotals, logs]);

  const groupedLogs = useMemo(() => {
    const staffOrder = new Map(staffProfiles.map((staff, index) => [staff.name, index]));
    const latestLogByStaff = new Map<string, number>();

    logs.forEach((log) => {
      const createdAt = new Date(log.created_at).getTime();
      const prev = latestLogByStaff.get(log.staff_name) ?? 0;
      if (createdAt > prev) {
        latestLogByStaff.set(log.staff_name, createdAt);
      }
    });

    return [...logs].sort((a, b) => {
      if (a.staff_name !== b.staff_name) {
        const latestDiff =
          (latestLogByStaff.get(b.staff_name) ?? 0) - (latestLogByStaff.get(a.staff_name) ?? 0);
        if (latestDiff !== 0) return latestDiff;

        return (staffOrder.get(a.staff_name) ?? Number.MAX_SAFE_INTEGER) -
          (staffOrder.get(b.staff_name) ?? Number.MAX_SAFE_INTEGER);
      }
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [logs, staffProfiles]);

  const pagination = paginate(groupedLogs, currentPage, ITEMS_PER_PAGE);

  useEffect(() => {
    if (pagination.currentPage !== currentPage) {
      setCurrentPage(pagination.currentPage);
    }
  }, [currentPage, pagination.currentPage]);

  useEffect(() => {
    if (editingLogId) {
      setCurrentPage(1);
    }
  }, [editingLogId]);

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto overflow-y-visible rounded-lg border border-slate-200 bg-white">
        <table className="w-full min-w-[1560px] border-collapse">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50">
              <th className="px-4 py-3 text-left text-[12px] font-semibold text-[rgba(0,0,0,0.55)]">日期</th>
              <th className="w-[120px] max-w-[140px] px-4 py-3 text-left text-[12px] font-semibold text-[rgba(0,0,0,0.55)]">员工</th>
              <th className="px-4 py-3 text-left text-[12px] font-semibold text-[rgba(0,0,0,0.55)]">服务类型</th>
              <th className="px-4 py-3 text-left text-[12px] font-semibold text-[rgba(0,0,0,0.55)]">开始-结束时间</th>
              <th className="px-4 py-3 text-left text-[12px] font-semibold text-[rgba(0,0,0,0.55)]">工时</th>
              <th className="px-4 py-3 text-left text-[12px] font-semibold text-[rgba(0,0,0,0.55)]">Cost</th>
              <th className="px-4 py-3 text-left text-[12px] font-semibold text-[rgba(0,0,0,0.55)]">Rego</th>
              <th className="px-4 py-3 text-left text-[12px] font-semibold text-[rgba(0,0,0,0.55)]">片数</th>
              <th className="px-4 py-3 text-left text-[12px] font-semibold text-[rgba(0,0,0,0.55)]">工单备注</th>
              <th className="px-4 py-3 text-left text-[12px] font-semibold text-[rgba(0,0,0,0.55)]">工时备注</th>
              <th className="px-4 py-3 text-left text-[12px] font-semibold text-[rgba(0,0,0,0.55)]">总工时</th>
              <th className="px-4 py-3 text-left text-[12px] font-semibold text-[rgba(0,0,0,0.55)]">总Cost</th>
              <th className="px-4 py-3 text-left text-[12px] font-semibold text-[rgba(0,0,0,0.55)]">操作</th>
            </tr>
            <WorkLogAddRow
              staffProfiles={staffProfiles}
              jobs={jobs}
              onAdd={onAddLog}
              totalsByJob={totalsByJob}
            />
          </thead>
          <tbody>
            {pagination.pageRows.map((log) => (
              <WorkLogRow
                key={log.id}
                log={log}
                staffProfiles={staffProfiles}
                jobs={jobs}
                staffColorMap={staffColorMap}
                forceEditing={editingLogId === log.id}
                totalsByJob={totalsByJob}
                onEdit={(updates) => onEditLog(log.id, updates)}
                onCopy={() => onCopyLog(log)}
                onDismissFlag={(flag) => onDismissFlag(log.id, flag)}
                onDelete={() => onDeleteLog(log.id)}
              />
            ))}
          </tbody>
        </table>
      </div>

      <Pagination
        currentPage={pagination.currentPage}
        totalPages={pagination.totalPages}
        pageSize={ITEMS_PER_PAGE}
        totalItems={pagination.totalItems}
        onPageChange={setCurrentPage}
      />
    </div>
  );
}
