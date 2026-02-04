import { useEffect, useState } from "react";
import type { WofCheckItem, WofRecordUpdatePayload } from "@/types";
import { Button } from "../ui";
import { JOB_DETAIL_TEXT } from "@/features/jobDetail/jobDetail.constants";

interface WofResultsCardProps {
  wofResults: WofCheckItem[];
  onUpdate?: (id: string, payload: WofRecordUpdatePayload) => Promise<{ success: boolean; message?: string }>;
}

type FormState = {
  occurredAt: string;
  rego: string;
  makeModel: string;
  odo: string;
  recordState: "" | "Pass" | "Fail" | "Recheck";
  isNewWof: "" | "true" | "false";
  authCode: string;
  checkSheet: string;
  csNo: string;
  wofLabel: string;
  labelNo: string;
  failReasons: string;
  previousExpiryDate: string;
  organisationName: string;
  excelRowNo: string;
  sourceFile: string;
  note: string;
  wofUiState: "" | "Pass" | "Fail" | "Recheck" | "Printed";
  importedAt: string;
  updatedAt: string;
};

function toFormState(record: WofCheckItem): FormState {
  return {
    occurredAt: record.occurredAt ?? "",
    rego: record.rego ?? "",
    makeModel: record.makeModel ?? "",
    odo: record.odo ?? "",
    recordState: record.recordState ?? "",
    isNewWof:
      record.isNewWof === null || record.isNewWof === undefined
        ? ""
        : record.isNewWof
          ? "true"
          : "false",
    authCode: record.authCode ?? "",
    checkSheet: record.checkSheet ?? "",
    csNo: record.csNo ?? "",
    wofLabel: record.wofLabel ?? "",
    labelNo: record.labelNo ?? "",
    failReasons: record.failReasons ?? "",
    previousExpiryDate: record.previousExpiryDate ?? "",
    organisationName: record.organisationName ?? "",
    excelRowNo: record.sourceRow ?? "",
    sourceFile: record.source ?? "",
    note: record.note ?? "",
    wofUiState: record.wofUiState ?? "",
    importedAt: record.importedAt ?? "",
    updatedAt: record.updatedAt ?? "",
  };
}

function buildPayload(form: FormState): WofRecordUpdatePayload {
  return {
    occurredAt: form.occurredAt || null,
    rego: form.rego || null,
    makeModel: form.makeModel || null,
    odo: form.odo || null,
    recordState: form.recordState || null,
    isNewWof: form.isNewWof === "" ? null : form.isNewWof === "true",
    authCode: form.authCode || null,
    checkSheet: form.checkSheet || null,
    csNo: form.csNo || null,
    wofLabel: form.wofLabel || null,
    labelNo: form.labelNo || null,
    failReasons: form.failReasons || null,
    previousExpiryDate: form.previousExpiryDate || null,
    organisationName: form.organisationName || null,
    excelRowNo: form.excelRowNo ? Number(form.excelRowNo) : null,
    sourceFile: form.sourceFile || null,
    note: form.note || null,
    wofUiState: form.wofUiState || null,
    importedAt: form.importedAt || null,
  };
}

function WofResultItem({
  record,
  onUpdate,
}: {
  record: WofCheckItem;
  onUpdate?: (id: string, payload: WofRecordUpdatePayload) => Promise<{ success: boolean; message?: string }>;
}) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<FormState>(() => toFormState(record));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setForm(toFormState(record));
  }, [record.id, record.updatedAt]);

  const handleChange = (key: keyof FormState, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    if (!onUpdate) return;
    setSaving(true);
    setMessage(null);
    setError(null);
    const response = await onUpdate(record.id, buildPayload(form));
    setSaving(false);
    if (response.success) {
      setMessage(response.message || "保存成功");
      setEditing(false);
    } else {
      setError(response.message || "保存失败");
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            {editing ? (
              <input
                className="h-7 rounded border px-2 text-xs"
                value={form.occurredAt}
                onChange={(e) => handleChange("occurredAt", e.target.value)}
              />
            ) : (
              <span className="text-sm font-medium text-gray-900">{record.occurredAt ?? "—"}</span>
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
            ) : record.recordState ? (
              <span
                className={`px-2 py-0.5 rounded-full text-xs font-medium ${record.recordState === "Pass"
                  ? "bg-green-100 text-green-800"
                  : record.recordState === "Recheck"
                    ? "bg-yellow-100 text-yellow-800"
                    : "bg-red-100 text-red-800"}`}
              >
                {record.recordState}
              </span>
            ) : null}
            {record.recordState === "Fail" && record.previousExpiryDate ? (
              <span className="text-xs text-red-600">Expiry recheck Date: {record.previousExpiryDate}</span>
            ) : null}
            <Button className="ml-auto" variant="primary" onClick={handlePrint}>
              {JOB_DETAIL_TEXT.buttons.print}
            </Button>
            <Button variant="ghost" onClick={() => setEditing((v) => !v)}>
              {editing ? "取消" : "修改"}
            </Button>
            {editing ? (
              <Button variant="primary" onClick={handleSave} disabled={saving}>
                保存
              </Button>
            ) : null}
          </div>

          {message ? <div className="text-xs text-green-600 mb-2">{message}</div> : null}
          {error ? <div className="text-xs text-red-600 mb-2">{error}</div> : null}

          <div className="grid grid-cols-1 gap-2 text-sm md:grid-cols-2">
            
           
            <div className="text-gray-600">
              Odometer:{" "}
              {editing ? (
                <input className="ml-2 rounded border px-2 py-1" value={form.odo} onChange={(e) => handleChange("odo", e.target.value)} />
              ) : (
                record.odo ?? "—"
              )}
            </div>
         
            <div className="text-gray-600">
              Auth Code:{" "}
              {editing ? (
                <input className="ml-2 rounded border px-2 py-1" value={form.authCode} onChange={(e) => handleChange("authCode", e.target.value)} />
              ) : (
                record.authCode ?? "—"
              )}
            </div>
            <div className="text-gray-600">
              Check Sheet:{" "}
              {editing ? (
                <input className="ml-2 rounded border px-2 py-1" value={form.checkSheet} onChange={(e) => handleChange("checkSheet", e.target.value)} />
              ) : (
                record.checkSheet ?? "—"
              )}
            </div>
            <div className="text-gray-600">
              CS No:{" "}
              {editing ? (
                <input className="ml-2 rounded border px-2 py-1" value={form.csNo} onChange={(e) => handleChange("csNo", e.target.value)} />
              ) : (
                record.csNo ?? "—"
              )}
            </div>
            <div className="text-gray-600">
              WOF Label:{" "}
              {editing ? (
                <input className="ml-2 rounded border px-2 py-1" value={form.wofLabel} onChange={(e) => handleChange("wofLabel", e.target.value)} />
              ) : (
                record.wofLabel ?? "—"
              )}
            </div>
            <div className="text-gray-600">
              Label No:{" "}
              {editing ? (
                <input className="ml-2 rounded border px-2 py-1" value={form.labelNo} onChange={(e) => handleChange("labelNo", e.target.value)} />
              ) : (
                record.labelNo ?? "—"
              )}
            </div>
            
          
            <div className="text-gray-600">
              Source File:{" "}
              {editing ? (
                <input className="ml-2 rounded border px-2 py-1" value={form.sourceFile} onChange={(e) => handleChange("sourceFile", e.target.value)} />
              ) : (
                record.source ?? "—"
              )}
            </div>
            <div className="text-gray-600">
              Source Row:{" "}
              {editing ? (
                <input className="ml-2 rounded border px-2 py-1" value={form.excelRowNo} onChange={(e) => handleChange("excelRowNo", e.target.value)} />
              ) : (
                record.sourceRow ?? "—"
              )}
            </div>
         
            <div className="text-gray-600">
              Imported At:{" "}
              {editing ? (
                <input className="ml-2 rounded border px-2 py-1" value={form.importedAt} onChange={(e) => handleChange("importedAt", e.target.value)} />
              ) : (
                record.importedAt ?? "—"
              )}
            </div>
            <div className="text-gray-600">
              Updated At: {record.updatedAt ?? "—"}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 text-sm md:grid-cols-2 mt-2">
            {record.recordState === "Fail" ? (
              <div className="text-xs text-gray-500 md:text-sm">
                Fail Reason:{" "}
                {editing ? (
                  <input className="ml-2 rounded border px-2 py-1" value={form.failReasons} onChange={(e) => handleChange("failReasons", e.target.value)} />
                ) : (
                  record.failReasons ?? "—"
                )}
              </div>
            ) : null}
            <div className="text-gray-600">
              Note:{" "}
              {editing ? (
                <input className="ml-2 rounded border px-2 py-1" value={form.note} onChange={(e) => handleChange("note", e.target.value)} />
              ) : (
                record.note ?? "—"
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function WofResultsCard({ wofResults, onUpdate }: WofResultsCardProps) {
  return (
    <div className="space-y-3">
      {wofResults.map((record) => (
        <WofResultItem key={record.id} record={record} onUpdate={onUpdate} />
      ))}
    </div>
  );
}
