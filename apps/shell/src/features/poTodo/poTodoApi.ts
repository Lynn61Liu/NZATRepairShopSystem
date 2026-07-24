import { requestJson } from "@/utils/api";
import type {
  CompletePoResponse,
  ConfirmPoBatchResponse,
  ConfirmPoResponse,
  PoDraftPreview,
  PoTodoActionResponse,
  PoTodoListResponse,
  PoTodoTab,
  PoXeroSummary,
} from "./poTodo.types";

export async function fetchPoTodo(tab?: PoTodoTab, page = 1, pageSize = 15): Promise<PoTodoListResponse> {
  if (!tab) {
    const res = await requestJson<PoTodoListResponse>("/api/po/todo", { cache: "no-store" });
    if (!res.ok || !res.data) {
      throw new Error(res.error || "Failed to load PO TODO list");
    }
    return res.data;
  }

  const query = new URLSearchParams({ status: tab, page: String(page), pageSize: String(pageSize) });
  const queryString = query.toString();
  const res = await requestJson<PoTodoListResponse>(`/api/po/todo${queryString ? `?${queryString}` : ""}`, {
    cache: "no-store",
  });
  if (!res.ok || !res.data) {
    throw new Error(res.error || "Failed to load PO TODO list");
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

export async function confirmPoNumber(jobId: number, poNumber: string, sendInvoice = false): Promise<ConfirmPoResponse> {
  const res = await requestJson<ConfirmPoResponse>(`/api/po/jobs/${encodeURIComponent(String(jobId))}/confirm-po`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ poNumber, sendInvoice }),
  });
  if (!res.data) {
    throw new Error(res.error || "Failed to confirm PO");
  }
  return res.data;
}

export async function confirmPoBatch(
  items: Array<{ jobId: number; poNumber: string }>,
  sendInvoice = false
): Promise<ConfirmPoBatchResponse> {
  const res = await requestJson<ConfirmPoBatchResponse>("/api/po/jobs/confirm-po-batch", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items, sendInvoice }),
  });
  if (!res.ok || !res.data) throw new Error(res.error || "Failed to confirm selected PO jobs");
  return res.data;
}

export async function refreshPoXeroSummaries(jobIds: number[]): Promise<PoXeroSummary[]> {
  const res = await requestJson<{ items: PoXeroSummary[] }>("/api/po/jobs/xero-summaries", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jobIds }),
  });
  if (!res.ok || !res.data) throw new Error(res.error || "Failed to refresh Xero subtotals");
  return res.data.items;
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
