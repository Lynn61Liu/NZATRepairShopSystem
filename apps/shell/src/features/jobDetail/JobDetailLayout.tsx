import type React from "react";

type JobDetailLayoutProps = {
  main: React.ReactNode;
  sidebar: React.ReactNode;
};

export function JobDetailLayout({ main, sidebar }: JobDetailLayoutProps) {
  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      {main}
      {sidebar}
    </div>
  );
}
