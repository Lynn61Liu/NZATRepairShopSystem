import { useNavigate, useParams } from "react-router-dom";
import { useJobDetailState } from "@/features/jobDetail";
import { Alert, EmptyState } from "@/components/ui";
import { JobDetailContent } from "@/features/jobDetail/components/JobDetailContent";
import { useJobDetailData } from "@/features/jobDetail/hooks/useJobDetailData";

export function JobDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { activeTab, setActiveTab, isSidebarOpen, setIsSidebarOpen } = useJobDetailState({ initialTab: "WOF" });
  const {
    jobData,
    loading,
    loadError,
    deleteError,
    deletingJob,
    hasWofRecord,
    wofRecords,
    wofCheckItems,
    wofFailReasons,
    wofLoading,
    partsServices,
    partsLoading,
    paintService,
    paintLoading,
    tagOptions,
    setLoadError,
    setDeleteError,
    createWofServer,
    deleteWofServer,
    createWofRecordRow,
    updateWofRecord,
    importWofRecords,
    createPartsService,
    updatePartsService,
    deletePartsService,
    createPartsNote,
    updatePartsNote,
    deletePartsNote,
    deleteJob,
    saveTags,
    saveJobNotes,
    createPaintService,
    updatePaintStage,
    updatePaintPanels,
    deletePaintService,
    refreshPaintService,
    refreshVehicleInfo,
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
        paintService={paintService}
        paintLoading={paintLoading}
        onAddWof={createWofServer}
        onRefreshWof={importWofRecords}
        onDeleteWofServer={deleteWofServer}
        onUpdateWofRecord={updateWofRecord}
        onCreateWofRecord={createWofRecordRow}
        onCreatePartsService={createPartsService}
        onUpdatePartsService={updatePartsService}
        onDeletePartsService={deletePartsService}
        onCreatePartsNote={createPartsNote}
        onUpdatePartsNote={updatePartsNote}
        onDeletePartsNote={deletePartsNote}
        onCreatePaintService={createPaintService}
        onUpdatePaintStage={updatePaintStage}
        onUpdatePaintPanels={updatePaintPanels}
        onDeletePaintService={deletePaintService}
        onRefreshPaintService={refreshPaintService}
        onDeleteJob={deleteJob}
        isDeletingJob={deletingJob}
        tagOptions={tagOptions}
        onSaveTags={saveTags}
        onSaveNotes={saveJobNotes}
        onRefreshVehicle={refreshVehicleInfo}
        isSidebarOpen={isSidebarOpen}
        onToggleSidebar={() => setIsSidebarOpen((v) => !v)}
      />
    </div>
  );
}
