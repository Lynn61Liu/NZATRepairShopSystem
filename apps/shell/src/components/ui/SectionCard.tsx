import type React from "react";
import { Card } from "./Card";

type SectionCardProps = {
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
};

export function SectionCard({ title, subtitle, actions, className = "", children }: SectionCardProps) {
  return (
    <Card className={["p-4", className].join(" ")}>
      {(title || subtitle || actions) && (
        <div className="flex items-start justify-between gap-3">
          <div>
            {title ? <div className="text-sm font-semibold">{title}</div> : null}
            {subtitle ? <div className="text-xs text-[var(--ds-muted)]">{subtitle}</div> : null}
          </div>
          {actions ? <div className="shrink-0">{actions}</div> : null}
        </div>
      )}
      {children}
    </Card>
  );
}
