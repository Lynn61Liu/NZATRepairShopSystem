import { useEffect, useMemo, useState } from "react";
import type { WofCheckItem, WofFailReason, WofRecordUpdatePayload } from "@/types";
import { Button, useToast } from "@/components/ui";
import { JOB_DETAIL_TEXT } from "@/features/jobDetail/jobDetail.constants";
import { StatusBadge } from "@/components/common/StatusBadge";
import { formatNzDate, formatNzDatePlusDays, formatUtcDateTime } from "@/utils/date";
import { buildWofPayload, createEmptyWofFormState, toWofFormState, type WofFormState } from "../utils/wofForm";
import { FieldRow } from "./FieldRow";
import { useTemplatePrinter } from "@/features/printing/useTemplatePrinter";
import type { WofPrintData } from "@/features/printing/wofPrint";
import { Trash2 } from "lucide-react";

export type WofPrintContext = {
  jobId?: string;
  vehicleMakeModel?: string;
  vehicleOdometer?: number | null;
  nzFirstRegistration?: string;
  vin?: string | null;
  customerName?: string;
  customerPhone?: string;
  customerEmail?: string;
  customerAddress?: string;
};

type WofResultItemProps = {
  record: WofCheckItem;
  printContext?: WofPrintContext;
  onUpdate?: (id: string, payload: WofRecordUpdatePayload) => Promise<{ success: boolean; message?: string }>;
  onDelete?: (id: string) => Promise<{ success: boolean; message?: string }>;
  failReasons?: WofFailReason[];
  isDraft?: boolean;
  onCreate?: (payload: WofRecordUpdatePayload) => Promise<{ success: boolean; message?: string }>;
  onCancel?: () => void;
};

const toYYYYMMDD = (value?: string | null) => {
  const s = String(value ?? "").trim();
  if (!s) return "";
  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }
  const slashIso = s.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})/);
  if (slashIso) {
    const yyyy = slashIso[1];
    const mm = String(slashIso[2]).padStart(2, "0");
    const dd = String(slashIso[3]).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }
  const dmy = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (dmy) {
    const dd = String(dmy[1]).padStart(2, "0");
    const mm = String(dmy[2]).padStart(2, "0");
    const yyyy = dmy[3];
    return `${yyyy}-${mm}-${dd}`;
  }
  const normalized = s.replace(/\//g, "-").replace(" ", "T");
  const d = new Date(normalized);
  if (!isNaN(d.getTime())) {
    const yyyy = String(d.getFullYear());
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }
  const m = s.match(/(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) {
    const yyyy = m[1];
    const mm = String(m[2]).padStart(2, "0");
    const dd = String(m[3]).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }
  return "";
};

const buildWofPrintData = (record: WofCheckItem, context?: WofPrintContext): WofPrintData => {
  const makeModel = String(record.makeModel ?? "").trim() || String(context?.vehicleMakeModel ?? "").trim();
  const odoRaw = String(record.odo ?? "").trim();
  const odoText =
    odoRaw ||
    (context?.vehicleOdometer !== null && context?.vehicleOdometer !== undefined
      ? String(context.vehicleOdometer)
      : "");

  const inspectionDate = toYYYYMMDD(record.occurredAt);
  const isRecheck = record.recordState === "Recheck";

  return {
    jobId: String(context?.jobId ?? record.wofId ?? ""),
    recordId: String(record.id ?? ""),
    recordStateLabel: String(record.recordState ?? record.wofUiState ?? ""),
    rego: String(record.rego ?? ""),
    makeModel,
    nzFirstRegistration: String(context?.nzFirstRegistration ?? ""),
    vin: String(context?.vin ?? ""),
    odoText,
    organisationName: String(record.organisationName ?? ""),
    customerName: String(context?.customerName ?? ""),
    customerPhone: String(context?.customerPhone ?? ""),
    customerEmail: String(context?.customerEmail ?? ""),
    customerAddress: String(context?.customerAddress ?? ""),
    inspectionDate,
    inspectionNumber: String(record.id ?? ""),
    recheckDate: isRecheck ? inspectionDate : "",
    recheckNumber: String(record.id ?? ""),
    recheckOdo: isRecheck ? odoText : "",
    isNewWof: Boolean(record.isNewWof),
    newWofDate: toYYYYMMDD(record.newWofDate),
    authCode: String(record.authCode ?? ""),
    checkSheet: String(record.checkSheet ?? ""),
    csNo: String(record.csNo ?? ""),
    wofLabel: String(record.wofLabel ?? ""),
    labelNo: String(record.labelNo ?? ""),
    msNumber: "",
    failReasons: String(record.failReasons ?? ""),
    previousExpiryDate: toYYYYMMDD(record.previousExpiryDate),
    failRecheckDate: record.recordState === "Fail" ? formatNzDatePlusDays(28) : "",
    note: String(record.note ?? ""),
    placeholderDash: "---------",
    placeholderCheck: "√",
    placeholderMs: " MS6539   ",
    placeholderCode: "A21350 ",
  };
};

export function WofResultItem({
  record,
  printContext,
  onUpdate,
  onDelete,
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
  const [deleting, setDeleting] = useState(false);
  const [failReasonQuery, setFailReasonQuery] = useState("");
  const [selectedFailReason, setSelectedFailReason] = useState("");
  const { printTemplate } = useTemplatePrinter({
    onPopupBlocked: () => toast.error("无法打开打印窗口，请允许弹窗"),
  });

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
    setForm((prev) => ({ ...prev, occurredAt: formatNzDate(new Date()) }));
  }, [editing, form.occurredAt]);

  useEffect(() => {
    if (!editing) {
      setFailReasonQuery("");
    }
  }, [editing]);

  const mergedFailReasons = useMemo(() => {
    const base = String(record.failReasons ?? "").trim();
    const extra = base
      ? base
          .split(/[,;|\n]+/g)
          .map((item) => item.trim())
          .filter(Boolean)
      : [];
    const fromApi = Array.isArray(failReasons) ? failReasons : [];
    const map = new Map<string, { id: string; label: string }>();
    fromApi.forEach((reason) => {
      if (!reason?.label) return;
      map.set(reason.label, { id: reason.id, label: reason.label });
    });
    extra.forEach((label) => {
      if (!map.has(label)) {
        map.set(label, { id: `sheet:${label}`, label });
      }
    });
    return Array.from(map.values());
  }, [failReasons, record.failReasons]);

  const filteredFailReasons = useMemo(() => {
    const query = failReasonQuery.trim().toLowerCase();
    if (!query) return mergedFailReasons;
    return mergedFailReasons.filter((reason) => reason.label.toLowerCase().includes(query));
  }, [failReasonQuery, mergedFailReasons]);

  const appendFailReasonToNote = (label: string) => {
    const trimmed = label.trim();
    if (!trimmed) return;
    setForm((prev) => {
      const note = String(prev.note ?? "");
      const exists = note.toLowerCase().includes(trimmed.toLowerCase());
      const nextNote = exists ? note : note ? `${note}\n${trimmed}` : trimmed;
      const nextFailReasons = prev.failReasons?.trim() ? prev.failReasons : trimmed;
      return { ...prev, note: nextNote, failReasons: nextFailReasons };
    });
  };

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
    payload.occurredAt = toYYYYMMDD(form.occurredAt) || null;
    payload.previousExpiryDate = toYYYYMMDD(form.previousExpiryDate) || null;
    payload.newWofDate = toYYYYMMDD(form.newWofDate) || null;
    if (!isDraft) {
      payload.excelRowNo = null;
      payload.importedAt = null;
      delete (payload as { sourceFile?: string | null }).sourceFile;
    }
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

  const handlePrint = () => {
    const jobId = printContext?.jobId ?? record.wofId;
    const recordId = record.id;
    if (!jobId || !recordId) {
      const message = "无法打印：缺少 jobId 或 recordId。";
      setError(message);
      toast.error(message);
      return;
    }
    const payload: WofPrintData = buildWofPrintData(record, { ...printContext, jobId: String(jobId) });
    printTemplate({ type: "wof", data: payload });
    setMessage("已发送打印任务");
    toast.success("已发送打印任务");
  };

  const handleDelete = async () => {
    if (isDraft || !onDelete) return;
    if (!window.confirm("确定删除这条 WOF 记录？")) return;

    setDeleting(true);
    setMessage(null);
    setError(null);
    const response = await onDelete(record.id);
    setDeleting(false);

    if (response.success) {
      toast.success(response.message || "删除成功");
      return;
    }

    const nextMessage = response.message || "删除失败";
    setError(nextMessage);
    toast.error(nextMessage);
  };

  return (
    <div className="border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            {editing ? (
              <input
                type="date"
                className="h-7 rounded border px-2 text-xs"
                value={toYYYYMMDD(form.occurredAt)}
                onChange={(e) => handleChange("occurredAt", e.target.value)}
              />
            ) : (
              <span className="text-sm font-medium text-gray-900">{toYYYYMMDD(record.occurredAt) || "—"}</span>
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
            {!isDraft ? (
              <Button
                variant="ghost"
                className="text-red-600 hover:bg-red-50"
                leftIcon={<Trash2 className="h-4 w-4" />}
                onClick={() => {
                  void handleDelete();
                }}
                disabled={deleting || saving}
              >
                删除
              </Button>
            ) : null}
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
            <FieldRow label="New WOF Date">
              {editing ? (
                <input
                  type="date"
                  className="ml-2 rounded border px-2 py-1"
                  value={toYYYYMMDD(form.newWofDate)}
                  onChange={(e) => handleChange("newWofDate", e.target.value)}
                />
              ) : (
                record.newWofDate ? toYYYYMMDD(record.newWofDate) : "—"
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
              {record.source ?? "—"}
            </FieldRow>
            <FieldRow label="Source Row">
              {record.sourceRow ?? "—"}
            </FieldRow>
            <FieldRow label="Imported At">
              {formatUtcDateTime(record.importedAt)}
            </FieldRow>
            <FieldRow label="Updated At">{formatUtcDateTime(record.updatedAt)}</FieldRow>
          </div>

          <div className="grid grid-cols-1 gap-2 text-sm md:grid-cols-2 mt-2">
            {(editing ? ["Fail", "Recheck"].includes(form.recordState) : ["Fail", "Recheck"].includes(record.recordState ?? "")) ? (
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
                      value={selectedFailReason}
                      onChange={(e) => {
                        const value = e.target.value;
                        if (!value) return;
                        appendFailReasonToNote(value);
                        setSelectedFailReason("");
                      }}
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
            <FieldRow label="Previous Expiry Date">
              {editing ? (
                <input
                  type="date"
                  className="ml-2 rounded border px-2 py-1"
                  value={toYYYYMMDD(form.previousExpiryDate)}
                  onChange={(e) => handleChange("previousExpiryDate", e.target.value)}
                />
              ) : (
                record.previousExpiryDate ? toYYYYMMDD(record.previousExpiryDate) : "—"
              )}
            </FieldRow>
            {editing && record.failReasons ? (
              <FieldRow label="Sheet Fail Reason" className="text-xs text-gray-500 md:text-sm">
                {record.failReasons}
              </FieldRow>
            ) : null}
            <FieldRow label="Note">
              {editing ? (
                <textarea
                  className="ml-2 min-h-[72px] w-full rounded border px-2 py-1 text-sm"
                  value={form.note}
                  onChange={(e) => handleChange("note", e.target.value)}
                  rows={3}
                />
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
