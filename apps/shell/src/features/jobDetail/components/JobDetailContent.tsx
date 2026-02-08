import type {
  JobDetailData,
  JobDetailTabKey,
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
  onRefreshVehicle?: () => Promise<{ success: boolean; message?: string }>;
  onDeleteJob?: () => void;
  isDeletingJob?: boolean;
  tagOptions?: TagOption[];
  onSaveTags?: (tagIds: string[]) => Promise<{ success: boolean; message?: string; tags?: string[] }>;
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
  onRefreshVehicle,
  onDeleteJob,
  isDeletingJob,
  tagOptions,
  onSaveTags,
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
          onRefreshVehicle={onRefreshVehicle}
          onDeleteJob={onDeleteJob}
          isDeletingJob={isDeletingJob}
          tagOptions={tagOptions}
          onSaveTags={onSaveTags}
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
