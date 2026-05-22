import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";
import type { MechService, PartsService, PartsServiceStatus } from "@/types";
import { Input, SectionCard, Textarea } from "@/components/ui";
import { PartsServiceCard } from "./PartsServiceCard";
import { PartsStatusSelect } from "./PartsStatusSelect";
import { PartsToolbar } from "./PartsToolbar";
import { MechServiceCard } from "@/features/mech";

type PartsPanelProps = {
  title?: string;
  showMech?: boolean;
  showParts?: boolean;
  openCreateTrigger?: number;
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
  title = "Machine repair service",
  showMech = true,
  showParts = true,
  openCreateTrigger,
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

  useEffect(() => {
    if (showParts && openCreateTrigger) {
      setCreating(true);
    }
  }, [showParts, openCreateTrigger]);

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
        title={title}
        // subtitle="Manage accessory status and remarks"
        actions={
          onCreateService || onCreateMechService ? (
            <PartsToolbar
              isLoading={isLoading}
              creating={creating}
              onAdd={onCreateService ? () => setCreating((prev) => !prev) : undefined}
              mechCreating={creatingMech}
              onAddMech={onCreateMechService ? () => setCreatingMech((prev) => !prev) : undefined}
            />
          ) : null
        }
      >
        <div className="mt-4 space-y-4">
          {showMech && creatingMech ? (
            <div className="border border-gray-200 rounded-lg bg-purple-50 p-3 space-y-3 mt-4">
              <div className="text-xs font-semibold text-gray-600">Machine repair project</div> <Textarea rows={2} value={mechDescription} onChange={(event) => setMechDescription(event.target.value)} placeholder="Enter mechanical service description..."
              />
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  placeholder="cost"
                  value={mechCost}
                  onChange={(event) => setMechCost(event.target.value)}
                  className="h-8 w-28"
                />
                <button
                  onClick={handleCreateMech}
                  className="px-3 py-1.5 text-xs bg-green-600 text-white rounded hover:bg-green-700 flex items-center gap-1"disabled={mechSaving} > save </button> <button onClick={() => setCreatingMech(false)} className="px-3 py-1.5 text-xs bg-white border border-gray-300 text-gray-700 rounded hover:bg-gray-50 flex items-center gap-1"> Cancel </button> </div> </div> ) : null} {showParts && creating ? ( <div className="border border-gray-200 rounded-lg bg-blue-50 p-3 space-y-3 mt-4">
              <div className="flex items-center gap-3 w-max">
                <span className=" font-medium  uppercase w-12">Status</span> <PartsStatusSelect value={status} onChange={setStatus} /> </div> <Textarea rows={3} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Enter part description..."
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCreate}
                  className="px-3 py-1.5 text-xs bg-green-600 text-white rounded hover:bg-green-700 flex items-center gap-1"
                  disabled={saving}
                >
                  <Check className="w-4 h-4"/> save </button> <button onClick={() => setCreating(false)} className="px-3 py-1.5 text-xs bg-white border border-gray-300 text-gray-700 rounded hover:bg-gray-50 flex items-center gap-1"
                >
                  <X className="w-4 h-4"/> Cancel </button> </div> </div> ) : null} {isLoading? <div className="text-sm text-gray-500">Loading...</div> : null} <div className="space-y-3">
            {showMech
              ? mechServices.map((service) => (
                  <MechServiceCard
                    key={`mech-${service.id}`}
                    service={service}
                    onUpdate={onUpdateMechService}
                    onDelete={onDeleteMechService}
                  />
                ))
              : null}
            {showParts
              ? services.map((service) => (
                  <PartsServiceCard
                    key={service.id}
                    service={service}
                    onUpdateService={onUpdateService}
                    onDeleteService={onDeleteService}
                    onCreateNote={onCreateNote}
                    onUpdateNote={onUpdateNote}
                    onDeleteNote={onDeleteNote}
                  />
                ))
              : null}
            {((showParts ? services.length : 0) === 0 &&
              (showMech ? mechServices.length : 0) === 0 &&
              !isLoading) ? (
              <div className="text-sm text-gray-500">
                {showParts && !showMech ? "No spare parts service record yet" : "No machine repair service record yet"}
              </div>
            ) : null}
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
