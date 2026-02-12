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

export function updateJobTags(jobId: string, tagIds: number[]) {
  return requestJson<any>(`/api/jobs/${encodeURIComponent(jobId)}/tags`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tagIds }),
  });
}
