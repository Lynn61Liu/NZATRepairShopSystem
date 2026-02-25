import { Tabs } from "@/components/ui";
import type { JobDetailTabKey } from "@/types";
import { jobDetailTabs } from "@/features/jobDetail";

type JobTabsProps = {
  activeTab: JobDetailTabKey;
  onChange: (key: JobDetailTabKey) => void;
  tabs?: { key: JobDetailTabKey; label: string }[];
};

export function JobTabs({ activeTab, onChange, tabs = jobDetailTabs }: JobTabsProps) {
  return (
    <div className="border-b border-[var(--ds-border)] pb-3">
      <Tabs
        tabs={tabs}
        activeKey={activeTab}
        onChange={(key) => onChange(key as JobDetailTabKey)}
      />
    </div>
  );
}
