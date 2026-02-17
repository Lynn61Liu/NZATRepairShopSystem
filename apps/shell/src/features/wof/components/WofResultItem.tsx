import { useEffect, useMemo, useRef, useState } from "react";
import type { WofCheckItem, WofFailReason, WofRecordUpdatePayload } from "@/types";
import { Button, useToast } from "@/components/ui";
import { JOB_DETAIL_TEXT } from "@/features/jobDetail/jobDetail.constants";
import { StatusBadge } from "@/components/common/StatusBadge";
import { formatNzDatePlusDays, formatNzDateTime, formatNzDateTimeInput } from "@/utils/date";
import { withApiBase } from "@/utils/api";
import { buildWofPayload, createEmptyWofFormState, toWofFormState, type WofFormState } from "../utils/wofForm";
import { FieldRow } from "./FieldRow";

type WofResultItemProps = {
  record: WofCheckItem;
  onUpdate?: (id: string, payload: WofRecordUpdatePayload) => Promise<{ success: boolean; message?: string }>;
  failReasons?: WofFailReason[];
  isDraft?: boolean;
  onCreate?: (payload: WofRecordUpdatePayload) => Promise<{ success: boolean; message?: string }>;
  onCancel?: () => void;
};

export function WofResultItem({
  record,
  onUpdate,
  failReasons = [],
  isDraft,
  onCreate,
  onCancel,
}: WofResultItemProps) {
  const toast = useToast();
  const [editing, setEditing] = useState(Boolean(isDraft));
  const [form, setForm] = useState<WofFormState>(() => (isDraft ? createEmptyWofFormState() : toWofFormState(record)));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [printUrl, setPrintUrl] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);
  const printFrameRef = useRef<HTMLIFrameElement | null>(null);
  const [failReasonQuery, setFailReasonQuery] = useState("");

  useEffect(() => {
    if (isDraft) return;
    setForm(toWofFormState(record));
  }, [isDraft, record.id, record.updatedAt]);

  useEffect(() => {
    if (!message) return;
    const timer = window.setTimeout(() => setMessage(null), 5000);
    return () => window.clearTimeout(timer);
  }, [message]);

  useEffect(() => {
    if (!error) return;
    const timer = window.setTimeout(() => setError(null), 5000);
    return () => window.clearTimeout(timer);
  }, [error]);

  useEffect(() => {
    if (!editing) return;
    if (form.occurredAt) return;
    setForm((prev) => ({ ...prev, occurredAt: formatNzDateTimeInput() }));
  }, [editing, form.occurredAt]);

  useEffect(() => {
    if (!editing) {
      setFailReasonQuery("");
    }
  }, [editing]);

  const filteredFailReasons = useMemo(() => {
    const query = failReasonQuery.trim().toLowerCase();
    if (!query) return failReasons;
    return failReasons.filter((reason) => reason.label.toLowerCase().includes(query));
  }, [failReasonQuery, failReasons]);

  const handleChange = (key: keyof WofFormState, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    if (isDraft && !onCreate) return;
    if (!isDraft && !onUpdate) return;
    setSaving(true);
    setMessage(null);
    setError(null);
    const payload = buildWofPayload(form);
    if (!payload.rego) {
      payload.rego = record.rego ?? null;
    }
    if (!payload.makeModel) {
      payload.makeModel = record.makeModel ?? null;
    }
    const response = isDraft && onCreate ? await onCreate(payload) : await onUpdate!(record.id, payload);
    setSaving(false);
    if (response.success) {
      setMessage(response.message || "保存成功");
      toast.success(response.message || "保存成功");
      if (isDraft) {
        onCancel?.();
      } else {
        setEditing(false);
      }
    } else {
      const message = response.message || "保存失败";
      setError(message);
      toast.error(message);
    }
  };

  const handlePrintFrameLoad = () => {
    if (!printing) return;
    try {
      printFrameRef.current?.contentWindow?.focus();
      printFrameRef.current?.contentWindow?.print();
      setMessage("已发送打印任务");
      toast.success("已发送打印任务");
    } catch {
      const message = "自动打印失败，请稍后重试。";
      setError(message);
      toast.error(message);
    } finally {
      setPrinting(false);
    }
  };

  const handlePrint = () => {
    const jobId = record.wofId;
    const recordId = record.id;
    if (!jobId || !recordId) {
      const message = "无法打印：缺少 jobId 或 recordId。";
      setError(message);
      toast.error(message);
      return;
    }
    const baseUrl = withApiBase(`/api/jobs/${jobId}/wof-records/${recordId}/print`);
    const url = baseUrl.includes("?") ? `${baseUrl}&_ts=${Date.now()}` : `${baseUrl}?_ts=${Date.now()}`;
    setPrintUrl(url);
    setPrinting(true);
  };

  return (
    <div className="border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors">
      {printUrl ? (
        <iframe
          ref={printFrameRef}
          title="WOF Print Frame"
          src={printUrl}
          className="hidden"
          onLoad={handlePrintFrameLoad}
        />
      ) : null}
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            {editing ? (
              <input
                type="datetime-local"
                className="h-7 rounded border px-2 text-xs"
                value={form.occurredAt}
                onChange={(e) => handleChange("occurredAt", e.target.value)}
              />
            ) : (
              <span className="text-sm font-medium text-gray-900">{formatNzDateTime(record.occurredAt)}</span>
            )}
            {editing ? (
              <select
                className="h-7 rounded border px-2 text-xs"
                value={form.recordState}
                onChange={(e) => handleChange("recordState", e.target.value)}
              >
                <option value="">—</option>
                <option value="Pass">Pass</option>
                <option value="Fail">Fail</option>
                <option value="Recheck">Recheck</option>
              </select>
            ) : (
              <StatusBadge value={record.recordState} />
            )}
            {(editing ? form.recordState === "Fail" : record.recordState === "Fail") ? (
              <span className="text-xs text-red-600">Expiry recheck Date: {formatNzDatePlusDays(28)}</span>
            ) : null}
            {!isDraft ? (
              <Button className="ml-auto" variant="primary" onClick={handlePrint}>
                {JOB_DETAIL_TEXT.buttons.print}
              </Button>
            ) : (
              <div className="ml-auto" />
            )}
            {isDraft ? (
              <Button variant="ghost" onClick={onCancel}>
                取消
              </Button>
            ) : (
              <Button variant="ghost" onClick={() => setEditing((v) => !v)}>
                {editing ? "取消" : "修改"}
              </Button>
            )}
            {editing ? (
              <Button variant="primary" onClick={handleSave} disabled={saving}>
                保存
              </Button>
            ) : null}
          </div>

          {message ? <div className="text-xs text-green-600 mb-2">{message}</div> : null}
          {error ? <div className="text-xs text-red-600 mb-2">{error}</div> : null}

          <div className="grid grid-cols-1 gap-2 text-sm md:grid-cols-2">
            {/* <FieldRow label="Rego">
              {editing ? (
                <input className="ml-2 rounded border px-2 py-1" value={form.rego} onChange={(e) => handleChange("rego", e.target.value)} />
              ) : (
                record.rego ?? "—"
              )}
            </FieldRow> */}
            {/* <FieldRow label="Make & Model">
              {editing ? (
                <input
                  className="ml-2 rounded border px-2 py-1"
                  value={form.makeModel}
                  onChange={(e) => handleChange("makeModel", e.target.value)}
                />
              ) : (
                record.makeModel ?? "—"
              )}
            </FieldRow> */}
            <FieldRow label="Odometer">
              {editing ? (
                <input className="ml-2 rounded border px-2 py-1" value={form.odo} onChange={(e) => handleChange("odo", e.target.value)} />
              ) : (
                record.odo ?? "—"
              )}
            </FieldRow>
            <FieldRow label="Auth Code">
              {editing ? (
                <input className="ml-2 rounded border px-2 py-1" value={form.authCode} onChange={(e) => handleChange("authCode", e.target.value)} />
              ) : (
                record.authCode ?? "—"
              )}
            </FieldRow>
            <FieldRow label="Check Sheet">
              {editing ? (
                <input className="ml-2 rounded border px-2 py-1" value={form.checkSheet} onChange={(e) => handleChange("checkSheet", e.target.value)} />
              ) : (
                record.checkSheet ?? "—"
              )}
            </FieldRow>
            <FieldRow label="CS No">
              {editing ? (
                <input className="ml-2 rounded border px-2 py-1" value={form.csNo} onChange={(e) => handleChange("csNo", e.target.value)} />
              ) : (
                record.csNo ?? "—"
              )}
            </FieldRow>
            <FieldRow label="WOF Label">
              {editing ? (
                <input className="ml-2 rounded border px-2 py-1" value={form.wofLabel} onChange={(e) => handleChange("wofLabel", e.target.value)} />
              ) : (
                record.wofLabel ?? "—"
              )}
            </FieldRow>
            <FieldRow label="Label No">
              {editing ? (
                <input className="ml-2 rounded border px-2 py-1" value={form.labelNo} onChange={(e) => handleChange("labelNo", e.target.value)} />
              ) : (
                record.labelNo ?? "—"
              )}
            </FieldRow>
            <FieldRow label="Source File">
              {editing ? (
                <input className="ml-2 rounded border px-2 py-1" value={form.sourceFile} onChange={(e) => handleChange("sourceFile", e.target.value)} />
              ) : (
                record.source ?? "—"
              )}
            </FieldRow>
            <FieldRow label="Source Row">
              {editing ? (
                <input className="ml-2 rounded border px-2 py-1" value={form.excelRowNo} onChange={(e) => handleChange("excelRowNo", e.target.value)} />
              ) : (
                record.sourceRow ?? "—"
              )}
            </FieldRow>
            <FieldRow label="Imported At">
              {editing ? (
                <input className="ml-2 rounded border px-2 py-1" value={form.importedAt} onChange={(e) => handleChange("importedAt", e.target.value)} />
              ) : (
                formatNzDateTime(record.importedAt)
              )}
            </FieldRow>
            <FieldRow label="Updated At">{formatNzDateTime(record.updatedAt)}</FieldRow>
          </div>

          <div className="grid grid-cols-1 gap-2 text-sm md:grid-cols-2 mt-2">
            {(editing ? form.recordState === "Fail" : record.recordState === "Fail") ? (
              <FieldRow label="Fail Reason" className="text-xs text-gray-500 md:text-sm">
                {editing ? (
                  <span className="ml-2 inline-flex items-center gap-2">
                    <input
                      className="w-32 rounded border px-2 py-1 text-xs"
                      placeholder="搜索..."
                      value={failReasonQuery}
                      onChange={(e) => setFailReasonQuery(e.target.value)}
                    />
                    <select
                      className="rounded border px-2 py-1"
                      value={form.failReasons}
                      onChange={(e) => handleChange("failReasons", e.target.value)}
                    >
                      <option value="">—</option>
                      {filteredFailReasons.map((reason) => (
                        <option key={reason.id} value={reason.label}>
                          {reason.label}
                        </option>
                      ))}
                    </select>
                  </span>
                ) : (
                  record.failReasons ?? "—"
                )}
              </FieldRow>
            ) : null}
            <FieldRow label="Note">
              {editing ? (
                <input className="ml-2 rounded border px-2 py-1" value={form.note} onChange={(e) => handleChange("note", e.target.value)} />
              ) : (
                record.note ?? "—"
              )}
            </FieldRow>
          </div>
        </div>
      </div>
    </div>
  );
}
