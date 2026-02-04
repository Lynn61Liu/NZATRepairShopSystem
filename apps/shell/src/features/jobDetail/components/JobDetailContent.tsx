import type { JobDetailData, JobDetailTabKey, WofCheckItem, WofFailReason, WofRecord, WofRecordUpdatePayload } from "@/types";
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
  onAddWof: () => void;
  onRefreshWof?: () => Promise<{ success: boolean; message?: string }>;
  onSaveWofResult?: (payload: {
    result: "Pass" | "Fail";
    expiryDate?: string;
    failReasonId?: string;
    note?: string;
  }) => Promise<{ success: boolean; message?: string }>;
  onDeleteWofServer?: () => Promise<{ success: boolean; message?: string }>;
  onUpdateWofRecord?: (
    id: string,
    payload: WofRecordUpdatePayload
  ) => Promise<{ success: boolean; message?: string }>;
  onCreateWofRecord?: (
    payload: WofRecordUpdatePayload
  ) => Promise<{ success: boolean; message?: string }>;
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
  onAddWof,
  onRefreshWof,
  onSaveWofResult,
  onDeleteWofServer,
  onUpdateWofRecord,
  onCreateWofRecord,
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
          onAddWof={onAddWof}
          onRefreshWof={onRefreshWof}
          onSaveWofResult={onSaveWofResult}
          onDeleteWofServer={onDeleteWofServer}
          onUpdateWofRecord={onUpdateWofRecord}
          onCreateWofRecord={onCreateWofRecord}
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
