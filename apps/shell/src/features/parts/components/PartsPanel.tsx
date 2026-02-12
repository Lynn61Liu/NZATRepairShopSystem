import { useState } from "react";
import { Check, X } from "lucide-react";
import type { PartsService, PartsServiceStatus } from "@/types";
import { SectionCard, Textarea } from "@/components/ui";
import { PartsServiceCard } from "./PartsServiceCard";
import { PartsStatusSelect } from "./PartsStatusSelect";
import { PartsToolbar } from "./PartsToolbar";

type PartsPanelProps = {
  services: PartsService[];
  isLoading?: boolean;
  onCreateService?: (payload: {
    description: string;
    status?: PartsServiceStatus;
  }) => Promise<{ success: boolean; message?: string }>;
  onUpdateService?: (
    id: string,
    payload: { description?: string; status?: PartsServiceStatus }
  ) => Promise<{ success: boolean; message?: string }>;
  onDeleteService?: (id: string) => Promise<{ success: boolean; message?: string }>;
  onCreateNote?: (serviceId: string, note: string) => Promise<{ success: boolean; message?: string }>;
  onUpdateNote?: (noteId: string, note: string) => Promise<{ success: boolean; message?: string }>;
  onDeleteNote?: (noteId: string) => Promise<{ success: boolean; message?: string }>;
};

export function PartsPanel({
  services,
  isLoading,
  onCreateService,
  onUpdateService,
  onDeleteService,
  onCreateNote,
  onUpdateNote,
  onDeleteNote,
}: PartsPanelProps) {
  const [creating, setCreating] = useState(false);
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<PartsServiceStatus>("pending_order");
  const [saving, setSaving] = useState(false);

  const handleCreate = async () => {
    if (!onCreateService || !description.trim()) return;
    setSaving(true);
    const res = await onCreateService({ description: description.trim(), status });
    setSaving(false);
    if (res.success) {
      setDescription("");
      setStatus("pending_order");
      setCreating(false);
    }
  };

  return (
    <div className="space-y-4 mt-4">
      <SectionCard
        title="机修服务"
        // subtitle="管理配件状态与备注"
        actions={
          onCreateService ? (
            <PartsToolbar
              isLoading={isLoading}
              creating={creating}
              onAdd={() => setCreating((prev) => !prev)}
            />
          ) : null
        }
      >
        <div className="mt-4 space-y-4">
          {creating ? (
            <div className="border border-gray-200 rounded-lg bg-blue-50 p-3 space-y-3 mt-4">
              <div className="flex items-center gap-3 w-max">
                <span className=" font-medium  uppercase w-12">状态</span>
                <PartsStatusSelect value={status} onChange={setStatus} />
              </div>
              <Textarea
                rows={3}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="输入配件描述..."
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCreate}
                  className="px-3 py-1.5 text-xs bg-green-600 text-white rounded hover:bg-green-700 flex items-center gap-1"
                  disabled={saving}
                >
                  <Check className="w-4 h-4" />
                  保存
                </button>
                <button
                  onClick={() => setCreating(false)}
                  className="px-3 py-1.5 text-xs bg-white border border-gray-300 text-gray-700 rounded hover:bg-gray-50 flex items-center gap-1"
                >
                  <X className="w-4 h-4" />
                  取消
                </button>
              </div>
            </div>
          ) : null}

          {isLoading ? <div className="text-sm text-gray-500">加载中...</div> : null}

          <div className="space-y-3">
            {services.map((service) => (
              <PartsServiceCard
                key={service.id}
                service={service}
                onUpdateService={onUpdateService}
                onDeleteService={onDeleteService}
                onCreateNote={onCreateNote}
                onUpdateNote={onUpdateNote}
                onDeleteNote={onDeleteNote}
              />
            ))}
            {services.length === 0 && !isLoading ? (
              <div className="text-sm text-gray-500">暂无配件服务记录</div>
            ) : null}
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
