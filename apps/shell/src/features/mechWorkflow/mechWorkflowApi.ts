import { requestJson } from "@/utils/api";
import type { MechBoardJob, MechWorkflow, MechWorkflowStatus } from "./mechWorkflow";

export type MechBoardSortOrder = "newest_first" | "oldest_first";
export type MechBoardSettings = { sortOrder: MechBoardSortOrder };

export function fetchMechBoard() {
  return requestJson<{ jobs: MechBoardJob[]; settings: MechBoardSettings }>("/api/mech-board", { cache: "no-store" });
}

export function updateMechBoardSettings(sortOrder: MechBoardSortOrder) {
  return requestJson<MechBoardSettings>("/api/mech-board/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sortOrder }),
  });
}

export function fetchMechWorkflow(jobId: string) {
  return requestJson<MechWorkflow>(`/api/jobs/${encodeURIComponent(jobId)}/mech-workflow`, { cache: "no-store" });
}

export function updateMechWorkflow(
  jobId: string,
  status: MechWorkflowStatus,
  options?: { direct?: boolean }
) {
  return requestJson<MechWorkflow>(`/api/jobs/${encodeURIComponent(jobId)}/mech-workflow`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status, direct: options?.direct === true }),
  });
}
