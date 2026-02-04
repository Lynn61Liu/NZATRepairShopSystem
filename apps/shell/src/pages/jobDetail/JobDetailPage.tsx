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
    tagOptions,
    setLoadError,
    setDeleteError,
    createWofServer,
    saveWofResult,
    deleteWofServer,
    createWofRecordRow,
    updateWofRecord,
    importWofRecords,
    deleteJob,
    saveTags,
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
        onAddWof={createWofServer}
        onRefreshWof={importWofRecords}
        onSaveWofResult={saveWofResult}
        onDeleteWofServer={deleteWofServer}
        onUpdateWofRecord={updateWofRecord}
        onCreateWofRecord={createWofRecordRow}
        onDeleteJob={deleteJob}
        isDeletingJob={deletingJob}
        tagOptions={tagOptions}
        onSaveTags={saveTags}
        onRefreshVehicle={refreshVehicleInfo}
        isSidebarOpen={isSidebarOpen}
        onToggleSidebar={() => setIsSidebarOpen((v) => !v)}
      />
    </div>
  );
}
