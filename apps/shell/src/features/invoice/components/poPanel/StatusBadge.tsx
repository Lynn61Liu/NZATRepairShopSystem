import type { InvoiceStatus, PoSource, XeroInvoiceStatus } from "../../types";

type Props = {
  kind: "invoice" | "source" | "state" | "xero";
  value: InvoiceStatus | XeroInvoiceStatus | PoSource | string;
};

const STYLES: Record<string, string> = {
  Draft: "bg-slate-100 text-slate-700 border border-slate-200",
  "draft": "bg-slate-100 text-slate-700 border border-slate-200",
  "Awaiting PO": "bg-amber-100 text-amber-800 border border-amber-200",
  "PO Received": "bg-emerald-100 text-emerald-800 border border-emerald-200",
  "Awaiting Payment": "bg-sky-100 text-sky-800 border border-sky-200",
  Paid: "bg-emerald-100 text-emerald-800 border border-emerald-200",
  DRAFT: "bg-slate-100 text-slate-700 border border-slate-200",
  AUTHORISED: "bg-violet-100 text-violet-800 border border-violet-200",
  PAID: "bg-sky-100 text-sky-800 border border-sky-200",
  UNKNOWN: "bg-slate-100 text-slate-500 border border-slate-200",
  Sent: "bg-emerald-100 text-emerald-800 border border-emerald-200",
  "Email Sent": "bg-emerald-100 text-emerald-800 border border-emerald-200",
  "First email sent": "bg-emerald-100 text-emerald-800 border border-emerald-200",
  "First time sending": "bg-emerald-100 text-emerald-800 border border-emerald-200",
  "Continue to send 1": "bg-emerald-100 text-emerald-800 border border-emerald-200",
  "Continue sending 2": "bg-emerald-100 text-emerald-800 border border-emerald-200",
  "Continue sending 3": "bg-emerald-100 text-emerald-800 border border-emerald-200",
  "Follow Up 1": "bg-amber-100 text-amber-800 border border-amber-200",
  "Follow Up 2": "bg-amber-100 text-amber-800 border border-amber-200",
  "Follow Up 3": "bg-amber-100 text-amber-800 border border-amber-200",
  "Reminder Scheduled": "bg-amber-100 text-amber-800 border border-amber-200",
  "reminder email": "bg-amber-100 text-amber-800 border border-amber-200",
  "Automatic reminder 1": "bg-amber-100 text-amber-800 border border-amber-200",
  "Automatic reminder 2": "bg-amber-100 text-amber-800 border border-amber-200",
  "Automatic reminder 3": "bg-amber-100 text-amber-800 border border-amber-200",
  "Get Reply": "bg-sky-100 text-sky-800 border border-sky-200",
  "Reply received": "bg-sky-100 text-sky-800 border border-sky-200",
  "Received reply (including PO)": "bg-sky-100 text-sky-800 border border-sky-200",
  "Get PO": "bg-violet-100 text-violet-800 border border-violet-200",
  "PO recognized": "bg-violet-100 text-violet-800 border border-violet-200",
  "Escalation Required": "bg-rose-100 text-rose-800 border border-rose-200",
  "PO Confirmed": "bg-emerald-100 text-emerald-800 border border-emerald-200",
  email: "bg-blue-100 text-blue-700 border border-blue-200",
  pdf: "bg-fuchsia-100 text-fuchsia-700 border border-fuchsia-200",
  image: "bg-emerald-100 text-emerald-700 border border-emerald-200",
  ocr: "bg-orange-100 text-orange-700 border border-orange-200",
};

export function StatusBadge({ value }: Props) {
  const label =
    value === "DRAFT"
      ? "Draft"
      : value === "AUTHORISED"
        ? "Awaiting Payment"
        : value === "PAID"
          ? "Paid"
          : value;

  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${STYLES[label] ?? STYLES[value] ?? STYLES.Draft}`}>
      {label}
    </span>
  );
}
