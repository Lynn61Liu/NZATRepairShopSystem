import type {
  JobDetailData,
  JobDetailTabKey,
  PaintService,
  PartsService,
  PartsServiceStatus,
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
  onCreatePaintService?: (status?: string, panels?: number) => Promise<{ success: boolean; message?: string }>;
  onUpdatePaintStage?: (stageIndex: number) => Promise<{ success: boolean; message?: string }>;
  onUpdatePaintPanels?: (panels: number) => Promise<{ success: boolean; message?: string }>;
  onDeletePaintService?: () => Promise<{ success: boolean; message?: string }>;
  onRefreshPaintService?: () => Promise<void>;
  onRefreshVehicle?: () => Promise<{ success: boolean; message?: string }>;
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
  onCreatePaintService,
  onUpdatePaintStage,
  onUpdatePaintPanels,
  onDeletePaintService,
  onRefreshPaintService,
  onRefreshVehicle,
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
          onCreatePaintService={onCreatePaintService}
          onUpdatePaintStage={onUpdatePaintStage}
          onUpdatePaintPanels={onUpdatePaintPanels}
          onDeletePaintService={onDeletePaintService}
          onRefreshPaintService={onRefreshPaintService}
          onRefreshVehicle={onRefreshVehicle}
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
