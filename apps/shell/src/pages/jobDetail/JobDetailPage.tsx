import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useJobDetailState } from "@/features/jobDetail";
import { Alert, EmptyState } from "@/components/ui";
import { JobDetailContent } from "@/features/jobDetail/components/JobDetailContent";
import { useJobDetailData } from "@/features/jobDetail/hooks/useJobDetailData";
import type { JobDetailTabKey } from "@/types";

export function JobDetailPage() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const tabParam = searchParams.get("tab");
  const initialTab: JobDetailTabKey = isJobDetailTab(tabParam) ? tabParam : "WOF";
  const { activeTab, setActiveTab, isSidebarOpen, setIsSidebarOpen } = useJobDetailState({ initialTab });
  const {
    jobData,
    loading,
    loadError,
    deleteError,
    deletingJob,
    archivingJob,
    creatingXeroInvoice,
    attachingXeroInvoice,
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
    createJobXeroDraftInvoice,
    attachJobXeroInvoice,
    detachJobXeroInvoice,
    saveTags,
    saveJobNotes,
    createPaintService,
    updatePaintStage,
    updatePaintPanels,
    deletePaintService,
    refreshPaintService,
    refreshVehicleInfo,
    saveVehicleInfo,
  } = useJobDetailData({ jobId: id, onDeleted: () => navigate("/jobs") });

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
        onDetachXeroInvoice={detachJobXeroInvoice}
        isDetachingXeroInvoice={detachingXeroInvoice}
        onArchiveJob={archiveJob}
        isArchivingJob={archivingJob}
        onDeleteJob={deleteJob}
        isDeletingJob={deletingJob}
        tagOptions={tagOptions}
        onSaveTags={saveTags}
        onSaveNotes={saveJobNotes}
        onRefreshVehicle={refreshVehicleInfo}
        onSaveVehicle={saveVehicleInfo}
        isSidebarOpen={isSidebarOpen}
        onToggleSidebar={() => setIsSidebarOpen((v) => !v)}
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
