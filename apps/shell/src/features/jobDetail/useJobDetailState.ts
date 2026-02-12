import { useState } from "react";
import type { JobDetailTabKey } from "@/types";

type UseJobDetailStateProps = {
  initialTab?: JobDetailTabKey;
  initialSidebarOpen?: boolean;
};

export function useJobDetailState({
  initialTab = "WOF",
  initialSidebarOpen = false,
}: UseJobDetailStateProps = {}) {
  const [activeTab, setActiveTab] = useState<JobDetailTabKey>(initialTab);
  const [isSidebarOpen, setIsSidebarOpen] = useState(initialSidebarOpen);

  return {
    activeTab,
    setActiveTab,
    isSidebarOpen,
    setIsSidebarOpen,
  };
}
