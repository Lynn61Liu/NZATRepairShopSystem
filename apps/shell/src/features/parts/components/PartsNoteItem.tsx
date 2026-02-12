import { useState } from "react";
import { Check, Edit2, Trash2, X } from "lucide-react";
import type { PartsNote } from "@/types";
import { Textarea } from "@/components/ui";
import { formatNzDateTime } from "@/utils/date";

type PartsNoteItemProps = {
  note: PartsNote;
  onUpdate?: (noteId: string, note: string) => Promise<{ success: boolean; message?: string }>;
  onDelete?: (noteId: string) => Promise<{ success: boolean; message?: string }>;
};

export function PartsNoteItem({ note, onUpdate, onDelete }: PartsNoteItemProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note.note);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!onUpdate) return;
    setSaving(true);
    const res = await onUpdate(note.id, draft);
    setSaving(false);
    if (res.success) {
      setEditing(false);
    }
  };

  const handleCancel = () => {
    setDraft(note.note);
    setEditing(false);
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    if (!window.confirm("确定删除这条备注？")) return;
    await onDelete(note.id);
  };

  return (
    <div className="rounded-lg  bg-yellow-50 border border-yellow-200 rounded p-2  ">
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
              title="保存"
              disabled={saving}
            >
              <Check className="w-4 h-4" />
            </button>
            <button
              onClick={handleCancel}
              className="p-1.5 text-gray-600 hover:bg-gray-200 rounded transition-colors"
              title="取消"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1">
            <p className="text-sm text-gray-700">{note.note}</p>
            {note.createdAt ? (
              <p className="text-xs text-gray-400 mt-1">{formatNzDateTime(note.createdAt)}</p>
            ) : null}
          </div>
          <div className="flex items-center gap-1">
            {onUpdate ? (
              <button
                onClick={() => setEditing(true)}
                className="p-1 text-blue-600 hover:bg-blue-100 rounded transition-colors"
                title="编辑"
              >
                <Edit2 className="w-3.5 h-3.5" />
              </button>
            ) : null}
            {onDelete ? (
              <button
                onClick={handleDelete}
                className="p-1 text-red-600 hover:bg-red-100 rounded transition-colors"
                title="删除"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
