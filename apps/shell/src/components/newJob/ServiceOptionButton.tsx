import type React from "react";

type ServiceOptionButtonProps = {
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  selected: boolean;
  onClick: () => void;
};

export function ServiceOptionButton({ label, icon: Icon, selected, onClick }: ServiceOptionButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "flex flex-col items-center justify-center gap-2 p-4 rounded-[8px] border-2 transition",
        selected
          ? "border-[var(--ds-primary)] bg-[rgba(37,99,235,0.08)]"
          : "border-[rgba(0,0,0,0.10)] bg-white hover:border-[rgba(0,0,0,0.15)]",
      ].join(" ")}
    >
      <Icon size={24} className={selected ? "text-[var(--ds-primary)]" : "text-[rgba(0,0,0,0.45)]"} />
      <span
        className={[
          "text-sm font-medium",
          selected ? "text-[var(--ds-primary)]" : "text-[rgba(0,0,0,0.70)]",
        ].join(" ")}
      >
        {label}
      </span>
    </button>
  );
}
