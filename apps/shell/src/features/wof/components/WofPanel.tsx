import { useState } from "react";
import { SectionCard } from "@/components/ui";
import { JOB_DETAIL_TEXT } from "@/features/jobDetail/jobDetail.constants";
import type { WofCheckItem, WofFailReason, WofRecord, WofRecordUpdatePayload } from "@/types";
import { WofResultsList } from "./WofResultsList";
import { WofToolbar } from "./WofToolbar";

export type WofPanelProps = {
  hasRecord: boolean;
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
  vehiclePlate?: string;
  vehicleMakeModel?: string;
};

export function WofPanel(props: WofPanelProps) {
  const {
    checkItems = [],
    failReasons = [],
    isLoading,
    onRefresh,
    onDeleteWofServer,
    onUpdateRecord,
    onCreateRecord,
    vehiclePlate,
    vehicleMakeModel,
  } = props;
  const [showCreate, setShowCreate] = useState(false);

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
