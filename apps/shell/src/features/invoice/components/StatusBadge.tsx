import type { InvoiceStatus, PoSource } from "../types";

type Props = {
  kind: "invoice" | "source" | "state";
  value: InvoiceStatus | PoSource | string;
};

const STYLES: Record<string, string> = {
  Draft: "bg-slate-100 text-slate-700 border border-slate-200",
  "Awaiting PO": "bg-amber-100 text-amber-800 border border-amber-200",
  "PO Received": "bg-emerald-100 text-emerald-800 border border-emerald-200",
  "Awaiting Payment": "bg-sky-100 text-sky-800 border border-sky-200",
  Authorised: "bg-violet-100 text-violet-800 border border-violet-200",
  email: "bg-blue-100 text-blue-700 border border-blue-200",
  pdf: "bg-fuchsia-100 text-fuchsia-700 border border-fuchsia-200",
  ocr: "bg-orange-100 text-orange-700 border border-orange-200",
  "Email Sent": "bg-emerald-100 text-emerald-800 border border-emerald-200",
  "Get Reply": "bg-sky-100 text-sky-800 border border-sky-200",
  "Reminder Scheduled": "bg-amber-100 text-amber-800 border border-amber-200",
  "Get PO": "bg-violet-100 text-violet-800 border border-violet-200",
};

export function StatusBadge({ value }: Props) {
  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${STYLES[value] ?? STYLES.Draft}`}>
      {value}
    </span>
  );
}
