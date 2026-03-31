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
  const currentWofStatus = getWofStatusLabel({
    hasService,
    hasRenderedData: hasAnyRenderedWofData,
    checkItems,
    records: props.records,
  });

  const handleOpenNzta = async () => {
    const url = "https://vic.nzta.govt.nz/";
    const normalizedVin = String(vin ?? "").trim();
    if (normalizedVin) {
      try {
        await navigator.clipboard.writeText(normalizedVin);
      } catch {
        // Fallback to opening NZTA even if clipboard permissions fail.
      }
    }
    window.open(url, "_blank", "noopener,noreferrer");
  };

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
        title={
          <span className="inline-flex items-center gap-2">
            <span>{JOB_DETAIL_TEXT.labels.wofRecords}</span>
            {currentWofStatus ? <WofStatusBadge label={currentWofStatus} /> : null}
          </span>
        }
        actions={
          <WofToolbar
            isLoading={isLoading}
            onRefresh={onRefresh}
            onDelete={onDeleteWofServer}
            onAdd={() => setShowCreate(true)}
            onOpenNzta={() => {
              void handleOpenNzta();
            }}
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

function getWofStatusLabel({
  hasService,
  hasRenderedData,
  checkItems,
  records,
}: {
  hasService: boolean;
  hasRenderedData: boolean;
  checkItems: WofCheckItem[];
  records: WofRecord[];
}) {
  const allStates = [...checkItems, ...records]
    .map((item) => String(item?.wofUiState ?? "").trim())
    .filter(Boolean);

  if (allStates.includes("Printed")) return "完成打印";
  if (hasRenderedData) return "有记录";
  if (hasService) return "代办";
  return null;
}

function WofStatusBadge({ label }: { label: string }) {
  const className =
    label === "完成打印"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : label === "有记录"
        ? "border-sky-200 bg-sky-50 text-sky-700"
        : "border-amber-200 bg-amber-50 text-amber-700";

  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${className}`}>
      {label}
    </span>
  );
}
