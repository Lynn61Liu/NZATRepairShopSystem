import type React from "react";
import { SectionCard } from "@/components/ui";

type SidebarSectionProps = {
  title: string;
  children: React.ReactNode;
};

export function SidebarSection({ title, children }: SidebarSectionProps) {
  return (
    <SectionCard title={title} className="p-3">
      <div className="mt-2 space-y-2">{children}</div>
    </SectionCard>
  );
}
