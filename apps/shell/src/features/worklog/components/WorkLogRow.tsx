import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Copy, Edit, Trash2 } from "lucide-react";
import { Button, Input, useToast } from "@/components/ui";
import {
  calculateDuration,
  calculateWage,
  flagLabel,
  getStaffPillColor,
  getStaffRowColor,
  parseTimeRange,
} from "../worklog.utils";
import type { WorklogEntry, WorklogFlag, WorklogJob, WorklogStaffProfile } from "../types";
import { Link } from "react-router-dom";

type Props = {
  log: WorklogEntry;
  staffProfiles: WorklogStaffProfile[];
  jobs: WorklogJob[];
  staffColorMap: Map<string, { pill: string; row: string }>;
  totalsByJob?: Map<string, { hours: number; cost: number }>;
  forceEditing?: boolean;
  onEdit: (updates: Partial<WorklogEntry>) => void;
  onCopy: () => void;
  onDismissFlag: (flag: WorklogFlag) => void;
  onDelete: () => void;
};

export function WorkLogRow({
  log,
  staffProfiles,
  jobs,
  staffColorMap,
  totalsByJob,
  forceEditing = false,
  onEdit,
  onCopy,
  onDismissFlag,
  onDelete,
}: Props) {
  const toast = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [editData, setEditData] = useState<WorklogEntry>(log);
  const [editTimeRange, setEditTimeRange] = useState(`${log.start_time}-${log.end_time}`);
  const [showStaffSuggestions, setShowStaffSuggestions] = useState(false);
  const [editRegoInput, setEditRegoInput] = useState(log.rego);
  const [showRegoSuggestions, setShowRegoSuggestions] = useState(false);

  const selectedStaff = useMemo(
    () => staffProfiles.find((item) => item.name === editData.staff_name),
    [editData.staff_name, staffProfiles]
  );
  const selectedJob = useMemo(() => jobs.find((item) => item.rego === editData.rego), [editData.rego, jobs]);
  const makeModel = selectedJob?.makeModel;
  const customerCode = selectedJob?.customerCode;
  const staffPillColor = useMemo(
    () => getStaffPillColor(log.staff_name, staffColorMap),
    [log.staff_name, staffColorMap]
  );
  const rowColor = useMemo(
    () => getStaffRowColor(log.staff_name, staffColorMap),
    [log.staff_name, staffColorMap]
  );
  const totalsKey = log.job_id || log.rego;
  const totals = totalsByJob?.get(totalsKey);
  const durationHours = calculateDuration(log.start_time, log.end_time);
  const wage = calculateWage(log.start_time, log.end_time, log.cost_rate);

  const filteredStaff = useMemo(() => {
    if (!editData.staff_name.trim()) return staffProfiles.slice(0, 8);
    const query = editData.staff_name.toLowerCase();
    return staffProfiles.filter((staff) => staff.name.toLowerCase().includes(query)).slice(0, 8);
  }, [editData.staff_name, staffProfiles]);
  const filteredJobs = useMemo(() => {
    if (!editRegoInput.trim()) return [];
    const query = editRegoInput.toLowerCase();
    return jobs.filter((job) => job.rego.toLowerCase().includes(query)).slice(0, 8);
  }, [editRegoInput, jobs]);

  useEffect(() => {
    if (!forceEditing) return;
    setEditData(log);
    setEditTimeRange(`${log.start_time}-${log.end_time}`);
    setEditRegoInput(log.rego);
    setIsEditing(true);
  }, [forceEditing, log]);

  const saveEdit = () => {
    if (!editData.staff_name.trim() || !editData.rego.trim() || !editTimeRange.trim()) {
      toast.error("请填写必填项：员工姓名、车牌号、开始-结束时间");
      return;
    }
    const parsed = parseTimeRange(editTimeRange);
    if (!parsed) {
      toast.error("开始-结束时间格式必须为 9.30-13.45 或 9:30-13:45");
      return;
    }

    onEdit({
      ...editData,
      service_type: editData.service_type ?? "PNP",
      start_time: parsed.start,
      end_time: parsed.end,
    });
    setIsEditing(false);
    toast.success("工时记录已更新");
  };

  if (isEditing) {
    const parsedEditRange = parseTimeRange(editTimeRange);
    const editHours = parsedEditRange?.hours ?? 0;
    const editWage = calculateWage(
      parsedEditRange?.start ?? editData.start_time,
      parsedEditRange?.end ?? editData.end_time,
      editData.cost_rate
    );
    const editTotalsKey = editData.job_id || editData.rego;
    const editTotals = editTotalsKey ? totalsByJob?.get(editTotalsKey) : undefined;

    return (
      <tr className="border-b border-slate-200 hover:bg-slate-50">
        <td className="px-4 py-3">
          <Input
            type="date"
            value={editData.work_date}
            onChange={(event) => setEditData((prev) => ({ ...prev, work_date: event.target.value }))}
            className="text-sm"
          />
        </td>
        <td className="relative w-[120px] max-w-[140px] overflow-visible px-4 py-3">
          <Input
            value={editData.staff_name}
            onChange={(event) => {
              setEditData((prev) => ({ ...prev, staff_name: event.target.value }));
              setShowStaffSuggestions(true);
            }}
            onFocus={() => setShowStaffSuggestions(true)}
            placeholder="输入姓名"
            className="bg-white text-sm"
          />
          {showStaffSuggestions && filteredStaff.length > 0 ? (
            <div className="absolute left-4 right-4 top-[calc(100%-4px)] z-[60] max-h-40 overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg">
              {filteredStaff.map((staff) => (
                <button
                  type="button"
                  key={staff.id}
                  onClick={() => {
                    setEditData((prev) => ({
                      ...prev,
                      staff_name: staff.name,
                      staff_id: staff.id,
                      team: "",
                      role: staff.role,
                      cost_rate: staff.cost_rate,
                    }));
                    setShowStaffSuggestions(false);
                  }}
                  className="block w-full px-3 py-2 text-left text-sm hover:bg-blue-50"
                >
                  {staff.name}
                </button>
              ))}
            </div>
          ) : null}
        </td>
        <td className="px-4 py-3">
          <select
            value={editData.service_type ?? "PNP"}
            onChange={(event) =>
              setEditData((prev) => ({ ...prev, service_type: event.target.value as "PNP" | "MECH" }))
            }
            className="h-9 w-full rounded-md border border-[rgba(0,0,0,0.12)] bg-white px-2 text-sm text-[rgba(0,0,0,0.70)]"
          >
            <option value="PNP">PNP</option>
            <option value="MECH">MECH</option>
          </select>
        </td>
        <td className="px-4 py-3">
          <Input
            value={editTimeRange}
            onChange={(event) => setEditTimeRange(event.target.value)}
            placeholder="如: 9.30-13.45"
            className="text-sm"
          />
        </td>
        <td className="px-4 py-3 text-sm text-[rgba(0,0,0,0.60)]">
          {editHours ? `${editHours.toFixed(2)}小时` : "—"}
        </td>
        <td className="px-4 py-3 text-sm font-medium text-[rgba(0,0,0,0.70)]">
          ${editWage.toFixed(2)}
        </td>
        <td className="relative overflow-visible px-4 py-3">
          <Input
            value={editRegoInput}
            onChange={(event) => {
              const value = event.target.value.toUpperCase();
              setEditRegoInput(value);
              setShowRegoSuggestions(true);
              const job = jobs.find((item) => item.rego === value);
              setEditData((prev) => ({
                ...prev,
                rego: value,
                job_id: job?.id,
                job_note: job?.note || prev.job_note,
              }));
            }}
            onFocus={() => setShowRegoSuggestions(true)}
            className="text-sm"
          />
          {makeModel ? (
            <div className="mt-1 text-xs text-[rgba(0,0,0,0.45)]">{makeModel}</div>
          ) : null}
          {showRegoSuggestions && filteredJobs.length > 0 ? (
            <div className="absolute left-4 right-4 top-[calc(100%-4px)] z-[60] max-h-40 overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg">
              {filteredJobs.map((job) => (
                <button
                  type="button"
                  key={job.id}
                  onClick={() => {
                    setEditRegoInput(job.rego);
                    setEditData((prev) => ({
                      ...prev,
                      rego: job.rego,
                      job_id: job.id,
                      job_note: job.note || prev.job_note,
                    }));
                    setShowRegoSuggestions(false);
                  }}
                  className="block w-full px-3 py-2 text-left text-sm hover:bg-blue-50"
                >
                  {job.rego} ({job.created_date})
                </button>
              ))}
            </div>
          ) : null}
        </td>
        <td className="px-4 py-3 text-sm text-[rgba(0,0,0,0.60)] text-center">
          {selectedJob?.panels ?? "—"}
        </td>
        <td className="px-4 py-3 text-sm text-[rgba(0,0,0,0.60)]">{selectedJob?.note || editData.job_note}</td>
        <td className="px-4 py-3">
          <Input
            value={editData.admin_note}
            onChange={(event) => setEditData((prev) => ({ ...prev, admin_note: event.target.value }))}
            placeholder="备注"
            className="text-sm"
          />
        </td>
        <td className="px-4 py-3 text-sm text-[rgba(0,0,0,0.60)]">
          {editTotals ? `${editTotals.hours.toFixed(2)}小时` : "—"}
        </td>
        <td className={`px-4 py-3 text-sm ${editTotals && editTotals.cost > 300 ? "text-red-600 font-semibold" : "text-[rgba(0,0,0,0.60)]"}`}>
          {editTotals ? `${editTotals.cost > 300 ? "!" : ""}$${editTotals.cost.toFixed(2)}` : "—"}
        </td>
        <td className="px-4 py-3">
          <div className="flex gap-1">
            <Button onClick={saveEdit} className="h-8 px-3">
              保存
            </Button>
            <Button onClick={() => { setEditData(log); setEditTimeRange(`${log.start_time}-${log.end_time}`); setEditRegoInput(log.rego); setIsEditing(false); }} className="h-8 px-3">
              取消
            </Button>
          </div>
        </td>
      </tr>
    );
  }

  const regoDisplay = customerCode ? `${log.rego} - ${customerCode}` : log.rego;

  return (
    <tr className={`border-b border-slate-200 hover:bg-slate-50 ${rowColor}`}>
      <td className="px-4 py-3 text-sm text-[rgba(0,0,0,0.60)]">{log.work_date}</td>
      <td className="w-[120px] max-w-[140px] px-4 py-3">
        <span className={`inline-block rounded-full border px-3 py-1 text-sm font-medium ${staffPillColor}`}>
          {log.staff_name}
        </span>
      </td>
      <td className="px-4 py-3 text-sm text-[rgba(0,0,0,0.60)]">
        {log.service_type ?? "PNP"}
      </td>
      <td className="px-4 py-3 text-sm text-[rgba(0,0,0,0.60)]">
        {log.start_time}-{log.end_time}
      </td>
      <td className="px-4 py-3 text-sm text-[rgba(0,0,0,0.60)]">
        {durationHours ? `${durationHours.toFixed(2)}小时` : "—"}
      </td>
      <td className="px-4 py-3 text-sm font-medium text-[rgba(0,0,0,0.70)]">
        ${wage.toFixed(2)}
      </td>
      <td className="px-4 py-3">
        {log.job_id ? (
          <div className="flex flex-col">
            <Link to={`/jobs/${log.job_id}?tab=Worklog`} className="text-sm text-blue-600 hover:underline">
              {regoDisplay}
            </Link>
            {makeModel ? (
              <span className="text-xs text-[rgba(0,0,0,0.45)]">{makeModel}</span>
            ) : null}
          </div>
        ) : (
          <div className="flex flex-col">
            <span className="text-sm text-[rgba(0,0,0,0.70)]">{regoDisplay}</span>
            {makeModel ? (
              <span className="text-xs text-[rgba(0,0,0,0.45)]">{makeModel}</span>
            ) : null}
          </div>
        )}
      </td>
      <td className="px-4 py-3 text-sm text-[rgba(0,0,0,0.60)] text-center">
        {selectedJob?.panels ?? "—"}
      </td>
      <td className="px-4 py-3 text-sm text-[rgba(0,0,0,0.60)]">{log.job_note}</td>
      <td className="px-4 py-3 text-sm text-[rgba(0,0,0,0.60)]">{log.admin_note || "—"}</td>
      <td className="px-4 py-3 text-sm text-[rgba(0,0,0,0.60)]">
        {totals ? `${totals.hours.toFixed(2)}小时` : "—"}
      </td>
      <td className={`px-4 py-3 text-sm ${totals && totals.cost > 300 ? "text-red-600 font-semibold" : "text-[rgba(0,0,0,0.60)]"}`}>
        {totals ? `${totals.cost > 300 ? "!" : ""}$${totals.cost.toFixed(2)}` : "—"}
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => setIsEditing(true)} className="rounded-md p-2 hover:bg-white">
            <Edit className="size-4" />
          </button>
          <button type="button" onClick={onCopy} className="rounded-md p-2 hover:bg-white">
            <Copy className="size-4" />
          </button>
          <button type="button" onClick={onDelete} className="rounded-md p-2 hover:bg-white">
            <Trash2 className="size-4 text-red-600" />
          </button>
          {log.flagDismissed || log.flags.length === 0 ? null : (
            <button
              type="button"
              onClick={() => log.flags.forEach((flag) => onDismissFlag(flag))}
              className="rounded-md p-2 text-red-500 hover:bg-red-50 hover:text-red-700"
              title={`${log.flags.map((flag) => flagLabel(flag)).join("，")}，点击解除标记`}
            >
              <AlertTriangle className="size-4" />
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}
