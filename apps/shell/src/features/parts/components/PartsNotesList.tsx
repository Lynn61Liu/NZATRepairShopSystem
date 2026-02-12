import { useState } from "react";
import { Check, MessageSquarePlus, X } from "lucide-react";
import type { PartsNote } from "@/types";
import { Textarea } from "@/components/ui";
import { PartsNoteItem } from "./PartsNoteItem";

type PartsNotesListProps = {
  notes: PartsNote[];
  onCreateNote?: (note: string) => Promise<{ success: boolean; message?: string }>;
  onUpdateNote?: (noteId: string, note: string) => Promise<{ success: boolean; message?: string }>;
  onDeleteNote?: (noteId: string) => Promise<{ success: boolean; message?: string }>;
};

export function PartsNotesList({ notes, onCreateNote, onUpdateNote, onDeleteNote }: PartsNotesListProps) {
  const [adding, setAdding] = useState(false);
  const [noteText, setNoteText] = useState("");
  const [saving, setSaving] = useState(false);

  const handleAdd = async () => {
    if (!onCreateNote || !noteText.trim()) return;
    setSaving(true);
    const res = await onCreateNote(noteText.trim());
    setSaving(false);
    if (res.success) {
      setNoteText("");
      setAdding(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2 ">
        <span className="text-xs font-medium text-gray-500 uppercase">备注</span>
        {onCreateNote ? (
          <button
            onClick={() => setAdding((prev) => !prev)}
            className="px-2 py-1 text-xs text-indigo-600 hover:bg-indigo-50 rounded flex items-center gap-1 transition-colors"
          >
            <MessageSquarePlus className="w-3.5 h-3.5" />
            {adding ? "取消" : "新增备注"}
          </button>
        ) : null}
      </div>

      {adding ? (
        <div className="bg-gray-50 rounded-lg p-2.5 mb-2">
          <div className="flex items-start gap-2">
            <Textarea
              rows={2}
              value={noteText}
              onChange={(event) => setNoteText(event.target.value)}
              placeholder="输入备注..."
              className="flex-1"
            />
            <div className="flex flex-col gap-1">
              <button
                onClick={handleAdd}
                className="p-1.5 text-green-600 hover:bg-green-100 rounded transition-colors"
                title="保存"
                disabled={saving}
              >
                <Check className="w-4 h-4" />
              </button>
              <button
                onClick={() => setAdding(false)}
                className="p-1.5 text-gray-600 hover:bg-gray-200 rounded transition-colors"
                title="取消"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="space-y-2">
        {notes.map((note) => (
          <PartsNoteItem key={note.id} note={note} onUpdate={onUpdateNote} onDelete={onDeleteNote} />
        ))}
        {notes.length === 0 && !adding ? (
          <p className="text-xs text-gray-400 italic">暂无备注</p>
        ) : null}
      </div>
    </div>
  );
}
