import { SectionCard } from "@/components/ui";
import { JOB_DETAIL_TEXT } from "@/features/jobDetail/jobDetail.constants";

export function LogPanel() {
  return (
    <div className="py-6 text-sm text-[var(--ds-muted)]">
      <SectionCard className="p-4">
        {JOB_DETAIL_TEXT.empty.noLogs}
      </SectionCard>
    </div>
  );
}
