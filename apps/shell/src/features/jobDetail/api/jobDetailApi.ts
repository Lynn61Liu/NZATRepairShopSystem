import { requestJson } from "@/utils/api";

export function fetchJob(jobId: string) {
  return requestJson<any>(`/api/jobs/${encodeURIComponent(jobId)}`);
}

export function deleteJob(jobId: string) {
  return requestJson<any>(`/api/jobs/${encodeURIComponent(jobId)}`, { method: "DELETE" });
}

export function fetchTags() {
  return requestJson<any>("/api/tags");
}

export function updateJobTags(jobId: string, tagIds: number[], tagNames?: string[]) {
  return requestJson<any>(`/api/jobs/${encodeURIComponent(jobId)}/tags`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tagIds, tagNames }),
  });
}

export function updateJobStatus(jobId: string, status: string) {
  return requestJson<any>(`/api/jobs/${encodeURIComponent(jobId)}/status`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
}

export function updateJobCreatedAt(jobId: string, date: string) {
  return requestJson<any>(`/api/jobs/${encodeURIComponent(jobId)}/created-at`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ date }),
  });
}

export function updateJobNotes(jobId: string, notes: string) {
  return requestJson<any>(`/api/jobs/${encodeURIComponent(jobId)}/notes`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ notes }),
  });
}

export function updateJobPoSelection(jobId: string, payload: { poNumber?: string; invoiceReference?: string }) {
  return requestJson<any>(`/api/jobs/${encodeURIComponent(jobId)}/po-selection`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function updateVehicleInfo(
  jobId: string,
  payload: { year?: number | null; make?: string | null; fuelType?: string | null; vin?: string | null; nzFirstRegistration?: string | null }
) {
  return requestJson<any>(`/api/jobs/${encodeURIComponent(jobId)}/vehicle`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function createJobXeroDraftInvoice(jobId: string) {
  return requestJson<any>(`/api/jobs/${encodeURIComponent(jobId)}/xero-draft-invoice`, {
    method: "POST",
  });
}

export function attachJobXeroInvoice(jobId: string, invoiceNumber: string) {
  return requestJson<any>(`/api/jobs/${encodeURIComponent(jobId)}/xero-draft-invoice/attach`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ invoiceNumber }),
  });
}

export function detachJobXeroInvoice(jobId: string) {
  return requestJson<any>(`/api/jobs/${encodeURIComponent(jobId)}/xero-draft-invoice`, {
    method: "DELETE",
  });
}

export function syncJobXeroDraftInvoice(jobId: string, payload: unknown) {
  return requestJson<any>(`/api/jobs/${encodeURIComponent(jobId)}/xero-draft-invoice`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function saveJobInvoiceDraft(jobId: string, payload: unknown) {
  return requestJson<any>(`/api/jobs/${encodeURIComponent(jobId)}/invoice-draft`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function pullJobXeroDraftInvoice(jobId: string) {
  return requestJson<any>(`/api/jobs/${encodeURIComponent(jobId)}/xero-draft-invoice/pull`, {
    method: "POST",
  });
}

export function updateJobInvoiceXeroState(jobId: string, payload: unknown) {
  return requestJson<any>(`/api/jobs/${encodeURIComponent(jobId)}/xero-draft-invoice/state`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function createXeroInvoice(payload: unknown) {
  return requestJson<any>("/api/xero/invoices?summarizeErrors=true", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}
