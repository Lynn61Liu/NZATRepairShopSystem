import { useEffect, useMemo, useState } from "react";
import type { WofFailReason } from "@/types";
import { Button } from "@/components/ui";
import { JOB_DETAIL_TEXT } from "@/features/jobDetail/jobDetail.constants";
import { FormField } from "./FormField";

type WofResultFormProps = {
  failReasons: WofFailReason[];
  onSave?: (payload: {
    result: "Pass" | "Fail";
    expiryDate?: string;
    failReasonId?: string;
    note?: string;
  }) => Promise<{ success: boolean; message?: string }>;
};

export function WofResultForm({ failReasons, onSave }: WofResultFormProps) {
  const [result, setResult] = useState<"Pass" | "Fail">("Pass");
  const [expiryDate, setExpiryDate] = useState("");
  const [failReason, setFailReason] = useState("");
  const [note, setNote] = useState("");
  const [failReasonQuery, setFailReasonQuery] = useState("");
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!saveMessage) return;
    const timer = window.setTimeout(() => setSaveMessage(null), 5000);
    return () => window.clearTimeout(timer);
  }, [saveMessage]);

  useEffect(() => {
    if (!saveError) return;
    const timer = window.setTimeout(() => setSaveError(null), 5000);
    return () => window.clearTimeout(timer);
  }, [saveError]);

  useEffect(() => {
    if (result !== "Fail") {
      setFailReasonQuery("");
    }
  }, [result]);

  const filteredFailReasons = useMemo(() => {
    const query = failReasonQuery.trim().toLowerCase();
    if (!query) return failReasons;
    return failReasons.filter((reason) => reason.label.toLowerCase().includes(query));
  }, [failReasonQuery, failReasons]);

  const handleSave = async () => {
    if (!onSave) return;
    setSaveMessage(null);
    setSaveError(null);
    setSaving(true);
    const response = await onSave({
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

  return (
    <div className="mt-4 space-y-3 text-sm">
      <FormField label={JOB_DETAIL_TEXT.labels.initiateResult}>
        <select
          className="mt-2 h-9 w-full rounded-[8px] border border-[var(--ds-border)] px-3"
          value={result}
          onChange={(event) => setResult(event.target.value as "Pass" | "Fail")}
        >
          <option>Pass</option>
          <option>Fail</option>
        </select>
      </FormField>

      {result === "Fail" ? (
        <>
          <FormField label={JOB_DETAIL_TEXT.labels.expiryDate}>
            <input
              type="date"
              className="mt-2 h-9 w-full rounded-[8px] border border-[var(--ds-border)] px-3"
              value={expiryDate}
              onChange={(event) => setExpiryDate(event.target.value)}
            />
          </FormField>
          <FormField label={JOB_DETAIL_TEXT.labels.failReason}>
            <div className="mt-2 space-y-2">
              <input
                className="h-9 w-full rounded-[8px] border border-[var(--ds-border)] px-3"
                placeholder="输入字母筛选..."
                value={failReasonQuery}
                onChange={(event) => setFailReasonQuery(event.target.value)}
              />
              <select
                className="h-9 w-full rounded-[8px] border border-[var(--ds-border)] px-3"
                value={failReason}
                onChange={(event) => setFailReason(event.target.value)}
              >
                <option value="">Fail list...</option>
                {filteredFailReasons.map((reason) => (
                  <option key={reason.id} value={reason.id}>
                    {reason.label}
                  </option>
                ))}
              </select>
            </div>
          </FormField>
        </>
      ) : null}

      <FormField label={JOB_DETAIL_TEXT.labels.note}>
        <textarea
          className="mt-2 h-24 w-full rounded-[8px] border border-[var(--ds-border)] px-3 py-2"
          placeholder=""
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
      </FormField>

      <div className="mt-4 flex justify-end gap-2">
        {saveMessage ? <div className="text-xs text-green-600">{saveMessage}</div> : null}
        {saveError ? <div className="text-xs text-red-600">{saveError}</div> : null}
        <Button variant="primary" onClick={handleSave} disabled={saving}>
          {JOB_DETAIL_TEXT.buttons.saveResult}
        </Button>
      </div>
    </div>
  );
}
