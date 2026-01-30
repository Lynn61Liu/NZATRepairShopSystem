import { useState } from "react";
import { Button, SectionCard } from "@/components/ui";
import { JOB_DETAIL_TEXT } from "@/features/jobDetail/jobDetail.constants";
import { EmptyPanel } from "./EmptyPanel";
import { WofResultsCard } from "./WofResultsCard";
import { ExternalLink, RefreshCw, Trash2 } from 'lucide-react';
import type { WofCheckItem, WofFailReason, WofRecord } from "@/types";

export type WofPanelProps = {
  hasRecord: boolean;
  onAdd: () => void;
  records: WofRecord[];
  checkItems?: WofCheckItem[];
  failReasons?: WofFailReason[];
  isLoading?: boolean;
  onSaveResult?: (payload: {
    result: "Pass" | "Fail";
    expiryDate?: string;
    failReasonId?: string;
    note?: string;
  }) => Promise<{ success: boolean; message?: string }>;
  onDeleteWofServer?: () => Promise<{ success: boolean; message?: string }>;
};

export function WofPanel({
  hasRecord,
  onAdd,
  records,
  checkItems = [],
  failReasons = [],
  isLoading,
  onSaveResult,
  onDeleteWofServer,
}: WofPanelProps) {
  const [result, setResult] = useState<"Pass" | "Fail">("Pass");
  const [expiryDate, setExpiryDate] = useState("");
  const [failReason, setFailReason] = useState("");
  const [note, setNote] = useState("");
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteMessage, setDeleteMessage] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleSaveResult = async () => {
    if (!onSaveResult) return;
    setSaveMessage(null);
    setSaveError(null);
    setSaving(true);
    const response = await onSaveResult({
      result,
      expiryDate: result === "Fail" ? expiryDate : "",
      failReasonId: result === "Fail" ? failReason : "",
      note,
    });
    setSaving(false);
    if (response.success) {
      setSaveMessage(response.message || "保存成功");
    } else {
      setSaveError(response.message || "保存失败");
    }
    setResult("Pass");
    setExpiryDate("");
    setFailReason("");
    setNote("");
  };

  const handleDelete = async () => {
    if (!onDeleteWofServer) return;
    if (!window.confirm("确定删除该 WOF 记录及相关数据？")) return;
    setDeleteMessage(null);
    setDeleteError(null);
    const response = await onDeleteWofServer();
    if (response.success) {
      setDeleteMessage(response.message || "删除成功");
    } else {
      setDeleteError(response.message || "删除失败");
    }
  };

  const hasAnyData = records.length > 0 || checkItems.length > 0;
  if (!hasRecord && !hasAnyData && !isLoading) {
    return <EmptyPanel onAdd={onAdd} />;
  }

  return (
    <div className="space-y-5 py-4">
      <SectionCard
        title={JOB_DETAIL_TEXT.labels.wofRecords}
        actions={
          <div className="flex items-center gap-2 mb-4">
            {deleteMessage ? <div className="text-xs text-green-600">{deleteMessage}</div> : null}
            {deleteError ? <div className="text-xs text-red-600">{deleteError}</div> : null}
            <Button variant="primary">{JOB_DETAIL_TEXT.buttons.print}</Button>
            <Button   leftIcon={<Trash2 className="w-4 h-4" />}
          className="border-red-300 text-red-700 hover:bg-red-50" onClick={handleDelete} disabled={isLoading}>
              删除WOF
            </Button>

            
          </div>
        }
      >
        <div className="mb-4 rounded-[12px] border border-[var(--ds-border)] pb-4">    
          {checkItems.length ? (
            <div className="mt-3 space-y-4 text-sm">
              {checkItems.map((item) => (
                <div key={item.id} className="rounded-[10px]  p-3">
                  {/* <div className="text-xs text-[var(--ds-muted)]">ID {item.id}</div> */}
                  <div className="mt-2 grid grid-cols-1 gap-2 md:grid-cols-2">
                    <div>ODO: {item.odo || "—"}</div>
                    <div>Auth Code: {item.authCode || "—"}</div>
                    <div>Check Sheet: {item.checkSheet || "—"}</div>
                    <div>CS No: {item.csNo || "—"}</div>
                    <div>WOF Label: {item.wofLabel || "—"}</div>
                    <div>Label No: {item.labelNo || "—"}</div>
                    <div>Source: {item.source || "—"}</div>
                    <div>Source Row: {item.sourceRow || "—"}</div>
                    <div>Updated At: {item.updatedAt || "—"}</div>
                  </div>
                </div>
              ))}
            </div>

          ) : <div className="text-sm text-[rgba(0,0,0,0.55)] underline p-4">Empty WOF Records</div>

          }
          <div className="pb-4 flex  gap-2 justify-end items-end pr-4">
            <Button className="flex items-center gap-2"><ExternalLink className="w-4 h-4" />
              {JOB_DETAIL_TEXT.buttons.openNzta}
            </Button>

            <Button> <RefreshCw className="w-4 h-4" />
              {JOB_DETAIL_TEXT.buttons.refresh}</Button>
          </div>
        </div>


        {isLoading ? (
          <div className="py-6 text-center text-sm text-[var(--ds-muted)]">加载中...</div>
        ) : null}



        {records.length ? (
          // add mutil WofResultsCard component here
          <WofResultsCard
            wofResults={records.map((record) => ({
              id: record.id,
              date: record.date,
              source: record.source ?? "DB",
              status: record.status ?? null,
              expiryDate: record.expiryDate ?? "",
              notes: record.notes ?? "",
              failReason: record.failReason,
            }))}
          />
        ) : null}
      </SectionCard>





      <SectionCard title={JOB_DETAIL_TEXT.labels.result}>
        <div className="mt-4 space-y-3 text-sm">
          <div>
            <div className="text-xs text-[var(--ds-muted)]">{JOB_DETAIL_TEXT.labels.initiateResult}</div>
            <select
              className="mt-2 h-9 w-full rounded-[8px] border border-[var(--ds-border)] px-3"
              value={result}
              onChange={(event) => setResult(event.target.value as "Pass" | "Fail")}
            >
              <option>Pass</option>
              <option>Fail</option>
            </select>
          </div>
          {result === "Fail" ? (
            <>
              <div>
                <div className="text-xs text-[var(--ds-muted)]">{JOB_DETAIL_TEXT.labels.expiryDate}</div>
                <input
                  type="date"
                  className="mt-2 h-9 w-full rounded-[8px] border border-[var(--ds-border)] px-3"
                  value={expiryDate}
                  onChange={(event) => setExpiryDate(event.target.value)}
                />
              </div>
              <div>
                <div className="text-xs text-[var(--ds-muted)]">{JOB_DETAIL_TEXT.labels.failReason}</div>
                <select
                  className="mt-2 h-9 w-full rounded-[8px] border border-[var(--ds-border)] px-3"
                  value={failReason}
                  onChange={(event) => setFailReason(event.target.value)}
                >
                  <option value="">Fail list...</option>
                  {failReasons.map((reason) => (
                    <option key={reason.id} value={reason.id}>
                      {reason.label}
                    </option>
                  ))}
                </select>
              </div>
            </>
          ) : null}
          <div>
            <div className="text-xs text-[var(--ds-muted)]">{JOB_DETAIL_TEXT.labels.note}</div>
            <textarea
              className="mt-2 h-24 w-full rounded-[8px] border border-[var(--ds-border)] px-3 py-2"
              placeholder=""
              value={note}
              onChange={(event) => setNote(event.target.value)}
            />
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          {saveMessage ? <div className="text-xs text-green-600">{saveMessage}</div> : null}
          {saveError ? <div className="text-xs text-red-600">{saveError}</div> : null}
          <Button variant="primary" onClick={handleSaveResult} disabled={saving}>
            {JOB_DETAIL_TEXT.buttons.saveResult}
          </Button>
        </div>
      </SectionCard>
    </div>
  );
}
