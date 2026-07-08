import { requestJson } from "@/utils/api";
import type {
  CompletePoResponse,
  ConfirmPoResponse,
  PoDraftPreview,
  PoTodoActionResponse,
  PoTodoListResponse,
  PoTodoSyncResponse,
  PoTodoTab,
} from "./poTodo.types";

export async function fetchPoTodo(tab: PoTodoTab): Promise<PoTodoListResponse> {
  const query = new URLSearchParams({ status: tab });
  const res = await requestJson<PoTodoListResponse>(`/api/po/todo?${query.toString()}`);
  if (!res.ok || !res.data) {
    throw new Error(res.error || "Failed to load PO TODO list");
  }
  return res.data;
}

export async function syncPoTodo(): Promise<PoTodoSyncResponse> {
  const res = await requestJson<PoTodoSyncResponse>("/api/po/todo/sync", { method: "POST" });
  if (!res.ok || !res.data) {
    throw new Error(res.error || "Failed to sync PO TODO list");
  }
  return res.data;
}

export async function manualConfirmPoSent(jobId: number): Promise<PoTodoActionResponse> {
  const res = await requestJson<PoTodoActionResponse>(`/api/po/jobs/${encodeURIComponent(String(jobId))}/manual-confirm-sent`, {
    method: "POST",
  });
  if (!res.ok || !res.data) {
    throw new Error(res.error || "Failed to mark PO email as sent");
  }
  return res.data;
}

export async function confirmPoNumber(jobId: number, poNumber: string): Promise<ConfirmPoResponse> {
  const res = await requestJson<ConfirmPoResponse>(`/api/po/jobs/${encodeURIComponent(String(jobId))}/confirm-po`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ poNumber }),
  });
  if (!res.data) {
    throw new Error(res.error || "Failed to confirm PO");
  }
  return res.data;
}

export async function completePoJobs(jobIds: number[]): Promise<CompletePoResponse> {
  const res = await requestJson<CompletePoResponse>("/api/po/jobs/complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jobIds }),
  });
  if (!res.ok || !res.data) {
    throw new Error(res.error || "Failed to complete PO jobs");
  }
  return res.data;
}

export async function fetchPoDraftPreview(jobId: number): Promise<PoDraftPreview> {
  const res = await requestJson<PoDraftPreview>(`/api/po/jobs/${encodeURIComponent(String(jobId))}/draft-preview`);
  if (!res.ok || !res.data) {
    throw new Error(res.error || "Failed to load PO draft preview");
  }
  return res.data;
}
