import { useState } from "react";
import { Button, SectionCard } from "@/components/ui";
import { JOB_DETAIL_TEXT } from "@/features/jobDetail/jobDetail.constants";
import type { WofCheckItem, WofFailReason, WofRecord, WofRecordUpdatePayload } from "@/types";
import { WofResultsList } from "./WofResultsList";
import { WofToolbar } from "./WofToolbar";

export type WofPanelProps = {
  hasRecord: boolean;
  hasService?: boolean;
  wofStatus?: "Todo" | "Checked" | "Recorded" | null;
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
  onDeleteRecord?: (
    id: string
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
    wofStatus,
    onAdd,
    checkItems = [],
    failReasons = [],
    isLoading,
    onRefresh,
    onDeleteWofServer,
    onUpdateRecord,
    onDeleteRecord,
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
  const currentWofStatus = getWofStatusLabel(wofStatus, hasService, hasAnyRenderedWofData);

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
          onDelete={onDeleteRecord}
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

function getWofStatusLabel(
  status: WofPanelProps["wofStatus"],
  hasService: boolean,
  hasRenderedData: boolean
) {
  if (status === "Recorded") return "已录入";
  if (status === "Checked") return "检查完成";
  if (status === "Todo") return "待查";
  if (hasRenderedData) return "已录入";
  if (hasService) return "待查";
  return null;
}

function WofStatusBadge({ label }: { label: string }) {
  const className =
    label === "已录入"
        ? "border-sky-200 bg-sky-50 text-sky-700"
        : label === "检查完成"
          ? "border-amber-200 bg-amber-50 text-amber-700"
          : "border-slate-200 bg-white text-slate-700";

  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${className}`}>
      {label}
    </span>
  );
}
