import { useState } from "react";
import { Check, X } from "lucide-react";
import type { MechService, PartsService, PartsServiceStatus } from "@/types";
import { Input, SectionCard, Textarea } from "@/components/ui";
import { PartsServiceCard } from "./PartsServiceCard";
import { PartsStatusSelect } from "./PartsStatusSelect";
import { PartsToolbar } from "./PartsToolbar";
import { MechServiceCard } from "@/features/mech";

type PartsPanelProps = {
  services: PartsService[];
  mechServices?: MechService[];
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
  onCreateMechService?: (payload: { description: string; cost?: number | null }) => Promise<{ success: boolean }>;
  onUpdateMechService?: (
    id: string,
    payload: { description?: string; cost?: number | null }
  ) => Promise<{ success: boolean }>;
  onDeleteMechService?: (id: string) => Promise<{ success: boolean }>;
};

export function PartsPanel({
  services,
  mechServices = [],
  isLoading,
  onCreateService,
  onUpdateService,
  onDeleteService,
  onCreateNote,
  onUpdateNote,
  onDeleteNote,
  onCreateMechService,
  onUpdateMechService,
  onDeleteMechService,
}: PartsPanelProps) {
  const [creating, setCreating] = useState(false);
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<PartsServiceStatus>("pending_order");
  const [saving, setSaving] = useState(false);
  const [creatingMech, setCreatingMech] = useState(false);
  const [mechDescription, setMechDescription] = useState("");
  const [mechCost, setMechCost] = useState("");
  const [mechSaving, setMechSaving] = useState(false);

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

  const handleCreateMech = async () => {
    if (!onCreateMechService || !mechDescription.trim()) return;
    const parsedCost = mechCost.trim() ? Number(mechCost) : null;
    if (mechCost.trim() && Number.isNaN(parsedCost)) return;
    setMechSaving(true);
    const res = await onCreateMechService({ description: mechDescription.trim(), cost: parsedCost });
    setMechSaving(false);
    if (res.success) {
      setMechDescription("");
      setMechCost("");
      setCreatingMech(false);
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
              mechCreating={creatingMech}
              onAddMech={onCreateMechService ? () => setCreatingMech((prev) => !prev) : undefined}
            />
          ) : null
        }
      >
        <div className="mt-4 space-y-4">
          {creatingMech ? (
            <div className="border border-gray-200 rounded-lg bg-purple-50 p-3 space-y-3 mt-4">
              <div className="text-xs font-semibold text-gray-600">机修项目</div>
              <Textarea
                rows={2}
                value={mechDescription}
                onChange={(event) => setMechDescription(event.target.value)}
                placeholder="输入机修项目描述..."
              />
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  placeholder="费用"
                  value={mechCost}
                  onChange={(event) => setMechCost(event.target.value)}
                  className="h-8 w-28"
                />
                <button
                  onClick={handleCreateMech}
                  className="px-3 py-1.5 text-xs bg-green-600 text-white rounded hover:bg-green-700 flex items-center gap-1"
                  disabled={mechSaving}
                >
                  保存
                </button>
                <button
                  onClick={() => setCreatingMech(false)}
                  className="px-3 py-1.5 text-xs bg-white border border-gray-300 text-gray-700 rounded hover:bg-gray-50 flex items-center gap-1"
                >
                  取消
                </button>
              </div>
            </div>
          ) : null}

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
            {mechServices.map((service) => (
              <MechServiceCard
                key={`mech-${service.id}`}
                service={service}
                onUpdate={onUpdateMechService}
                onDelete={onDeleteMechService}
              />
            ))}
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
            {services.length === 0 && mechServices.length === 0 && !isLoading ? (
              <div className="text-sm text-gray-500">暂无配件服务记录</div>
            ) : null}
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
