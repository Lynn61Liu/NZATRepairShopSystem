import type React from "react";

type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement>;

export function Select({ className = "", ...props }: SelectProps) {
  return (
    <select
      {...props}
      className={[
        "h-9 w-full rounded-[8px] border border-[rgba(0,0,0,0.10)] bg-white px-3 text-sm",
        "outline-none focus:border-[rgba(37,99,235,0.45)] focus:ring-2 focus:ring-[rgba(37,99,235,0.12)]",
        className,
      ].join(" ")}
    />
  );
}
