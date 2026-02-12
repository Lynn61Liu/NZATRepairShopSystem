import { requestJson } from "@/utils/api";

export function fetchPartsServices(jobId: string) {
  return requestJson<any>(`/api/jobs/${encodeURIComponent(jobId)}/parts-services`);
}

export function createPartsService(jobId: string, payload: { description: string; status?: string }) {
  return requestJson<any>(`/api/jobs/${encodeURIComponent(jobId)}/parts-services`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function updatePartsService(
  jobId: string,
  serviceId: string,
  payload: { description?: string; status?: string }
) {
  return requestJson<any>(`/api/jobs/${encodeURIComponent(jobId)}/parts-services/${encodeURIComponent(serviceId)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function deletePartsService(jobId: string, serviceId: string) {
  return requestJson<any>(`/api/jobs/${encodeURIComponent(jobId)}/parts-services/${encodeURIComponent(serviceId)}`, {
    method: "DELETE",
  });
}

export function createPartsNote(jobId: string, serviceId: string, note: string) {
  return requestJson<any>(`/api/jobs/${encodeURIComponent(jobId)}/parts-services/${encodeURIComponent(serviceId)}/notes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ note }),
  });
}

export function updatePartsNote(jobId: string, noteId: string, note: string) {
  return requestJson<any>(`/api/jobs/${encodeURIComponent(jobId)}/parts-notes/${encodeURIComponent(noteId)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ note }),
  });
}

export function deletePartsNote(jobId: string, noteId: string) {
  return requestJson<any>(`/api/jobs/${encodeURIComponent(jobId)}/parts-notes/${encodeURIComponent(noteId)}`, {
    method: "DELETE",
  });
}
