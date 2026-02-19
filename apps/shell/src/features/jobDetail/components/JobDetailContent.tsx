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
import type { TagOption } from "@/components/MultiTagSelect";
import { JobDetailLayout } from "../JobDetailLayout";
import { MainColumn } from "../MainColumn";
import { RightSidebar } from "./RightSidebar";

type JobDetailContentProps = {
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
  tagOptions?: TagOption[];
  onSaveTags?: (tagIds: string[]) => Promise<{ success: boolean; message?: string; tags?: string[] }>;
  onSaveNotes?: (notes: string) => Promise<{ success: boolean; message?: string }>;
  isSidebarOpen: boolean;
  onToggleSidebar: () => void;
};

export function JobDetailContent({
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
  onCreatePaintService,
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
  isSidebarOpen,
  onToggleSidebar,
}: JobDetailContentProps) {
  return (
    <JobDetailLayout
      main={
        <MainColumn
          jobData={jobData}
          activeTab={activeTab}
          onTabChange={onTabChange}
          hasWofRecord={hasWofRecord}
          wofRecords={wofRecords}
          wofCheckItems={wofCheckItems}
          failReasons={failReasons}
          wofLoading={wofLoading}
          partsServices={partsServices}
          partsLoading={partsLoading}
          mechServices={mechServices}
          mechLoading={mechLoading}
          paintService={paintService}
          paintLoading={paintLoading}
          onAddWof={onAddWof}
          onRefreshWof={onRefreshWof}
          onDeleteWofServer={onDeleteWofServer}
          onUpdateWofRecord={onUpdateWofRecord}
          onCreateWofRecord={onCreateWofRecord}
          onCreatePartsService={onCreatePartsService}
          onUpdatePartsService={onUpdatePartsService}
          onDeletePartsService={onDeletePartsService}
          onCreatePartsNote={onCreatePartsNote}
          onUpdatePartsNote={onUpdatePartsNote}
          onDeletePartsNote={onDeletePartsNote}
          onCreateMechService={onCreateMechService}
          onUpdateMechService={onUpdateMechService}
          onDeleteMechService={onDeleteMechService}
          onCreatePaintService={onCreatePaintService}
          onUpdatePaintStage={onUpdatePaintStage}
          onUpdatePaintPanels={onUpdatePaintPanels}
          onDeletePaintService={onDeletePaintService}
          onRefreshPaintService={onRefreshPaintService}
          onRefreshVehicle={onRefreshVehicle}
          onSaveVehicle={onSaveVehicle}
          onDeleteJob={onDeleteJob}
          isDeletingJob={isDeletingJob}
          tagOptions={tagOptions}
          onSaveTags={onSaveTags}
          onSaveNotes={onSaveNotes}
        />
      }
      sidebar={
        <RightSidebar
          vehicle={jobData.vehicle}
          customer={jobData.customer}
          isOpen={isSidebarOpen}
          onToggle={onToggleSidebar}
        />
      }
    />
  );
}
