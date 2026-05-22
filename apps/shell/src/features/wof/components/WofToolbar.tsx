import { useEffect, useState } from "react";
import { Button } from "@/components/ui";
import { JOB_DETAIL_TEXT } from "@/features/jobDetail/jobDetail.constants";
import { ExternalLink, RefreshCw, Trash2 } from "lucide-react";

type WofToolbarProps = {
  isLoading?: boolean;
  onRefresh?: () => Promise<{ success: boolean; message?: string }>;
  onDelete?: () => Promise<{ success: boolean; message?: string }>;
  onAdd?: () => void;
  onOpenNzta?: () => void;
};

export function WofToolbar({ isLoading, onRefresh, onDelete, onAdd, onOpenNzta }: WofToolbarProps) {
  const [deleteMessage, setDeleteMessage] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showRefreshConfirm, setShowRefreshConfirm] = useState(false);

  useEffect(() => {
    if (!deleteMessage) return;
    const timer = window.setTimeout(() => setDeleteMessage(null), 5000);
    return () => window.clearTimeout(timer);
  }, [deleteMessage]);

  useEffect(() => {
    if (!deleteError) return;
    const timer = window.setTimeout(() => setDeleteError(null), 5000);
    return () => window.clearTimeout(timer);
  }, [deleteError]);

  useEffect(() => {
    if (!refreshMessage) return;
    const timer = window.setTimeout(() => setRefreshMessage(null), 5000);
    return () => window.clearTimeout(timer);
  }, [refreshMessage]);

  useEffect(() => {
    if (!refreshError) return;
    const timer = window.setTimeout(() => setRefreshError(null), 5000);
    return () => window.clearTimeout(timer);
  }, [refreshError]);

  useEffect(() => {
    if (!showRefreshConfirm) return;
    const timer = window.setTimeout(() => setShowRefreshConfirm(false), 3000);
    return () => window.clearTimeout(timer);
  }, [showRefreshConfirm]);

  const handleDelete = async () => {
    if (!onDelete) return;
    if (!window.confirm("Are you sure you want to delete this WOF record and related data?")) return;
    setDeleteMessage(null);
    setDeleteError(null);
    const response = await onDelete();
    if (response.success) {
      setDeleteMessage(response.message || "Delete successfully");
    } else {
      setDeleteError(response.message || "Delete failed");
    }
  };

  const handleRefresh = async () => {
    if (!onRefresh || refreshing) return;
    setRefreshMessage(null);
    setRefreshError(null);
    setRefreshing(true);
    try {
      const response = await onRefresh();
      if (response.success) {
        setRefreshMessage(response.message || "Import successful");
      } else {
        setRefreshError(response.message || "Import failed");
      }
    } catch (err) {
      setRefreshError(err instanceof Error ? err.message : "Import failed");
    } finally {
      setRefreshing(false);
    }
  };

  const handleRefreshClick = () => {
    if (!onRefresh || refreshing) return;
    setShowRefreshConfirm(true);
  };

  return (
    <div className="flex items-center gap-2 mb-4">
      {deleteMessage ? <div className="text-xs text-green-600">{deleteMessage}</div> : null}
      {deleteError ? <div className="text-xs text-red-600">{deleteError}</div> : null}
      {refreshMessage ? <div className="text-xs text-green-600">{refreshMessage}</div> : null}
      {refreshError ? <div className="text-xs text-red-600">{refreshError}</div> : null}
      <Button className="flex items-center gap-2" onClick={handleRefreshClick} disabled={isLoading || refreshing}>
        <RefreshCw className="w-4 h-4"/> Table import </Button> <Button className="flex items-center gap-2"onClick={onAdd} disabled={isLoading}> Add manually </Button> <Button className="flex items-center gap-2" onClick={onOpenNzta}>
        <ExternalLink className="w-4 h-4" />
        {JOB_DETAIL_TEXT.buttons.openNzta}
      </Button>
      <Button
        leftIcon={<Trash2 className="w-4 h-4" />}
        className="border-red-300 text-red-700 hover:bg-red-50"onClick={handleDelete} disabled={isLoading} > Delete WOF service </Button> {showRefreshConfirm? ( <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="w-full max-w-sm rounded-lg bg-white p-4 shadow-lg">
            <div className="text-sm font-semibold text-gray-900">Tip</div> <div className="mt-2 text-sm text-gray-600"> This refresh will overwrite the previously captured Excel data, and manually added records will not be affected. </div> <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost"onClick={() => setShowRefreshConfirm(false)}> Cancel </Button> <Button variant="primary"
                onClick={() => {
                  setShowRefreshConfirm(false);
                  void handleRefresh();
                }}
              >Confirm refresh</Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
