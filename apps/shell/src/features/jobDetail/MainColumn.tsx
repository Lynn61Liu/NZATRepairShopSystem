import type {
  JobDetailData,
  JobDetailTabKey,
  PaintService,
  PartsService,
  PartsServiceStatus,
  MechService,
  WofCheckItem,
  WofFailReason,
  WofRecord,
  WofRecordUpdatePayload,
} from "@/types";
import { Card } from "@/components/ui";
import { JobHeader } from "@/features/jobDetail/components/JobHeader";
import { SummaryCard } from "@/features/jobDetail/components/SummaryCard";
import { JobTabs } from "@/features/jobDetail/components/JobTabs";
import { WofPanel } from "@/features/wof";
import { RepairPanel } from "@/features/jobDetail/components/RepairPanel";
import { PaintPanel } from "@/features/paint";
import { LogPanel } from "@/features/jobDetail/components/LogPanel";
import { InvoicePanel } from "@/features/jobDetail/components/InvoicePanel";

type MainColumnProps = {
  jobData: JobDetailData;
  activeTab: JobDetailTabKey;
  onTabChange: (key: JobDetailTabKey) => void;
  hasWofRecord: boolean;
  wofRecords: WofRecord[];
  wofCheckItems: WofCheckItem[];
  failReasons: WofFailReason[];
  wofLoading?: boolean;
  partsServices: PartsService[];
  partsLoading?: boolean;
  mechServices?: MechService[];
  mechLoading?: boolean;
  paintService?: PaintService | null;
  paintLoading?: boolean;
  onAddWof: () => void;
  onRefreshWof?: () => Promise<{ success: boolean; message?: string }>;
  onDeleteWofServer?: () => Promise<{ success: boolean; message?: string }>;
  onUpdateWofRecord?: (
    id: string,
    payload: WofRecordUpdatePayload
  ) => Promise<{ success: boolean; message?: string }>;
  onCreateWofRecord?: (
    payload: WofRecordUpdatePayload
  ) => Promise<{ success: boolean; message?: string }>;
  onCreatePartsService?: (payload: {
    description: string;
    status?: PartsServiceStatus;
  }) => Promise<{ success: boolean; message?: string }>;
  onUpdatePartsService?: (
    id: string,
    payload: { description?: string; status?: PartsServiceStatus }
  ) => Promise<{ success: boolean; message?: string }>;
  onDeletePartsService?: (id: string) => Promise<{ success: boolean; message?: string }>;
  onCreatePartsNote?: (
    serviceId: string,
    note: string
  ) => Promise<{ success: boolean; message?: string }>;
  onUpdatePartsNote?: (
    noteId: string,
    note: string
  ) => Promise<{ success: boolean; message?: string }>;
  onDeletePartsNote?: (noteId: string) => Promise<{ success: boolean; message?: string }>;
  onCreateMechService?: (payload: { description: string; cost?: number | null }) => Promise<{ success: boolean }>;
  onUpdateMechService?: (
    id: string,
    payload: { description?: string; cost?: number | null }
  ) => Promise<{ success: boolean }>;
  onDeleteMechService?: (id: string) => Promise<{ success: boolean }>;
  onCreatePaintService?: (status?: string, panels?: number) => Promise<{ success: boolean; message?: string }>;
  onUpdatePaintStage?: (stageIndex: number) => Promise<{ success: boolean; message?: string }>;
  onUpdatePaintPanels?: (panels: number) => Promise<{ success: boolean; message?: string }>;
  onDeletePaintService?: () => Promise<{ success: boolean; message?: string }>;
  onRefreshPaintService?: () => Promise<void>;
  onRefreshVehicle?: () => Promise<{ success: boolean; message?: string }>;
  onSaveVehicle?: (payload: {
    year?: number | null;
    make?: string | null;
    fuelType?: string | null;
    vin?: string | null;
    nzFirstRegistration?: string | null;
  }) => Promise<{ success: boolean; message?: string }>;
  onDeleteJob?: () => void;
  isDeletingJob?: boolean;
  tagOptions?: { id: string; label: string }[];
  onSaveTags?: (tagIds: string[]) => Promise<{ success: boolean; message?: string; tags?: string[] }>;
  onSaveNotes?: (notes: string) => Promise<{ success: boolean; message?: string }>;
  // onCreatePaintService?: (status?: string) => Promise<{ success: boolean; message?: string }>;
};

export function MainColumn({
  jobData,
  activeTab,
  onTabChange,
  hasWofRecord,
  wofRecords,
  wofCheckItems,
  failReasons,
  wofLoading,
  partsServices,
  partsLoading,
  mechServices,
  mechLoading,
  paintService,
  paintLoading,
  onAddWof,
  onRefreshWof,
  onDeleteWofServer,
  onUpdateWofRecord,
  onCreateWofRecord,
  onCreatePartsService,
  onUpdatePartsService,
  onDeletePartsService,
  onCreatePartsNote,
  onUpdatePartsNote,
  onDeletePartsNote,
  onCreateMechService,
  onUpdateMechService,
  onDeleteMechService,
  onUpdatePaintStage,
  onUpdatePaintPanels,
  onDeletePaintService,
  onRefreshPaintService,
  onRefreshVehicle,
  onSaveVehicle,
  onDeleteJob,
  isDeletingJob,
  tagOptions,
  onSaveTags,
  onSaveNotes,
  onCreatePaintService,
}: MainColumnProps) {
  const vehicleMakeModel = [jobData.vehicle.year, jobData.vehicle.make, jobData.vehicle.model]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="flex-1 space-y-4">
      <Card className="p-4">
        <JobHeader
          jobId={jobData.id}
          status={jobData.status}
          isUrgent={jobData.isUrgent}
          tags={jobData.tags}
          notes={jobData.notes ?? ""}
          createdAt={jobData.createdAt}
          vehiclePlate={jobData.vehicle.plate}
          vehicleModel={vehicleMakeModel}
          customerName={jobData.customer.name}
          customerCode={jobData.customer.businessCode}
          customerPhone={jobData.customer.phone}
          hasPaintService={Boolean(paintService?.id)}
          onDelete={onDeleteJob}
          isDeleting={isDeletingJob}
          tagOptions={tagOptions}
          onSaveTags={onSaveTags}
          onSaveNotes={onSaveNotes}
          onCreatePaintService={onCreatePaintService}
        />
      </Card>
      <SummaryCard
        vehicle={jobData.vehicle}
        customer={jobData.customer}
        onRefreshVehicle={onRefreshVehicle}
        onSaveVehicle={onSaveVehicle}
      />

      <Card className="p-4">
        <JobTabs activeTab={activeTab} onChange={onTabChange} />

        {activeTab === "WOF" ? (
          <WofPanel
            hasRecord={hasWofRecord}
            onAdd={onAddWof}
            records={wofRecords}
            checkItems={wofCheckItems}
            failReasons={failReasons}
            isLoading={wofLoading}
            onRefresh={onRefreshWof}
            onDeleteWofServer={onDeleteWofServer}
            onUpdateRecord={onUpdateWofRecord}
            onCreateRecord={onCreateWofRecord}
            vehiclePlate={jobData.vehicle.plate}
            vehicleMakeModel={vehicleMakeModel}
          />
        ) : null}
        {activeTab === "Mechanical" ? (
          <RepairPanel
            services={partsServices}
            mechServices={mechServices}
            isLoading={partsLoading || mechLoading}
            onCreateService={onCreatePartsService}
            onUpdateService={onUpdatePartsService}
            onDeleteService={onDeletePartsService}
            onCreateNote={onCreatePartsNote}
            onUpdateNote={onUpdatePartsNote}
            onDeleteNote={onDeletePartsNote}
            onCreateMechService={onCreateMechService}
            onUpdateMechService={onUpdateMechService}
            onDeleteMechService={onDeleteMechService}
          />
        ) : null}
        {activeTab === "Paint" ? (
          <PaintPanel
            service={paintService}
            isLoading={paintLoading}
            onCreateService={onCreatePaintService}
            onUpdateStage={onUpdatePaintStage}
            onUpdatePanels={onUpdatePaintPanels}
            onDeleteService={onDeletePaintService}
            onRefresh={onRefreshPaintService}
          />
        ) : null}
        {activeTab === "Log" ? <LogPanel /> : null}
        {activeTab === "Invoice" ? <InvoicePanel /> : null}
      </Card>
    </div>
  );
}
