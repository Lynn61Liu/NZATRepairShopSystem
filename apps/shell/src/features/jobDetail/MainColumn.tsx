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
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Plus } from "lucide-react";
import { Button, Card } from "@/components/ui";
import { JobHeader } from "@/features/jobDetail/components/JobHeader";
import { SummaryCard } from "@/features/jobDetail/components/SummaryCard";
import { JobTabs } from "@/features/jobDetail/components/JobTabs";
import { WofPanel } from "@/features/wof";
import { RepairPanel } from "@/features/jobDetail/components/RepairPanel";
import { PaintPanel } from "@/features/paint";
import { LogPanel } from "@/features/jobDetail/components/LogPanel";
import { InvoicePanel } from "@/features/jobDetail/components/InvoicePanel";
import { PoPanel } from "@/features/jobDetail/components/PoPanel";
import { WorklogPanel } from "@/features/jobDetail/components/WorklogPanel";
import { JOB_DETAIL_TEXT } from "@/features/jobDetail/jobDetail.constants";
import { useInvoiceDashboardState } from "@/features/invoice/hooks/useInvoiceDashboardState";

type MainColumnProps = {
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
  onDeleteWofRecord?: (
    id: string
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
  onCreateXeroInvoice?: () => Promise<{ success: boolean; message?: string }>;
  isCreatingXeroInvoice?: boolean;
  onAttachXeroInvoice?: (invoiceNumber: string) => Promise<{ success: boolean; message?: string }>;
  isAttachingXeroInvoice?: boolean;
  onDetachXeroInvoice?: () => Promise<{ success: boolean; message?: string }>;
  isDetachingXeroInvoice?: boolean;
  onArchiveJob?: () => Promise<{ success: boolean; message?: string }>;
  isArchivingJob?: boolean;
  onDeleteJob?: () => void;
  isDeletingJob?: boolean;
  tagOptions?: { id: string; label: string }[];
  onSaveTags?: (tagIds: string[]) => Promise<{ success: boolean; message?: string; tags?: string[] }>;
  onSaveNotes?: (notes: string) => Promise<{ success: boolean; message?: string }>;
  // onCreatePaintService?: (status?: string) => Promise<{ success: boolean; message?: string }>;
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
  onDeleteWofRecord,
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
  onUpdatePaintStage,
  onUpdatePaintPanels,
  onDeletePaintService,
  onRefreshPaintService,
  onRefreshVehicle,
  onSaveVehicle,
  onCreateXeroInvoice,
  isCreatingXeroInvoice,
  onAttachXeroInvoice,
  isAttachingXeroInvoice,
  onDetachXeroInvoice,
  isDetachingXeroInvoice,
  onArchiveJob,
  isArchivingJob,
  onDeleteJob,
  isDeletingJob,
  tagOptions,
  onSaveTags,
  onSaveNotes,
  onCreatePaintService,
}: MainColumnProps) {
  const hasPartsServices = partsServices.length > 0;
  const [partsTabVisibleForCreate, setPartsTabVisibleForCreate] = useState(false);
  const [partsCreateTrigger, setPartsCreateTrigger] = useState(0);
  const [invoiceDashboardEnabled, setInvoiceDashboardEnabled] = useState(
    activeTab === "Invoice" || activeTab === "PO"
  );
  const invoiceDashboard = useInvoiceDashboardState({
    jobId: jobData.id,
    customer: jobData.customer,
    vehicle: jobData.vehicle,
    persistedPoNumber: jobData.poNumber,
    persistedInvoiceReference: jobData.invoiceReference,
    persistedInvoice: jobData.invoice,
    enabled: invoiceDashboardEnabled,
  });
  const needsPo = Boolean(jobData.needsPo);

  useEffect(() => {
    if (activeTab === "Invoice" || activeTab === "PO") {
      setInvoiceDashboardEnabled(true);
    }
  }, [activeTab]);

  const handleTabChange = (nextTab: JobDetailTabKey) => {
    onTabChange(nextTab);
  };

  const tabs = useMemo(() => {
    const base: { key: JobDetailTabKey; label: ReactNode }[] = [
      { key: "WOF", label: JOB_DETAIL_TEXT.tabs.wof },
      { key: "Mechanical", label: JOB_DETAIL_TEXT.tabs.mechanical },
    ];
    if (hasPartsServices || partsTabVisibleForCreate) {
      base.push({ key: "Parts", label: JOB_DETAIL_TEXT.tabs.parts });
    }
    base.push(
      { key: "Paint", label: JOB_DETAIL_TEXT.tabs.paint },
      { key: "Worklog", label: JOB_DETAIL_TEXT.tabs.worklog },
      { key: "Log", label: JOB_DETAIL_TEXT.tabs.log },
      { key: "Invoice", label: JOB_DETAIL_TEXT.tabs.invoice }
    );
    if (needsPo) {
      base.push({
        key: "PO",
        label: (
          <span className="inline-flex items-center gap-2">
            <span>{JOB_DETAIL_TEXT.tabs.po}</span>
            {invoiceDashboard.poPanel.unreadReplyCount > 0 ? (
              <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-[#dc2626] px-1.5 py-0.5 text-[11px] font-semibold text-white">
                {invoiceDashboard.poPanel.unreadReplyCount}
              </span>
            ) : null}
          </span>
        ),
      });
    }
    return base;
  }, [hasPartsServices, needsPo, partsTabVisibleForCreate, invoiceDashboard.poPanel.unreadReplyCount]);

  useEffect(() => {
    if (activeTab === "Parts" && !hasPartsServices && !partsTabVisibleForCreate) {
      handleTabChange("Mechanical");
    }
  }, [activeTab, hasPartsServices, partsTabVisibleForCreate]);

  useEffect(() => {
    if (activeTab === "PO" && !needsPo) {
      handleTabChange("Invoice");
    }
  }, [activeTab, needsPo]);

  useEffect(() => {
    if (activeTab === "PO" && invoiceDashboard.poPanel.unreadReplyCount > 0) {
      invoiceDashboard.poPanel.markPoThreadSeen();
    }
  }, [activeTab, invoiceDashboard.poPanel.unreadReplyCount]);

  useEffect(() => {
    if (partsTabVisibleForCreate && activeTab !== "Parts" && !hasPartsServices) {
      setPartsTabVisibleForCreate(false);
    }
  }, [partsTabVisibleForCreate, activeTab, hasPartsServices]);

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
          notes={jobData.notes ?? ""}
          createdAt={jobData.createdAt}
          vehiclePlate={jobData.vehicle.plate}
          vehicleModel={vehicleMakeModel}
          customerName={jobData.customer.name}
          customerCode={jobData.customer.businessCode}
          customerPhone={jobData.customer.phone}
          externalInvoiceId={jobData.invoice?.externalInvoiceId}
          needsPo={needsPo}
          paintPanels={paintService?.panels ?? null}
          vin={jobData.vehicle.vin}
          nzFirstRegistration={jobData.vehicle.nzFirstRegistration}
          hasPaintService={Boolean(paintService?.id)}
          onArchive={onArchiveJob}
          isArchiving={isArchivingJob}
          onDelete={onDeleteJob}
          isDeleting={isDeletingJob}
          tagOptions={tagOptions}
          onSaveTags={onSaveTags}
          onSaveNotes={onSaveNotes}
          onCreatePaintService={onCreatePaintService}
          onCreateXeroInvoice={onCreateXeroInvoice}
          isCreatingXeroInvoice={isCreatingXeroInvoice}
        />
      </Card>
      <SummaryCard
        vehicle={jobData.vehicle}
        customer={jobData.customer}
        onRefreshVehicle={onRefreshVehicle}
        onSaveVehicle={onSaveVehicle}
      />

      <Card className="p-4">
        <div className="flex items-start justify-between gap-3">
              <JobTabs activeTab={activeTab} onChange={handleTabChange} tabs={tabs} />
          <Button
            variant="ghost"
            className="inline-flex items-center gap-1 rounded-[8px] border border-[rgba(220,38,38,0.40)] bg-[rgba(220,38,38,0.05)] px-2.5 py-1.5 text-base font-medium text-[#b91c1c] hover:bg-[rgba(220,38,38,0.10)]"
            leftIcon={<Plus className="h-4 w-4" />}
            onClick={() => {
              setPartsTabVisibleForCreate(true);
              setPartsCreateTrigger((prev) => prev + 1);
              handleTabChange("Parts");
            }}
          >
            添加配件
          </Button>
        </div>

        {activeTab === "WOF" ? (
          <WofPanel
              hasRecord={hasWofRecord}
              hasService={jobData.hasWofService}
              wofStatus={jobData.wofStatus}
              onAdd={onAddWof}
            records={wofRecords}
            checkItems={wofCheckItems}
            failReasons={failReasons}
            isLoading={wofLoading}
            onRefresh={onRefreshWof}
            onDeleteWofServer={onDeleteWofServer}
            onUpdateRecord={onUpdateWofRecord}
            onDeleteRecord={onDeleteWofRecord}
            onCreateRecord={onCreateWofRecord}
            jobId={jobData.id}
            vehiclePlate={jobData.vehicle.plate}
            vehicleMakeModel={vehicleMakeModel}
            vehicleOdometer={jobData.vehicle.odometer ?? null}
            nzFirstRegistration={jobData.vehicle.nzFirstRegistration ?? ""}
            vin={jobData.vehicle.vin ?? null}
            customerName={jobData.customer.name}
            customerPhone={jobData.customer.phone}
            customerEmail={jobData.customer.email}
            customerAddress={jobData.customer.address}
          />
        ) : null}
        {activeTab === "Mechanical" ? (
          <RepairPanel
            mode="mech"
            services={[]}
            mechServices={mechServices}
            isLoading={mechLoading}
            onCreateMechService={onCreateMechService}
            onUpdateMechService={onUpdateMechService}
            onDeleteMechService={onDeleteMechService}
          />
        ) : null}
        {activeTab === "Parts" ? (
          <RepairPanel
            mode="parts"
            services={partsServices}
            mechServices={[]}
            isLoading={partsLoading}
            openPartsCreateTrigger={partsCreateTrigger}
            onCreateService={onCreatePartsService}
            onUpdateService={onUpdatePartsService}
            onDeleteService={onDeletePartsService}
            onCreateNote={onCreatePartsNote}
            onUpdateNote={onUpdatePartsNote}
            onDeleteNote={onDeletePartsNote}
          />
        ) : null}
        {activeTab === "Paint" ? (
          <PaintPanel
            service={paintService}
            isLoading={paintLoading}
            onCreateService={onCreatePaintService}
            onUpdateStage={onUpdatePaintStage}
            onUpdatePanels={onUpdatePaintPanels}
            onDeleteService={onDeletePaintService}
            onRefresh={onRefreshPaintService}
          />
        ) : null}
        {activeTab === "Worklog" ? (
          <WorklogPanel jobData={jobData} paintPanels={paintService?.panels ?? null} />
        ) : null}
        {activeTab === "Log" ? <LogPanel /> : null}
        {activeTab === "Invoice" ? (
          <InvoicePanel
            model={invoiceDashboard.invoicePanel}
            hasInvoice={Boolean(jobData.invoice)}
            invoiceProcessing={jobData.invoiceProcessing}
            onCreateInvoice={onCreateXeroInvoice}
            isCreatingInvoice={isCreatingXeroInvoice}
            onAttachInvoice={onAttachXeroInvoice}
            isAttachingInvoice={isAttachingXeroInvoice}
            onDetachInvoice={onDetachXeroInvoice}
            isDetachingInvoice={isDetachingXeroInvoice}
            needsPo={needsPo}
          />
        ) : null}
        {activeTab === "PO" && needsPo ? <PoPanel model={invoiceDashboard.poPanel} /> : null}
      </Card>

    </div>
  );
}
