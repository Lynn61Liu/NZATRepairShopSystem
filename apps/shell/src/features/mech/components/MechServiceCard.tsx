import { useEffect, useState } from "react";
import { Check, Edit2, Trash2, X, DollarSign } from "lucide-react";
import type { MechService } from "@/types";
import { Input, Textarea } from "@/components/ui";

type MechServiceCardProps = {
  service: MechService;
  onUpdate?: (id: string, payload: { description?: string; cost?: number | null }) => Promise<{ success: boolean }>;
  onDelete?: (id: string) => Promise<{ success: boolean }>;
};

export function MechServiceCard({ service, onUpdate, onDelete }: MechServiceCardProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(service.description);
  const [costDraft, setCostDraft] = useState(service.cost?.toString() ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(service.description);
    setCostDraft(service.cost?.toString() ?? "");
  }, [service.description, service.cost]);

  const handleSave = async () => {
    if (!onUpdate) return;
    const trimmed = draft.trim();
    if (!trimmed) return;
    const parsedCost = costDraft.trim() ? Number(costDraft) : null;
    if (costDraft.trim() && Number.isNaN(parsedCost)) return;
    setSaving(true);
    await onUpdate(service.id, { description: trimmed, cost: parsedCost });
    setSaving(false);
    setEditing(false);
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    if (!window.confirm("确定删除机修项目？")) return;
    await onDelete(service.id);
  };

  return (
    <div className="border border-gray-200 rounded-lg bg-gray-100">
      <div className="p-3 flex items-start justify-between gap-4">
        <div className="flex-1 space-y-3">
          {editing ? (
            <div className="flex items-start gap-2">
              <Textarea
                rows={2}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                className="flex-1"
              />
              <div className="flex flex-col gap-1">
                <button
                  onClick={handleSave}
                  className="p-1.5 text-green-600 hover:bg-green-100 rounded transition-colors"
                  disabled={saving}
                  title="保存"
                >
                  <Check className="w-4 h-4" />
                </button>
                <button
                  onClick={() => {
                    setDraft(service.description);
                    setEditing(false);
                  }}
                  className="p-1.5 text-gray-600 hover:bg-gray-200 rounded transition-colors"
                  title="取消"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          ) : (
            <div className="text-base font-semibold text-gray-900 whitespace-pre-line break-words">
              {service.description || <span className="text-gray-400 italic">暂无描述</span>}
            </div>
          )}

          <div className="flex items-center gap-2 text-sm text-gray-600">
            <span className="inline-flex items-center gap-1  font-semibold text-gray-500">
              <DollarSign className="h-3.5 w-3.5 text-gray-500" />
              费用
            </span>
            {editing ? (
              <Input
                type="number"
                value={costDraft}
                onChange={(event) => setCostDraft(event.target.value)}
                className="h-8 w-28"
              />
            ) : (
              <span className="text-xs font-semibold text-gray-700">{service.cost ?? "—"}</span>
            )} 
            <span className="inline-flex items-center gap-1  font-semibold text-gray-500">NZD</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!editing && onUpdate ? (
            <button
              onClick={() => setEditing(true)}
              className="p-1 text-blue-600 hover:bg-blue-50 rounded transition-colors"
              title="编辑"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>
          ) : null}
          {onDelete ? (
            <button
              onClick={handleDelete}
              className="p-1 text-red-600 hover:bg-red-50 rounded transition-colors"
              title="删除"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
