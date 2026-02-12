import type { ReactNode } from "react";

type FormFieldProps = {
  label: string;
  children: ReactNode;
};

export function FormField({ label, children }: FormFieldProps) {
  return (
    <div>
      <div className="text-xs text-[var(--ds-muted)]">{label}</div>
      {children}
    </div>
  );
}
