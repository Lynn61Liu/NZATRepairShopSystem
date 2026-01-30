import type { JobDetailData, JobDetailTabKey, WofCheckItem, WofFailReason, WofRecord } from "@/types";
import { Card } from "@/components/ui";
import { JobHeader } from "@/components/jobDetail/JobHeader";
import { SummaryCard } from "@/components/jobDetail/SummaryCard";
import { JobTabs } from "@/components/jobDetail/JobTabs";
import { WofPanel } from "@/components/jobDetail/WofPanel";
import { RepairPanel } from "@/components/jobDetail/RepairPanel";
import { PaintPanel } from "@/components/jobDetail/PaintPanel";
import { LogPanel } from "@/components/jobDetail/LogPanel";
import { InvoicePanel } from "@/components/jobDetail/InvoicePanel";

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
  onSaveWofResult?: (payload: {
    result: "Pass" | "Fail";
    expiryDate?: string;
    failReasonId?: string;
    note?: string;
  }) => Promise<{ success: boolean; message?: string }>;
  onDeleteWofServer?: () => Promise<{ success: boolean; message?: string }>;
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
  onSaveWofResult,
  onDeleteWofServer,
}: MainColumnProps) {
  return (
    <div className="flex-1 space-y-4">
      <Card className="p-4">
        <JobHeader
          jobId={jobData.id}
          status={jobData.status}
          isUrgent={jobData.isUrgent}
          tags={jobData.tags}
        />
      </Card>
      <SummaryCard vehicle={jobData.vehicle} customer={jobData.customer} />

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
            onSaveResult={onSaveWofResult}
            onDeleteWofServer={onDeleteWofServer}
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
