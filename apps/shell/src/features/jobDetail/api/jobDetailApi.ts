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
