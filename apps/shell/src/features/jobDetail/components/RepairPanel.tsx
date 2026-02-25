import type { MechService, PartsService, PartsServiceStatus } from "@/types";
import { PartsPanel } from "@/features/parts";

type RepairPanelProps = {
  mode?: "mech" | "parts";
  openPartsCreateTrigger?: number;
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

export function RepairPanel({
  mode = "mech",
  openPartsCreateTrigger,
  services,
  mechServices,
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
}: RepairPanelProps) {
  return (
    <PartsPanel
      title={mode === "parts" ? "配件服务" : "机修服务"}
      showMech={mode === "mech"}
      showParts={mode === "parts"}
      openCreateTrigger={mode === "parts" ? openPartsCreateTrigger : undefined}
      services={services}
      mechServices={mechServices}
      isLoading={isLoading}
      onCreateService={mode === "parts" ? onCreateService : undefined}
      onUpdateService={mode === "parts" ? onUpdateService : undefined}
      onDeleteService={mode === "parts" ? onDeleteService : undefined}
      onCreateNote={mode === "parts" ? onCreateNote : undefined}
      onUpdateNote={mode === "parts" ? onUpdateNote : undefined}
      onDeleteNote={mode === "parts" ? onDeleteNote : undefined}
      onCreateMechService={mode === "mech" ? onCreateMechService : undefined}
      onUpdateMechService={mode === "mech" ? onUpdateMechService : undefined}
      onDeleteMechService={mode === "mech" ? onDeleteMechService : undefined}
    />
  );
}
