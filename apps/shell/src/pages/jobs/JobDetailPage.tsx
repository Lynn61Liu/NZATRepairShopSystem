import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useJobDetailState } from "@/features/jobDetail";
import { DeleteJobDialog } from "@/components/common/DeleteJobDialog";
import {
  createDeletingDeleteJobSteps,
  createInitialDeleteJobSteps,
  resolveDeleteJobDialogSteps,
} from "@/components/common/DeleteJobDialogState";
import { Alert, EmptyState, useToast } from "@/components/ui";
import { CourtesyCarAssignDialog } from "@/features/courtesyCarAgreements/components/CourtesyCarAssignDialog";
import { JobDetailContent } from "@/features/jobDetail/components/JobDetailContent";
import { useJobDetailData } from "@/features/jobDetail/hooks/useJobDetailData";
import type { JobDetailTabKey } from "@/types";

export function JobDetailPage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const toast = useToast();
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteModalPhase, setDeleteModalPhase] = useState<"confirm" | "status">("confirm");
  const [deleteSteps, setDeleteSteps] = useState(() => createInitialDeleteJobSteps());
  const [deleteModalError, setDeleteModalError] = useState<string | null>(null);
  const [deleteSucceeded, setDeleteSucceeded] = useState(false);
  const [courtesyCarAssignOpen, setCourtesyCarAssignOpen] = useState(false);
  const tabParam = searchParams.get("tab");
  const initialTab: JobDetailTabKey = isJobDetailTab(tabParam) ? tabParam : "WOF";
  const { activeTab, setActiveTab, isSidebarOpen, setIsSidebarOpen } = useJobDetailState({ initialTab });

  useEffect(() => {
    if (searchParams.get("integration") !== "xero") return;
    const status = searchParams.get("status");
    const message = searchParams.get("message") || (status === "connected" ? "Xero connected" : "Xero connection failed");
    if (status === "connected") toast.success(message);
    else toast.error(message);

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete("integration");
    nextParams.delete("status");
    nextParams.delete("message");
    navigate({ search: nextParams.toString() }, { replace: true });
  }, [navigate, searchParams, toast]);
  const {
    jobData,
    loading,
    loadError,
    deleteError,
    deletingJob,
    archivingJob,
    creatingXeroInvoice,
    attachingXeroInvoice,
    replacingXeroInvoice,
    detachingXeroInvoice,
    hasWofRecord,
    wofRecords,
    wofCheckItems,
    wofFailReasons,
    wofLoading,
    partsServices,
    partsLoading,
    mechServices,
    mechLoading,
    paintService,
    paintLoading,
    paintInitialized,
    tagOptions,
    setLoadError,
    setDeleteError,
    createWofServer,
    deleteWofServer,
    deleteWofRecord,
    createWofRecordRow,
    updateWofRecord,
    importWofRecords,
    createPartsService,
    updatePartsService,
    deletePartsService,
    createPartsNote,
    updatePartsNote,
    deletePartsNote,
    createMechService,
    updateMechService,
    deleteMechService,
    deleteJob,
    archiveJob,
    unarchiveJob,
    saveYardStatus,
    createJobXeroDraftInvoice,
    attachJobXeroInvoice,
    replaceJobXeroInvoice,
    detachJobXeroInvoice,
    saveTags,
    saveJobNotes,
    saveJobPrivateNotes,
    saveJobPoNumber,
    createPaintService,
    updatePaintStage,
    updatePaintPanels,
    deletePaintService,
    refreshPaintService,
    refreshVehicleInfo,
    syncVehicleNztaInfo,
    saveVehicleInfo,
    saveCustomerInfo,
  } = useJobDetailData({ jobId: id, activeTab });

  const openDeleteModal = () => {
    setDeleteModalOpen(true);
    setDeleteModalPhase("confirm");
    setDeleteSteps(createInitialDeleteJobSteps());
    setDeleteModalError(null);
    setDeleteSucceeded(false);
    setDeleteError(null);
  };

  const closeDeleteModal = () => {
    setDeleteModalOpen(false);
    if (deleteSucceeded) {
      navigate("/jobs");
    }
  };

  const confirmDelete = async () => {
    setDeleteModalPhase("status");
    setDeleteModalError(null);
    setDeleteSteps(createDeletingDeleteJobSteps());

    const result = await deleteJob();
    setDeleteSteps(resolveDeleteJobDialogSteps(result.steps, result.success));
    setDeleteModalError(result.success ? null : result.message || "删除失败");
    setDeleteSucceeded(result.success);
  };

  if (loading) {
    return <div className="py-10 text-center text-sm text-[var(--ds-muted)]">加载中...</div>;
  }

  if (loadError) {
    return (
      <div className="space-y-4">
        <Alert variant="error" description={loadError} onClose={() => setLoadError(null)} />
        <EmptyState message="无法加载工单详情" />
      </div>
    );
  }

  if (!jobData) {
    return <EmptyState message="暂无工单详情" />;
  }

  return (
    <div className="space-y-4">
      {deleteError ? (
        <Alert variant="error" description={deleteError} onClose={() => setDeleteError(null)} />
      ) : null}
      <JobDetailContent
        jobData={jobData}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        hasWofRecord={hasWofRecord}
        wofRecords={wofRecords}
        wofCheckItems={wofCheckItems}
        failReasons={wofFailReasons}
        wofLoading={wofLoading}
        partsServices={partsServices}
        partsLoading={partsLoading}
        mechServices={mechServices}
        mechLoading={mechLoading}
        paintService={paintService}
        paintLoading={paintLoading}
        paintInitialized={paintInitialized}
        onAddWof={createWofServer}
        onRefreshWof={importWofRecords}
        onDeleteWofServer={deleteWofServer}
        onUpdateWofRecord={updateWofRecord}
        onDeleteWofRecord={deleteWofRecord}
        onCreateWofRecord={createWofRecordRow}
        onCreatePartsService={createPartsService}
        onUpdatePartsService={updatePartsService}
        onDeletePartsService={deletePartsService}
        onCreatePartsNote={createPartsNote}
        onUpdatePartsNote={updatePartsNote}
        onDeletePartsNote={deletePartsNote}
        onCreateMechService={createMechService}
        onUpdateMechService={updateMechService}
        onDeleteMechService={deleteMechService}
        onCreatePaintService={createPaintService}
        onUpdatePaintStage={updatePaintStage}
        onUpdatePaintPanels={updatePaintPanels}
        onDeletePaintService={deletePaintService}
        onRefreshPaintService={refreshPaintService}
        onCreateXeroInvoice={createJobXeroDraftInvoice}
        isCreatingXeroInvoice={creatingXeroInvoice}
        onAttachXeroInvoice={attachJobXeroInvoice}
        isAttachingXeroInvoice={attachingXeroInvoice}
        onReplaceXeroInvoice={replaceJobXeroInvoice}
        isReplacingXeroInvoice={replacingXeroInvoice}
        onDetachXeroInvoice={detachJobXeroInvoice}
        isDetachingXeroInvoice={detachingXeroInvoice}
        onArchiveJob={archiveJob}
        onUnarchiveJob={unarchiveJob}
        onSaveYardStatus={saveYardStatus}
        isArchivingJob={archivingJob}
        onDeleteJob={openDeleteModal}
        isDeletingJob={deletingJob}
        onOpenCourtesyCarAssign={() => setCourtesyCarAssignOpen(true)}
        tagOptions={tagOptions}
        onSaveTags={saveTags}
        onSaveNotes={saveJobNotes}
        onSavePrivateNotes={saveJobPrivateNotes}
        onSavePoNumber={saveJobPoNumber}
        onRefreshVehicle={refreshVehicleInfo}
        onSyncVehicleNzta={syncVehicleNztaInfo}
        onSaveVehicle={saveVehicleInfo}
        onSaveCustomer={saveCustomerInfo}
        isSidebarOpen={isSidebarOpen}
        onToggleSidebar={() => setIsSidebarOpen((v) => !v)}
      />
      <CourtesyCarAssignDialog
        open={courtesyCarAssignOpen}
        jobId={id ?? ""}
        existingAgreement={jobData.courtesyCarAgreement}
        onClose={() => setCourtesyCarAssignOpen(false)}
      />
      <DeleteJobDialog
        open={deleteModalOpen}
        isDeleting={deletingJob}
        phase={deleteModalPhase}
        errorMessage={deleteModalError}
        steps={deleteSteps}
        onConfirm={() => void confirmDelete()}
        onClose={closeDeleteModal}
      />
    </div>
  );
}

function isJobDetailTab(value: string | null): value is JobDetailTabKey {
  return (
    value === "WOF" ||
    value === "Mechanical" ||
    value === "Parts" ||
    value === "Paint" ||
    value === "Worklog" ||
    value === "Log" ||
    value === "Invoice" ||
    value === "PO"
  );
}
