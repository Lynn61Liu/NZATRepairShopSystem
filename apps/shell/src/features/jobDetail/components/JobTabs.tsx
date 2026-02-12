import { Tabs } from "@/components/ui";
import type { JobDetailTabKey } from "@/types";
import { jobDetailTabs } from "@/features/jobDetail";

type JobTabsProps = {
  activeTab: JobDetailTabKey;
  onChange: (key: JobDetailTabKey) => void;
};

export function JobTabs({ activeTab, onChange }: JobTabsProps) {
  return (
    <div className="border-b border-[var(--ds-border)] pb-3">
      <Tabs
        tabs={jobDetailTabs}
        activeKey={activeTab}
        onChange={(key) => onChange(key as JobDetailTabKey)}
      />
    </div>
  );
}
