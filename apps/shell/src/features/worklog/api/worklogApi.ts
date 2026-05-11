import { requestJson } from "@/utils/api";

export function fetchWorklogs(jobId?: string) {
  const query = jobId ? `?jobId=${encodeURIComponent(jobId)}` : "";
  return requestJson<any[]>(`/api/worklogs${query}`);
}

export function createWorklog(payload: {
  jobId: string;
  staffId: string;
  serviceType: string;
  workDate: string;
  startTime: string;
  endTime: string;
  adminNote?: string;
  source?: string;
}) {
  return requestJson<any>("/api/worklogs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function updateWorklog(
  id: string,
  payload: {
    jobId?: string;
    staffId?: string;
    serviceType?: string;
    workDate?: string;
    startTime?: string;
    endTime?: string;
    adminNote?: string;
    source?: string;
  }
) {
  return requestJson<any>(`/api/worklogs/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function deleteWorklog(id: string) {
  return requestJson<any>(`/api/worklogs/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export function fetchStaff() {
  return requestJson<any[]>("/api/staff");
}

export function createStaff(payload: { name: string; costRate: number }) {
  return requestJson<any>("/api/staff", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function updateStaff(id: string, payload: { name?: string; costRate?: number }) {
  return requestJson<any>(`/api/staff/${encodeURIComponent(id)}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export function deleteStaff(id: string, force = false) {
  const query = force ? "?force=true" : "";
  return requestJson<any>(`/api/staff/${encodeURIComponent(id)}${query}`, {
    method: "DELETE",
  });
}
