import { useState } from "react";
import { Check, Edit2, Trash2, X } from "lucide-react";
import type { PartsService, PartsServiceStatus } from "@/types";
import { Textarea } from "@/components/ui";
import { PartsStatusSelect } from "./PartsStatusSelect";
import { PartsNotesList } from "./PartsNotesList";

type PartsServiceCardProps = {
  service: PartsService;
  onUpdateService?: (
    id: string,
    payload: { description?: string; status?: PartsServiceStatus }
  ) => Promise<{ success: boolean; message?: string }>;
  onDeleteService?: (id: string) => Promise<{ success: boolean; message?: string }>;
  onCreateNote?: (serviceId: string, note: string) => Promise<{ success: boolean; message?: string }>;
  onUpdateNote?: (noteId: string, note: string) => Promise<{ success: boolean; message?: string }>;
  onDeleteNote?: (noteId: string) => Promise<{ success: boolean; message?: string }>;
};

export function PartsServiceCard({
  service,
  onUpdateService,
  onDeleteService,
  onCreateNote,
  onUpdateNote,
  onDeleteNote,
}: PartsServiceCardProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(service.description);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!onUpdateService) return;
    setSaving(true);
    const res = await onUpdateService(service.id, { description: draft });
    setSaving(false);
    if (res.success) {
      setEditing(false);
    }
  };

  const handleCancel = () => {
    setDraft(service.description);
    setEditing(false);
  };

  const handleStatusChange = async (status: PartsServiceStatus) => {
    if (!onUpdateService) return;
    await onUpdateService(service.id, { status });
  };

  const handleDelete = async () => {
    if (!onDeleteService) return;
    if (!window.confirm("确定删除这条配件服务？")) return;
    await onDeleteService(service.id);
  };

  return (
    <div className="border border-gray-200 rounded-lg bg-gray-200">
      <div className="p-3 flex items-start justify-between gap-4">
        <div className="flex-1 space-y-2  ">
          <div className="flex items-start gap-3 flex-col  ">
             <div className="flex items-center gap-3 w-max">
          {/* <span className=" font-medium  uppercase w-12">状态</span> */}
          <PartsStatusSelect value={service.status} onChange={handleStatusChange} />
        </div>
            {/* <span className="text-xs font-medium text-gray-500 uppercase">配件描述</span> */}
          
          {editing ? (
            <div className="flex items-start gap-2 w-full ">
              <Textarea
                rows={3}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                className="flex-2 font-bold font-lg w-full"
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
            // font-size: 24px; font-weight: 500;
            <p className="text-xl font-bold text-black whitespace-pre-line break-words w-full">
              {service.description || <span className="text-gray-400 italic">暂无描述</span>}
            </p>
          )}
           </div>
        </div>

        <div className="flex items-center gap-2">
          {!editing && onUpdateService ? (
            <button
              onClick={() => setEditing(true)}
              className="p-1 text-blue-600 hover:bg-blue-50 rounded transition-colors"
              title="编辑"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>
          ) : null}
          {onDeleteService ? (
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

      <div className="border-t border-gray-200 bg-white p-3 space-y-3">
       
        <PartsNotesList
          notes={service.notes || []}
          onCreateNote={onCreateNote ? (note) => onCreateNote(service.id, note) : undefined}
          onUpdateNote={onUpdateNote}
          onDeleteNote={onDeleteNote}
        />
      </div>
    </div>
  );
}
