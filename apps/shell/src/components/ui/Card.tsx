import type React from "react";

type CardProps = {
  children: React.ReactNode;
  className?: string;
};

export function Card({ children, className = "" }: CardProps) {
  return (
    <div
      className={[
        "rounded-[12px] border border-[var(--ds-border)] bg-white shadow-sm",
        className,
      ].join(" ")}
    >
      {children}
    </div>
  );
}
