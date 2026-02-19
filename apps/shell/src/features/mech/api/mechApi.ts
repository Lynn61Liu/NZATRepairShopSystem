import { requestJson } from "@/utils/api";

export function fetchMechServices(jobId: string) {
  return requestJson<any>(`/api/jobs/${encodeURIComponent(jobId)}/mech-services`);
}

export function createMechService(jobId: string, payload: { description: string; cost?: number | null }) {
  return requestJson<any>(`/api/jobs/${encodeURIComponent(jobId)}/mech-services`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function updateMechService(
  jobId: string,
  serviceId: string,
  payload: { description?: string; cost?: number | null }
) {
  return requestJson<any>(`/api/jobs/${encodeURIComponent(jobId)}/mech-services/${encodeURIComponent(serviceId)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function deleteMechService(jobId: string, serviceId: string) {
  return requestJson<any>(`/api/jobs/${encodeURIComponent(jobId)}/mech-services/${encodeURIComponent(serviceId)}`, {
    method: "DELETE",
  });
}
