import type React from "react";

type TagVariant = "primary" | "danger" | "neutral";

type TagPillProps = {
  label: string;
  variant?: TagVariant;
  className?: string;
  leftIcon?: React.ReactNode;
};

const variantClasses: Record<TagVariant, string> = {
  primary: "bg-[rgba(78,90,255,0.12)] text-[rgba(78,90,255,0.9)] border border-[rgba(78,90,255,0.2)]",
  danger: "bg-red-100 text-red-800 border border-red-200",
  neutral: "bg-gray-100 text-gray-800 border border-gray-200",
};

export function TagPill({ label, variant = "neutral", className = "" }: TagPillProps) {
  return (
    <span
      className={[
        "inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium",
        variantClasses[variant],
        className,
      ].join(" ")}
    >
      {/* {leftIcon} */}
      {label}
    </span>
  );
}
