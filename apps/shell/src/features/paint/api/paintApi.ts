import { requestJson } from "@/utils/api";

export function fetchPaintService(jobId: string) {
  return requestJson<any>(`/api/jobs/${encodeURIComponent(jobId)}/paint-service`);
}

export function createPaintService(jobId: string, status?: string, panels?: number) {
  return requestJson<any>(`/api/jobs/${encodeURIComponent(jobId)}/paint-service`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status, panels }),
  });
}

export function updatePaintStage(jobId: string, stageIndex: number) {
  return requestJson<any>(`/api/jobs/${encodeURIComponent(jobId)}/paint-service/stage`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ stageIndex }),
  });
}

export function updatePaintPanels(jobId: string, panels: number) {
  return requestJson<any>(`/api/jobs/${encodeURIComponent(jobId)}/paint-service/panels`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ panels }),
  });
}

export function deletePaintService(jobId: string) {
  return requestJson<any>(`/api/jobs/${encodeURIComponent(jobId)}/paint-service`, {
    method: "DELETE",
  });
}
