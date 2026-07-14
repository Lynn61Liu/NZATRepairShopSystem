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

export function updateJobPrivateNotes(jobId: string, privateNotes: string) {
  return requestJson<any>(`/api/jobs/${encodeURIComponent(jobId)}/private-notes`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ privateNotes }),
  });
}

export type JobLightBindingResponse = {
  id: number;
  jobId: number;
  plate: string;
  stationId: string;
  tagId: string;
  groupNo: number;
  status: string;
  failureReason?: string | null;
  lastResultAt?: string | null;
};

export function createJobLightBinding(jobId: string, tagId: string) {
  return requestJson<JobLightBindingResponse>(`/api/jobs/${encodeURIComponent(jobId)}/light-bindings`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tagId }),
  });
}

export function fetchJobLightBindings(jobId: string) {
  return requestJson<JobLightBindingResponse[]>(`/api/jobs/${encodeURIComponent(jobId)}/light-bindings`);
}

export function lightOnJobLightBinding(bindingId: number) {
  return requestJson<JobLightBindingResponse>(`/api/estation/light-bindings/${encodeURIComponent(String(bindingId))}/light-on`, {
    method: "POST",
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

export function syncVehicleNztaInfo(jobId: string) {
  return requestJson<any>(`/api/jobs/${encodeURIComponent(jobId)}/vehicle/nzta-sync`, {
    method: "POST",
  });
}

export function updateJobCustomer(
  jobId: string,
  payload:
    | { type: "Business"; customerId: string }
    | { type: "Personal"; name: string; phone?: string | null; email?: string | null; address?: string | null; notes?: string | null }
) {
  return requestJson<any>(`/api/jobs/${encodeURIComponent(jobId)}/customer`, {
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

export function pullJobXeroDraftInvoice(jobId: string) {
  return requestJson<any>(`/api/jobs/${encodeURIComponent(jobId)}/xero-draft-invoice/pull`, {
    method: "POST",
  });
}

export function pullJobXeroDraftInvoicePdf(jobId: string) {
  return requestJson<any>(`/api/jobs/${encodeURIComponent(jobId)}/xero-draft-invoice/pdf/pull`, {
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
