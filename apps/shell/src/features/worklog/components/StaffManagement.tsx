import { useState } from "react";
import { Check, ChevronDown, ChevronRight, Edit, Plus, Trash2, X } from "lucide-react";
import { Card, Input, useToast } from "@/components/ui";
import { getStaffPillColor } from "../worklog.utils";
import type { WorklogRole, WorklogStaffProfile } from "../types";

type Props = {
  staffProfiles: WorklogStaffProfile[];
  staffColorMap: Map<string, { pill: string; row: string }>;
  onAddStaff: (staff: Omit<WorklogStaffProfile, "id">) => void;
  onEditStaff: (id: string, updates: Partial<WorklogStaffProfile>) => void;
  onDeleteStaff: (id: string) => void;
};

export function StaffManagement({
  staffProfiles,
  staffColorMap,
  onAddStaff,
  onEditStaff,
  onDeleteStaff,
}: Props) {
  const toast = useToast();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newStaff, setNewStaff] = useState({
    name: "",
    role: "Technician" as WorklogRole,
    cost_rate: 0,
  });
  const [editData, setEditData] = useState<WorklogStaffProfile | null>(null);

  const handleAdd = () => {
    if (!newStaff.name.trim()) {
      toast.error("请填写员工姓名");
      return;
    }
    if (!Number.isFinite(newStaff.cost_rate) || newStaff.cost_rate <= 0) {
      toast.error("时薪必须是大于 0 的数字");
      return;
    }
    onAddStaff(newStaff);
    setNewStaff({ name: "", role: "Technician", cost_rate: 0 });
    setIsAdding(false);
    toast.success("员工已添加");
  };

  const handleSaveEdit = () => {
    if (!editData) return;
    if (!editData.name.trim()) {
      toast.error("请填写员工姓名");
      return;
    }
    if (!Number.isFinite(editData.cost_rate) || editData.cost_rate <= 0) {
      toast.error("时薪必须是大于 0 的数字");
      return;
    }
    onEditStaff(editData.id, editData);
    setEditingId(null);
    setEditData(null);
    toast.success("员工信息已更新");
  };

  return (
    <Card className="mb-6 overflow-hidden">
      <div
        className="cursor-pointer border-b border-[rgba(0,0,0,0.06)] px-6 py-5"
        onClick={() => setIsExpanded((prev) => !prev)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-lg font-semibold text-[rgba(0,0,0,0.80)]">
            {isExpanded ? <ChevronDown className="size-5" /> : <ChevronRight className="size-5" />}
            员工管理
          </div>
          <span className="text-sm text-[rgba(0,0,0,0.55)]">{staffProfiles.length} 名员工</span>
        </div>
      </div>

      {isExpanded ? (
        <div className="space-y-4 px-6 py-5">
          <div className="flex flex-wrap gap-2">
            {staffProfiles.map((staff) => (
              <div
                key={staff.id}
                className="flex items-center gap-3 rounded-lg border border-[rgba(0,0,0,0.08)] bg-white p-3 hover:bg-slate-50"
              >
              {editingId === staff.id && editData ? (
                <>
                  <Input
                    value={editData.name}
                    onChange={(event) => setEditData({ ...editData, name: event.target.value })}
                    placeholder="姓名"
                    className="min-w-[120px]"
                  />
                  <div className="flex items-center gap-1">
                    <span className="text-sm">$</span>
                    <Input
                      type="number"
                      inputMode="decimal"
                      step="0.01"
                      min="0"
                      value={editData.cost_rate}
                      onChange={(event) =>
                        setEditData({
                          ...editData,
                          cost_rate: Number(event.target.value || 0),
                        })
                      }
                      className="min-w-[96px]"
                    />
                  </div>
                  <div className="ml-auto flex gap-1">
                    <button type="button" onClick={handleSaveEdit} className="rounded-md p-2 hover:bg-slate-100">
                      <Check className="size-4 text-green-600" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(null);
                        setEditData(null);
                      }}
                      className="rounded-md p-2 hover:bg-slate-100"
                    >
                      <X className="size-4 text-red-600" />
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`inline-flex rounded-full px-3 py-1 text-sm font-medium ${getStaffPillColor(staff.name, staffColorMap)}`}
                      >
                        {staff.name}
                      </span>
                    </div>
                  </div>
                  <span className="text-sm font-medium text-[rgba(0,0,0,0.70)]">${staff.cost_rate}/小时</span>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingId(staff.id);
                        setEditData(staff);
                      }}
                      className="rounded-md p-2 hover:bg-slate-100"
                    >
                      <Edit className="size-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteStaff(staff.id)}
                      className="rounded-md p-2 hover:bg-slate-100"
                    >
                      <Trash2 className="size-4 text-red-600" />
                    </button>
                  </div>
                </>
              )}
              </div>
            ))}

            {isAdding ? (
              <div className="flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 p-3">
                <Input
                  value={newStaff.name}
                  onChange={(event) => setNewStaff({ ...newStaff, name: event.target.value })}
                  placeholder="姓名"
                  className="min-w-[120px]"
                />
                <div className="flex items-center gap-1">
                  <span className="text-sm">$</span>
                  <Input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    min="0"
                    value={newStaff.cost_rate || ""}
                    onChange={(event) =>
                      setNewStaff({ ...newStaff, cost_rate: Number(event.target.value || 0) })
                    }
                    className="min-w-[96px]"
                  />
                </div>
                <div className="ml-auto flex gap-1">
                  <button type="button" onClick={handleAdd} className="rounded-md p-2 hover:bg-white">
                    <Check className="size-4 text-green-600" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsAdding(false);
                      setNewStaff({ name: "", role: "Technician", cost_rate: 0 });
                    }}
                    className="rounded-md p-2 hover:bg-white"
                  >
                    <X className="size-4 text-red-600" />
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setIsAdding(true)}
                className="flex items-center gap-2 rounded-lg border border-dashed border-[rgba(0,0,0,0.20)] bg-white p-3 text-sm text-[rgba(0,0,0,0.65)] hover:bg-slate-50"
              >
                <Plus className="size-4" />
                添加员工
              </button>
            )}
          </div>
        </div>
      ) : null}
    </Card>
  );
}
