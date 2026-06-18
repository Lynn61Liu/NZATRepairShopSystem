import type React from "react";

type CardProps = {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  role?: string;
};

export function Card({ children, className = "", onClick, role }: CardProps) {
  return (
    <div
      onClick={onClick}
      role={role}
      className={[
        "rounded-[12px] border border-[var(--ds-border)] bg-white shadow-sm",
        className,
      ].join(" ")}
    >
      {children}
    </div>
  );
}
