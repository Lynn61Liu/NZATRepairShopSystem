import type { JobDetailData, JobDetailTabKey, WofCheckItem, WofFailReason, WofRecord, WofRecordUpdatePayload } from "@/types";
import { Card } from "@/components/ui";
import { JobHeader } from "@/features/jobDetail/components/JobHeader";
import { SummaryCard } from "@/features/jobDetail/components/SummaryCard";
import { JobTabs } from "@/features/jobDetail/components/JobTabs";
import { WofPanel } from "@/features/wof";
import { RepairPanel } from "@/features/jobDetail/components/RepairPanel";
import { PaintPanel } from "@/features/jobDetail/components/PaintPanel";
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
  tagOptions?: { id: string; label: string }[];
  onSaveTags?: (tagIds: string[]) => Promise<{ success: boolean; message?: string; tags?: string[] }>;
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
          onDelete={onDeleteJob}
          isDeleting={isDeletingJob}
          tagOptions={tagOptions}
          onSaveTags={onSaveTags}
        />
      </Card>
      <SummaryCard vehicle={jobData.vehicle} customer={jobData.customer} onRefreshVehicle={onRefreshVehicle} />

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
            onSaveResult={onSaveWofResult}
            onDeleteWofServer={onDeleteWofServer}
            onUpdateRecord={onUpdateWofRecord}
            onCreateRecord={onCreateWofRecord}
            vehiclePlate={jobData.vehicle.plate}
            vehicleMakeModel={vehicleMakeModel}
          />
        ) : null}
        {activeTab === "Mechanical" ? <RepairPanel /> : null}
        {activeTab === "Paint" ? <PaintPanel /> : null}
        {activeTab === "Log" ? <LogPanel /> : null}
        {activeTab === "Invoice" ? <InvoicePanel /> : null}
      </Card>
    </div>
  );
}
