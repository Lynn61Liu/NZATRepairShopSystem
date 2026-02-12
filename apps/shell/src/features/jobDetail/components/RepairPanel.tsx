import type { PartsService, PartsServiceStatus } from "@/types";
import { PartsPanel } from "@/features/parts";

type RepairPanelProps = {
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

export function RepairPanel({
  services,
  isLoading,
  onCreateService,
  onUpdateService,
  onDeleteService,
  onCreateNote,
  onUpdateNote,
  onDeleteNote,
}: RepairPanelProps) {
  return (
    <PartsPanel
      services={services}
      isLoading={isLoading}
      onCreateService={onCreateService}
      onUpdateService={onUpdateService}
      onDeleteService={onDeleteService}
      onCreateNote={onCreateNote}
      onUpdateNote={onUpdateNote}
      onDeleteNote={onDeleteNote}
    />
  );
}
