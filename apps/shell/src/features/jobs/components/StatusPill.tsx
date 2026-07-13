import type { JobStatus } from "@/types/JobType";
import { JOB_STATUS_LABELS, JOB_STATUS_STYLES } from "@/features/jobs/jobs.constants";

export function StatusPill({ status }: { status: JobStatus | string | null | undefined }) {
  const normalizedStatus = status === "In Shop" || status === "InProgress" ? "In Progress" : status;
  const knownStatus = normalizedStatus && normalizedStatus in JOB_STATUS_STYLES
    ? normalizedStatus as JobStatus
    : "Pending";
  const style = JOB_STATUS_STYLES[knownStatus];
  const label = normalizedStatus && normalizedStatus in JOB_STATUS_LABELS
    ? JOB_STATUS_LABELS[normalizedStatus as JobStatus]
    : normalizedStatus || JOB_STATUS_LABELS.Pending;

  return (
    <span
      className={[
        "inline-flex items-center gap-2 rounded-[8px] border px-2 py-1 text-[11px] font-medium",
        style.bg,
        style.bd,
        style.tx,
      ].join(" ")}
    >
      <span className={["h-1.5 w-1.5 rounded-full", style.dot].join(" ")} />
      {label}
    </span>
  );
}
