import { useState } from "react";
import { Button, SectionCard } from "@/components/ui";
import { JOB_DETAIL_TEXT } from "@/features/jobDetail/jobDetail.constants";
import type { WofCheckItem, WofFailReason, WofRecord, WofRecordUpdatePayload } from "@/types";
import { WofResultsList } from "./WofResultsList";
import { WofToolbar } from "./WofToolbar";

export type WofPanelProps = {
  hasRecord: boolean;
  hasService?: boolean;
  onAdd: () => void;
  records: WofRecord[];
  checkItems?: WofCheckItem[];
  failReasons?: WofFailReason[];
  isLoading?: boolean;
  onRefresh?: () => Promise<{ success: boolean; message?: string }>;
  onDeleteWofServer?: () => Promise<{ success: boolean; message?: string }>;
  onUpdateRecord?: (
    id: string,
    payload: WofRecordUpdatePayload
  ) => Promise<{ success: boolean; message?: string }>;
  onCreateRecord?: (
    payload: WofRecordUpdatePayload
  ) => Promise<{ success: boolean; message?: string }>;
  jobId?: string;
  vehiclePlate?: string;
  vehicleMakeModel?: string;
  vehicleOdometer?: number | null;
  nzFirstRegistration?: string;
  vin?: string | null;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  customerAddress?: string;
};

export function WofPanel(props: WofPanelProps) {
  const {
    hasRecord,
    hasService = false,
    onAdd,
    checkItems = [],
    failReasons = [],
    isLoading,
    onRefresh,
    onDeleteWofServer,
    onUpdateRecord,
    onCreateRecord,
    jobId,
    vehiclePlate,
    vehicleMakeModel,
    vehicleOdometer,
    nzFirstRegistration,
    vin,
    customerName,
    customerPhone,
    customerEmail,
    customerAddress,
  } = props;
  const [showCreate, setShowCreate] = useState(false);
  const hasAnyRenderedWofData = hasRecord || checkItems.length > 0 || props.records.length > 0;

  if (!hasService && !hasAnyRenderedWofData) {
    return (
      <div className="space-y-5 py-4">
        <div className="flex justify-start">
          <Button variant="primary" onClick={onAdd}>
            New WOF Service
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5 py-4">
      <SectionCard
        title={JOB_DETAIL_TEXT.labels.wofRecords}
        actions={
          <WofToolbar
            isLoading={isLoading}
            onRefresh={onRefresh}
            onDelete={onDeleteWofServer}
            onAdd={() => setShowCreate(true)}
          />
        }
      >
        <WofResultsList
          isLoading={isLoading}
          checkItems={checkItems}
          printContext={{
            jobId,
            vehicleMakeModel,
            vehicleOdometer,
            nzFirstRegistration,
            vin,
            customerName,
            customerPhone,
            customerEmail,
            customerAddress,
          }}
          onUpdate={onUpdateRecord}
          onCreate={onCreateRecord}
          onCancelCreate={() => setShowCreate(false)}
          showCreate={showCreate}
          defaultRego={vehiclePlate}
          defaultMakeModel={vehicleMakeModel}
          failReasons={failReasons}
        />
      </SectionCard>

      {/* <SectionCard title={JOB_DETAIL_TEXT.labels.result}>
        <WofResultForm failReasons={failReasons} onSave={onSaveResult} />
      </SectionCard> */}
    </div>
  );
}
