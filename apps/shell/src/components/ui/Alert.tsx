import type React from "react";
import { AlertCircle, CheckCircle2, Info, TriangleAlert, X } from "lucide-react";

type AlertVariant = "error" | "success" | "warning" | "info";

type AlertProps = {
  title?: string;
  description: string;
  variant?: AlertVariant;
  onClose?: () => void;
  className?: string;
};

const variantStyles: Record<AlertVariant, { container: string; icon: React.ReactNode }> = {
  error: {
    container: "border-red-200 bg-red-50 text-red-800",
    icon: <AlertCircle className="h-4 w-4 text-red-600" />,
  },
  success: {
    container: "border-emerald-200 bg-emerald-50 text-emerald-800",
    icon: <CheckCircle2 className="h-4 w-4 text-emerald-600" />,
  },
  warning: {
    container: "border-amber-200 bg-amber-50 text-amber-800",
    icon: <TriangleAlert className="h-4 w-4 text-amber-600" />,
  },
  info: {
    container: "border-sky-200 bg-sky-50 text-sky-800",
    icon: <Info className="h-4 w-4 text-sky-600" />,
  },
};

export function Alert({ title, description, variant = "info", onClose, className = "" }: AlertProps) {
  const styles = variantStyles[variant];

  return (
    <div
      className={[
        "flex items-start gap-3 rounded-[12px] border px-4 py-3 text-sm",
        styles.container,
        className,
      ].join(" ")}
      role="alert"
    >
      <div className="mt-0.5">{styles.icon}</div>
      <div className="flex-1">
        {title ? <div className="font-semibold leading-5">{title}</div> : null}
        <div className="leading-5">{description}</div>
      </div>
      {onClose ? (
        <button
          type="button"
          onClick={onClose}
          className="-m-1 rounded-md p-1 text-[rgba(0,0,0,0.45)] transition hover:text-[rgba(0,0,0,0.65)]"
          aria-label="Close alert"
        >
          <X className="h-4 w-4" />
        </button>
      ) : null}
    </div>
  );
}
