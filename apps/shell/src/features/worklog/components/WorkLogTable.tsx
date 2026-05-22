import { Fragment, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Pagination } from "@/components/ui";
import { paginate } from "@/utils/pagination";
import { calculateDuration, getStaffPillColor } from "../worklog.utils";
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
const TABLE_COLUMN_COUNT = 13;

function formatGroupHours(hours: number) {
  return `${Number(hours.toFixed(2)).toString()}h`; } export function WorkLogTable({ logs, staffProfiles, jobs, staffColorMap, editingLogId, jobTotals, onAddLog, onEditLog, onCopyLog, onDismissFlag, onDeleteLog, }: Props) { const [currentPage, setCurrentPage] = useState(1); const [collapsedDates, setCollapsedDates] = useState<Record<string, boolean>>({}); const totalsByJob = useMemo(() => { if (jobTotals) return jobTotals; const map = new Map<string, { hours: number; cost: number }>(); logs.forEach((log) => { const key = log.job_id || log.rego; const duration = calculateDuration(log.start_time, log.end_time); const cost = duration * log.cost_rate; const prev = map.get(key) ?? { hours: 0, cost: 0 }; map.set(key, { hours: prev.hours + duration, cost: prev.cost + cost }); }); return map; }, [jobTotals, logs]); const groupedLogs = useMemo(() => { const staffOrder = new Map(staffProfiles.map((staff, index) => [staff.name, index])); const logsByDate = new Map<string, WorklogEntry[]>(); logs.forEach((log) => { const key = log.work_date || ""; const entries = logsByDate.get(key) ?? []; entries.push(log); logsByDate.set(key, entries); }); return Array.from(logsByDate.entries()) .sort(([dateA], [dateB]) => dateB.localeCompare(dateA)) .map(([workDate, dateLogs]) => { const latestLogByStaff = new Map<string, number>(); const totalsByStaff = new Map<string, number>(); const logsByStaff = new Map<string, WorklogEntry[]>(); dateLogs.forEach((log) => { const createdAt = new Date(log.created_at).getTime(); const prevLatest = latestLogByStaff.get(log.staff_name) ?? 0; if (createdAt > prevLatest) { latestLogByStaff.set(log.staff_name, createdAt); } totalsByStaff.set( log.staff_name, (totalsByStaff.get(log.staff_name) ?? 0) + calculateDuration(log.start_time, log.end_time) ); const entries = logsByStaff.get(log.staff_name) ?? []; entries.push(log); logsByStaff.set(log.staff_name, entries); }); const staffGroups = Array.from(logsByStaff.entries()) .sort(([staffA], [staffB]) => { const latestDiff = (latestLogByStaff.get(staffB) ?? 0) - (latestLogByStaff.get(staffA) ?? 0); if (latestDiff !== 0) return latestDiff; return (staffOrder.get(staffA) ?? Number.MAX_SAFE_INTEGER) - (staffOrder.get(staffB) ?? Number.MAX_SAFE_INTEGER); }) .map(([staffName, staffLogs]) => ({ staffName, totalHours: totalsByStaff.get(staffName) ?? 0, logs: [...staffLogs].sort( (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime() ), })); return { workDate, summary: staffGroups.map((group) => ({ staffName: group.staffName, totalHours: formatGroupHours(group.totalHours), })), staffGroups, }; }); }, [logs, staffProfiles]); const pagination = paginate(groupedLogs, currentPage, ITEMS_PER_PAGE); useEffect(() => { setCollapsedDates((prev) => { const next: Record<string, boolean> = {}; groupedLogs.forEach((group, index) => { next[group.workDate] = prev[group.workDate] ?? index !== 0; }); return next; }); }, [groupedLogs]); useEffect(() => { if (pagination.currentPage !== currentPage) { setCurrentPage(pagination.currentPage); } }, [currentPage, pagination.currentPage]); useEffect(() => { if (editingLogId) { setCurrentPage(1); } }, [editingLogId]); return ( <div className="flex min-h-0 flex-1 flex-col space-y-4"> <div className="flex min-h-0 flex-1 flex-col overflow-x-auto overflow-y-auto rounded-lg border border-slate-200 bg-white"> <table className="w-full min-w-[1560px] border-collapse"> <thead> <tr className="border-b border-slate-200 bg-slate-50"> <th className="px-4 py-3 text-left text-[12px] font-semibold text-[rgba(0,0,0,0.55)]">Date</th> <th className="w-[120px] max-w-[140px] px-4 py-3 text-left text-[12px] font-semibold text-[rgba(0,0,0,0.55)]">Employees</th> <th className="px-4 py-3 text-left text-[12px] font-semibold text-[rgba(0,0,0,0.55)]">Service Type</th> <th className="px-4 py-3 text-left text-[12px] font-semibold text-[rgba(0,0,0,0.55)]">Start-End Time</th> <th className="px-4 py-3 text-left text-[12px] font-semibold text-[rgba(0,0,0,0.55)]">Working hours</th> <th className="px-4 py-3 text-left text-[12px] font-semibold text-[rgba(0,0,0,0.55)]">Cost</th> <th className="px-4 py-3 text-left text-[12px] font-semibold text-[rgba(0,0,0,0.55)]">Rego</th> <th className="px-4 py-3 text-left text-[12px] font-semibold text-[rgba(0,0,0,0.55)]">Number of slices</th> <th className="px-4 py-3 text-left text-[12px] font-semibold text-[rgba(0,0,0,0.55)]">Work order notes</th> <th className="px-4 py-3 text-left text-[12px] font-semibold text-[rgba(0,0,0,0.55)]">Working hours notes</th> <th className="px-4 py-3 text-left text-[12px] font-semibold text-[rgba(0,0,0,0.55)]">Total working hours</th> <th className="px-4 py-3 text-left text-[12px] font-semibold text-[rgba(0,0,0,0.55)]">Total Cost</th> <th className="px-4 py-3 text-left text-[12px] font-semibold text-[rgba(0,0,0,0.55)]">Operation</th> </tr> <WorkLogAddRow staffProfiles={staffProfiles} jobs={jobs} onAdd={onAddLog} totalsByJob={totalsByJob} /> </thead> <tbody> {pagination.pageRows.map((group) => { const isCollapsed = collapsedDates[group.workDate] ?? false; const ToggleIcon = isCollapsed ? ChevronRight : ChevronDown; return ( <Fragment key={group.workDate}> <tr key={`${group.workDate}-header`} className="border-b border-slate-200 bg-slate-100">
                    <td colSpan={TABLE_COLUMN_COUNT} className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() =>
                          setCollapsedDates((prev) => ({ ...prev, [group.workDate]: !isCollapsed }))
                        }
                        className="flex w-full flex-wrap items-center gap-2 text-left text-sm font-semibold text-slate-700"
                      >
                        <ToggleIcon className="size-4 text-slate-500" />
                        <span>{group.workDate}</span>
                        {group.summary.length > 0 ? (
                          <span className="flex flex-wrap items-center gap-2">
                            {group.summary.map((item) => (
                              <span
                                key={`${group.workDate}-${item.staffName}`}
                                className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${getStaffPillColor(item.staffName, staffColorMap)}`}
                              >
                                {item.staffName} {item.totalHours}
                              </span>
                            ))}
                          </span>
                        ) : null}
                      </button>
                    </td>
                  </tr>
                  {!isCollapsed
                    ? group.staffGroups.flatMap((staffGroup) =>
                        staffGroup.logs.map((log) => (
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
                        ))
                      )
                    : null}
                </Fragment>
              );
            })}
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
