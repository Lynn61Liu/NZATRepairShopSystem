import type { MechService, PartsService, PartsServiceStatus } from "@/types";
import { PartsPanel } from "@/features/parts";

type RepairPanelProps = {
  services: PartsService[];
  mechServices?: MechService[];
  isLoading?: boolean;
  mechLoading?: boolean;
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

export function RepairPanel({
  services,
  mechServices,
  isLoading,
  mechLoading,
  onCreateService,
  onUpdateService,
  onDeleteService,
  onCreateNote,
  onUpdateNote,
  onDeleteNote,
  onCreateMechService,
  onUpdateMechService,
  onDeleteMechService,
}: RepairPanelProps) {
  return (
    <PartsPanel
      services={services}
      mechServices={mechServices}
      isLoading={isLoading}
      onCreateService={onCreateService}
      onUpdateService={onUpdateService}
      onDeleteService={onDeleteService}
      onCreateNote={onCreateNote}
      onUpdateNote={onUpdateNote}
      onDeleteNote={onDeleteNote}
      onCreateMechService={onCreateMechService}
      onUpdateMechService={onUpdateMechService}
      onDeleteMechService={onDeleteMechService}
    />
  );
}
