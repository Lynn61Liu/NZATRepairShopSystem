import type { ReactNode } from "react";

type FieldRowProps = {
  label: string;
  children: ReactNode;
  className?: string;
};

export function FieldRow({ label, children, className }: FieldRowProps) {
  return (
    <div className={["text-gray-600", className].filter(Boolean).join(" ")}>
      {label}: {children}
    </div>
  );
}
