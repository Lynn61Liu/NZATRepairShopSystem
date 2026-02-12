import type { WofRecordUpdatePayload } from "@/types";
import { requestJson } from "@/utils/api";

export function fetchWofServer(jobId: string) {
  return requestJson<any>(`/api/jobs/${encodeURIComponent(jobId)}/wof-server`);
}

export function createWofServer(jobId: string) {
  return requestJson<any>(`/api/jobs/${encodeURIComponent(jobId)}/wof-server`, { method: "POST" });
}

export function deleteWofServer(jobId: string) {
  return requestJson<any>(`/api/jobs/${encodeURIComponent(jobId)}/wof-server`, { method: "DELETE" });
}

export function createWofResult(
  jobId: string,
  payload: { result: "Pass" | "Fail"; expiryDate?: string; failReasonId?: string; note?: string }
) {
  return requestJson<any>(`/api/jobs/${encodeURIComponent(jobId)}/wof-results`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      result: payload.result,
      recheckExpiryDate: payload.expiryDate || null,
      failReasonId: payload.failReasonId ? Number(payload.failReasonId) : null,
      note: payload.note || "",
    }),
  });
}

export function importWofRecords(jobId: string) {
  return requestJson<any>(`/api/jobs/${encodeURIComponent(jobId)}/wof-records/import`, { method: "POST" });
}

export function createWofRecord(jobId: string, payload: WofRecordUpdatePayload) {
  return requestJson<any>(`/api/jobs/${encodeURIComponent(jobId)}/wof-records`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function updateWofRecord(jobId: string, recordId: string, payload: WofRecordUpdatePayload) {
  return requestJson<any>(`/api/jobs/${encodeURIComponent(jobId)}/wof-records/${encodeURIComponent(recordId)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function fetchWofFailReasons() {
  return requestJson<any>("/api/wof-fail-reasons");
}
