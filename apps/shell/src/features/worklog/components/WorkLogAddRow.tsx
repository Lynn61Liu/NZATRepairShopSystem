import { useMemo, useState } from "react";
import { Save } from "lucide-react";
import { Button, Input, useToast } from "@/components/ui";
import { formatDate, parseTimeRange } from "../worklog.utils";
import type { WorklogEntry, WorklogJob, WorklogStaffProfile } from "../types";

type Props = {
  staffProfiles: WorklogStaffProfile[];
  jobs: WorklogJob[];
  totalsByJob?: Map<string, { hours: number; cost: number }>;
  onAdd: (log: Omit<WorklogEntry, "id" | "created_at" | "created_by" | "flags">) => void;
};

export function WorkLogAddRow({ staffProfiles, jobs, totalsByJob, onAdd }: Props) {
  const toast = useToast();
  const [staffName, setStaffName] = useState("");
  const [showStaffSuggestions, setShowStaffSuggestions] = useState(false);
  const [serviceType, setServiceType] = useState<"PNP" | "MECH">("PNP");
  const [rego, setRego] = useState("");
  const [regoInput, setRegoInput] = useState("");
  const [showRegoSuggestions, setShowRegoSuggestions] = useState(false);
  const [workDate, setWorkDate] = useState(formatDate(new Date()));
  const [timeRange, setTimeRange] = useState("");
  const [adminNote, setAdminNote] = useState("");

  const selectedStaff = useMemo(
    () => staffProfiles.find((item) => item.name === staffName),
    [staffProfiles, staffName]
  );
  const selectedJob = useMemo(() => jobs.find((item) => item.rego === rego), [jobs, rego]);
  const filteredStaff = useMemo(() => {
    if (!staffName.trim()) return staffProfiles.slice(0, 8);
    const query = staffName.toLowerCase();
    return staffProfiles.filter((staff) => staff.name.toLowerCase().includes(query)).slice(0, 8);
  }, [staffName, staffProfiles]);
  const filteredJobs = useMemo(() => {
    if (!regoInput) return [];
    return jobs.filter((job) => job.rego.toLowerCase().includes(regoInput.toLowerCase())).slice(0, 8);
  }, [jobs, regoInput]);
  const parsedRange = useMemo(() => parseTimeRange(timeRange), [timeRange]);
  const durationHours = parsedRange?.hours ?? 0;
  const wage = useMemo(() => {
    const rate = selectedStaff?.cost_rate || 0;
    return ((parsedRange?.hours ?? 0) * rate).toFixed(2);
  }, [parsedRange?.hours, selectedStaff?.cost_rate]);
  const totalKey = selectedJob?.id ?? rego;
  const totals = totalKey ? totalsByJob?.get(totalKey) : undefined;

  const handleSave = () => {
    if (!staffName.trim() || !rego.trim() || !timeRange.trim()) {
      toast.error("请填写必填项：员工姓名、车牌号、开始-结束时间");
      return;
    }
    const parsed = parseTimeRange(timeRange);
    if (!parsed) {
      toast.error("开始-结束时间格式必须为 9.30-13.45 或 9:30-13:45");
      return;
    }

    onAdd({
      staff_name: staffName.trim(),
      team: "",
      role: selectedStaff?.role || "Technician",
      service_type: serviceType,
      rego: rego.trim(),
      job_id: selectedJob?.id,
      job_note: selectedJob?.note || "",
      task_types: [],
      work_date: workDate,
      start_time: parsed.start,
      end_time: parsed.end,
      cost_rate: selectedStaff?.cost_rate || 0,
      admin_note: adminNote,
      source: "admin",
      flagDismissed: false,
    });

    setStaffName("");
    setShowStaffSuggestions(false);
    setServiceType("PNP");
    setRego("");
    setRegoInput("");
    setShowRegoSuggestions(false);
    setWorkDate(formatDate(new Date()));
    setTimeRange("");
    setAdminNote("");
    toast.success("工时记录已保存");
  };

  return (
    <tr className="border-b-2 border-blue-200 bg-blue-50">
      <td className="px-4 py-3">
        <Input
          type="date"
          value={workDate}
          onChange={(event) => setWorkDate(event.target.value)}
          className="text-sm"
        />
      </td>
      <td className="relative w-[120px] max-w-[140px] overflow-visible px-4 py-3">
        <Input
          value={staffName}
          onChange={(event) => {
            setStaffName(event.target.value);
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
                  setStaffName(staff.name);
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
          value={serviceType}
          onChange={(event) => setServiceType(event.target.value as "PNP" | "MECH")}
          className="h-9 w-full rounded-md border border-[rgba(0,0,0,0.12)] bg-white px-2 text-sm text-[rgba(0,0,0,0.70)]"
        >
          <option value="PNP">PNP</option>
          <option value="MECH">MECH</option>
        </select>
      </td>
      <td className="px-4 py-3">
        <Input
          value={timeRange}
          onChange={(event) => {
            const value = event.target.value;
            setTimeRange(value);
            parseTimeRange(value);
          }}
          placeholder="如: 9.30-13.45"
          className="text-sm"
        />
      </td>
      <td className="px-4 py-3 text-sm text-[rgba(0,0,0,0.60)]">
        {durationHours ? `${durationHours.toFixed(2)}小时` : "—"}
      </td>
      <td className="px-4 py-3 text-sm font-medium text-[rgba(0,0,0,0.70)]">
        ${wage}
      </td>
      <td className="relative overflow-visible px-4 py-3">
        <Input
          value={regoInput}
          onChange={(event) => {
            const value = event.target.value.toUpperCase();
            setRegoInput(value);
            setRego(value);
            setShowRegoSuggestions(true);
          }}
          onFocus={() => setShowRegoSuggestions(true)}
          placeholder="输入车牌号"
          className="bg-white text-sm"
        />
        {selectedJob?.makeModel ? (
          <div className="mt-1 text-xs text-[rgba(0,0,0,0.45)]">{selectedJob.makeModel}</div>
        ) : null}
        {showRegoSuggestions && filteredJobs.length > 0 ? (
          <div className="absolute left-4 right-4 top-[calc(100%-4px)] z-[60] max-h-40 overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg">
            {filteredJobs.map((job) => (
              <button
                type="button"
                key={job.id}
                onClick={() => {
                  setRego(job.rego);
                  setRegoInput(job.rego);
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
      <td className="px-4 py-3 text-sm text-[rgba(0,0,0,0.60)]">{selectedJob?.note || "-"}</td>
      <td className="px-4 py-3">
        <Input
          value={adminNote}
          onChange={(event) => setAdminNote(event.target.value)}
          placeholder="备注"
          className="text-sm"
        />
      </td>
      <td className="px-4 py-3 text-sm text-[rgba(0,0,0,0.60)]">
        {totals ? `${totals.hours.toFixed(2)}小时` : "—"}
      </td>
      <td className={`px-4 py-3 text-sm ${totals && totals.cost > 300 ? "text-red-600 font-semibold" : "text-[rgba(0,0,0,0.60)]"}`}>
        {totals ? `${totals.cost > 300 ? "!" : ""}$${totals.cost.toFixed(2)}` : "—"}
      </td>
      <td className="px-4 py-3">
        <Button onClick={handleSave} variant="primary" className="h-9" leftIcon={<Save className="size-4" />}>
          保存
        </Button>
      </td>
    </tr>
  );
}
