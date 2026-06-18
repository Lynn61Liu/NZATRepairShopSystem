import type { ReactNode } from "react";
import type { CourtesyCarStatus } from "../courtesyCars.types";

type CourtesyCarStatusTone = "light" | "dark";

const statusMap: Record<
  CourtesyCarStatusTone,
  Record<CourtesyCarStatus, { label: string; className: string; dotClassName: string }>
> = {
  light: {
    available: {
      label: "Available",
      className: "bg-emerald-100 text-emerald-700",
      dotClassName: "bg-emerald-700 ring-2 ring-white/90",
    },
    on_loan: {
      label: "On Loan",
      className: "bg-blue-100 text-blue-700",
      dotClassName: "bg-red-500",
    },
    unavailable: {
      label: "Unavailable",
      className: "bg-amber-100 text-amber-700",
      dotClassName: "bg-amber-500",
    },
  },
  dark: {
    available: {
      label: "Available",
      className: "bg-white/20 text-white ring-1 ring-white/20",
      dotClassName: "bg-emerald-400 ring-2 ring-white/80",
    },
    on_loan: {
      label: "On Loan",
      className: "bg-white/20 text-white ring-1 ring-white/20",
      dotClassName: "bg-red-400",
    },
    unavailable: {
      label: "Unavailable",
      className: "bg-white/20 text-white ring-1 ring-white/20",
      dotClassName: "bg-amber-400",
    },
  },
};

export function CourtesyCarStatusBadge({
  status,
  className = "",
  trailing,
  tone = "light",
  onClick,
  title,
}: {
  status: CourtesyCarStatus;
  className?: string;
  trailing?: ReactNode;
  tone?: CourtesyCarStatusTone;
  onClick?: () => void;
  title?: string;
}) {
  const meta = statusMap[tone][status];
  const content = (
    <>
      <span className={["h-2.5 w-2.5 rounded-full", meta.dotClassName].join(" ")} aria-hidden="true" />
      {meta.label}
      {trailing}
    </>
  );

  const sharedClassName = [
    "inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-semibold",
    onClick ? "cursor-pointer transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(37,99,235,0.35)]" : "",
    meta.className,
    className,
  ].join(" ");

  if (onClick) {
    return (
      <button type="button" onClick={onClick} title={title} className={sharedClassName}>
        {content}
      </button>
    );
  }

  return <span className={sharedClassName}>{content}</span>;
}
