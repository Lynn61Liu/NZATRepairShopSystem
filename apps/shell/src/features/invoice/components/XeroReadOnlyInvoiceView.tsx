import type React from "react";
import { CalendarDays, ExternalLink, Hash, RefreshCcw } from "lucide-react";
import { Button, Card } from "@/components/ui";
import { XeroButton } from "@/components/common/XeroButton";
import type { InvoiceDashboardModel } from "../hooks/useInvoiceDashboardState";
import type { AmountsAre, TaxRateOption } from "../types";
import type { JobInvoiceData } from "@/types";

type Props = {
  model: InvoiceDashboardModel;
  hasInvoice?: boolean;
};

type ParsedXeroInvoice = {
  contactName: string;
  issueDate: string;
  dueDate: string;
  invoiceNumber: string;
  reference: string;
  status: string;
  currencyCode: string;
  lineAmountTypes: string;
  subTotal?: number;
  totalTax?: number;
  total?: number;
  lineItems: ParsedXeroLineItem[];
};

type ParsedXeroLineItem = {
  itemCode: string;
  description: string;
  quantity: number;
  unitAmount: number;
  accountCode: string;
  taxType: string;
  taxLabel: string;
  taxAmount: number;
  lineAmount: number;
};

const TAX_LABELS: Record<string, TaxRateOption> = {
  INPUT: "15% GST on Expenses",
  INPUT2: "15% GST on Expenses",
  GSTONIMPORTS: "GST on Imports",
  OUTPUT: "15% GST on Income",
  OUTPUT2: "15% GST on Income",
  ZERORATEDINPUT: "Zero Rated - Exp",
  ZERORATEDOUTPUT: "Zero Rated",
  ZERORATED: "Zero Rated",
  NONE: "No GST",
};

function parseXeroDate(value?: string | null) {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  const xeroMatch = /^\/Date\((\d+)(?:[+-]\d+)?\)\/$/.exec(trimmed);
  if (xeroMatch) {
    const parsed = new Date(Number(xeroMatch[1]));
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const parsed = new Date(`${trimmed}T12:00:00Z`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatNzDate(value?: string | null, withTime = false) {
  if (!value) return "";
  const parsed = parseXeroDate(value);
  if (!parsed) return value;

  return new Intl.DateTimeFormat("en-NZ", {
    timeZone: "Pacific/Auckland",
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(withTime
      ? {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        }
      : {}),
  }).format(parsed);
}

function formatMoney(value?: number | null) {
  const amount = typeof value === "number" && Number.isFinite(value) ? value : 0;
  return amount.toFixed(2);
}

function normalizeLineAmountTypes(value?: string | null): AmountsAre {
  switch ((value ?? "").trim().toUpperCase()) {
    case "INCLUSIVE":
      return "Tax Inclusive";
    case "NOTAX":
    case "NO TAX":
      return "No Tax";
    default:
      return "Tax Exclusive";
  }
}

function formatLineAmountTypes(value?: string | null) {
  switch (normalizeLineAmountTypes(value)) {
    case "Tax Inclusive":
      return "Tax inclusive";
    case "No Tax":
      return "No tax";
    default:
      return "Tax exclusive";
  }
}

function formatStatus(value?: string | null) {
  switch ((value ?? "").trim().toUpperCase()) {
    case "DRAFT":
      return "Draft";
    case "AUTHORISED":
      return "Waiting payment";
    case "PAID":
      return "Paid";
    case "VOIDED":
      return "Voided";
    case "DELETED":
      return "Deleted";
    case "SUBMITTED":
      return "Submitted";
    default:
      return value?.trim() || "Unknown";
  }
}

function getStatusBadgeClasses(value?: string | null) {
  switch ((value ?? "").trim().toUpperCase()) {
    case "AUTHORISED":
      return "border-[#c7d7a8] bg-[#eef6de] text-[#536b1f]";
    case "PAID":
      return "border-[#9fd2ef] bg-[#dff2fb] text-[#16536e]";
    case "VOIDED":
    case "DELETED":
      return "border-[#e5b8b8] bg-[#faeaea] text-[#8b3b3b]";
    default:
      return "border-[#b8c0cc] bg-[#e8ebef] text-[#4b5563]";
  }
}

function formatTaxLabel(value?: string | null) {
  const normalized = (value ?? "").trim().toUpperCase();
  return TAX_LABELS[normalized] || value?.trim() || "No GST";
}

function parseXeroInvoice(source?: JobInvoiceData | null): ParsedXeroInvoice | null {
  const raw = source?.responsePayloadJson?.trim();
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as {
      Invoices?: Array<{
        Contact?: { Name?: string };
        Date?: string;
        DueDate?: string;
        InvoiceNumber?: string;
        Reference?: string;
        Status?: string;
        CurrencyCode?: string;
        LineAmountTypes?: string;
        SubTotal?: number;
        TotalTax?: number;
        Total?: number;
        LineItems?: Array<{
          ItemCode?: string;
          Description?: string;
          Quantity?: number;
          UnitAmount?: number;
          AccountCode?: string;
          TaxType?: string;
          TaxAmount?: number;
          LineAmount?: number;
        }>;
      }>;
    };

    const invoice = Array.isArray(parsed.Invoices) ? parsed.Invoices[0] : null;
    if (!invoice) return null;

    return {
      contactName: invoice.Contact?.Name?.trim() || "",
      issueDate: invoice.Date || "",
      dueDate: invoice.DueDate || "",
      invoiceNumber: invoice.InvoiceNumber?.trim() || "",
      reference: invoice.Reference?.trim() || "",
      status: invoice.Status?.trim() || source?.externalStatus?.trim() || "",
      currencyCode: invoice.CurrencyCode?.trim() || "NZD",
      lineAmountTypes: invoice.LineAmountTypes?.trim() || "Exclusive",
      subTotal: typeof invoice.SubTotal === "number" ? invoice.SubTotal : undefined,
      totalTax: typeof invoice.TotalTax === "number" ? invoice.TotalTax : undefined,
      total: typeof invoice.Total === "number" ? invoice.Total : undefined,
      lineItems: Array.isArray(invoice.LineItems)
        ? invoice.LineItems.map((item) => ({
            itemCode: item.ItemCode?.trim() || "",
            description: item.Description?.trim() || "",
            quantity: typeof item.Quantity === "number" ? item.Quantity : 0,
            unitAmount: typeof item.UnitAmount === "number" ? item.UnitAmount : 0,
            accountCode: item.AccountCode?.trim() || "",
            taxType: item.TaxType?.trim() || "",
            taxLabel: formatTaxLabel(item.TaxType),
            taxAmount: typeof item.TaxAmount === "number" ? item.TaxAmount : 0,
            lineAmount: typeof item.LineAmount === "number" ? item.LineAmount : 0,
          }))
        : [],
    };
  } catch {
    return null;
  }
}

function buildFallbackSnapshot(model: InvoiceDashboardModel): ParsedXeroInvoice {
  return {
    contactName: model.invoice.contact,
    issueDate: model.invoice.issueDate,
    dueDate: model.invoice.issueDate,
    invoiceNumber: model.invoice.invoiceNumber,
    reference: model.invoice.reference,
    status: model.invoice.xeroStatus,
    currencyCode: "NZD",
    lineAmountTypes: model.invoice.amountsAre,
    subTotal: model.subtotal,
    totalTax: model.taxTotal,
    total: model.totalAmount,
    lineItems: model.items.map((item) => ({
      itemCode: item.itemCode,
      description: item.description,
      quantity: item.quantity,
      unitAmount: item.unitPrice,
      accountCode: item.account,
      taxType: item.xeroTaxType || item.taxRate,
      taxLabel: item.taxRate,
      taxAmount: item.xeroTaxAmount ?? 0,
      lineAmount: item.xeroLineAmount ?? item.quantity * item.unitPrice,
    })),
  };
}

function groupTaxTotals(lineItems: ParsedXeroLineItem[]) {
  const grouped = new Map<string, number>();
  for (const item of lineItems) {
    const key = item.taxLabel || "No GST";
    grouped.set(key, (grouped.get(key) || 0) + item.taxAmount);
  }
  return Array.from(grouped.entries());
}

function ReadOnlyField({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 text-[13px] font-semibold text-[#4b5563]">{label}</div>
      <div className="flex min-h-[44px] items-center gap-2 rounded-[6px] border border-[#c8d0d8] bg-[#f9fbfd] px-3 text-[15px] text-[#18212f]">
        {icon}
        <span className="truncate">{value || "-"}</span>
      </div>
    </div>
  );
}

export function XeroReadOnlyInvoiceView({ model, hasInvoice = true }: Props) {
  const sourceInvoice = model.sourceInvoice ?? model.persistedInvoice ?? null;
  const snapshot = parseXeroInvoice(sourceInvoice) ?? buildFallbackSnapshot(model);
  const taxGroups = groupTaxTotals(snapshot.lineItems);

  if (!hasInvoice) {
    return null;
  }

  return (
    <Card className="rounded-[18px] p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-[var(--ds-border)] pb-5">
        <div>
          <div className="text-2xl font-semibold text-[var(--ds-text)]">Xero Invoice</div>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-[var(--ds-muted)]">
            <span>{`Last synced: ${formatNzDate(model.invoice.lastSyncTime, true) || "-"}`}</span>
            <span
              className={[
                "inline-flex items-center rounded-[6px] border px-3 py-1 text-[13px] font-semibold leading-none",
                getStatusBadgeClasses(snapshot.status),
              ].join(" ")}
            >
              {formatStatus(snapshot.status)}
            </span>
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button
            variant="ghost"
            leftIcon={<RefreshCcw className={["h-4 w-4", model.refreshingFromXero ? "animate-spin" : ""].join(" ")} />}
            className="h-11 px-5"
            onClick={model.refreshFromXero}
            disabled={model.refreshingFromXero}
          >
            {model.refreshingFromXero ? "Pulling..." : "Pull From Xero"}
          </Button>
          <XeroButton className="h-11 px-5" onClick={model.openInXero} />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
        <ReadOnlyField label="Contact" value={snapshot.contactName} />
        <ReadOnlyField label="Issue date" value={formatNzDate(snapshot.issueDate)} icon={<CalendarDays className="h-4 w-4 text-[#637083]" />} />
        <ReadOnlyField label="Due date" value={formatNzDate(snapshot.dueDate || snapshot.issueDate)} icon={<CalendarDays className="h-4 w-4 text-[#637083]" />} />
        <ReadOnlyField label="Invoice number" value={snapshot.invoiceNumber} icon={<Hash className="h-4 w-4 text-[#637083]" />} />
        <ReadOnlyField label="Reference" value={snapshot.reference} />
        <ReadOnlyField label="Online payments" value="None" icon={<ExternalLink className="h-4 w-4 text-[#637083]" />} />
        <ReadOnlyField label="Currency" value={snapshot.currencyCode === "NZD" ? "New Zealand Dollar" : snapshot.currencyCode} />
        <ReadOnlyField label="Amounts are" value={formatLineAmountTypes(snapshot.lineAmountTypes)} />
      </div>

      <div className="mt-5 overflow-hidden rounded-[10px] border border-[#ced6de] bg-white">
        <table className="w-full border-collapse table-fixed">
          <thead>
            <tr className="border-b border-[#ced6de] bg-[#f1f4f7] text-left text-sm font-semibold text-[#374151]">
              <th className="w-10 px-3 py-4"></th>
              <th className="w-[12%] px-3 py-4">Item</th>
              <th className="w-[26%] px-3 py-4">Description</th>
              <th className="w-[8%] px-3 py-4">Qty.</th>
              <th className="w-[10%] px-3 py-4">Price</th>
              <th className="w-[10%] px-3 py-4">Disc.</th>
              <th className="w-[12%] px-3 py-4">Account</th>
              <th className="w-[12%] px-3 py-4">Tax rate</th>
              <th className="w-[10%] px-3 py-4 text-right">Tax amount</th>
              <th className="w-[10%] px-3 py-4 text-right">Amount NZD</th>
            </tr>
          </thead>
          <tbody>
            {snapshot.lineItems.map((item, index) => (
              <tr key={`${item.itemCode}-${index}`} className="border-b border-[#d8dee5] last:border-b-0">
                <td className="px-3 py-4 align-top text-[#9aa5b1]">
                  <div className="grid w-3 grid-cols-2 gap-[2px] pt-1">
                    {Array.from({ length: 6 }).map((_, dotIndex) => (
                      <span key={dotIndex} className="h-[3px] w-[3px] rounded-full bg-current" />
                    ))}
                  </div>
                </td>
                <td className="px-3 py-4 align-top">
                  {item.itemCode ? (
                    <span className="inline-flex rounded-[4px] border border-[#aeb8c4] bg-[#f7f9fb] px-2 py-[2px] text-[13px] font-medium text-[#415164]">
                      {item.itemCode}
                    </span>
                  ) : (
                    <span className="text-[#9aa5b1]">-</span>
                  )}
                </td>
                <td className="px-3 py-4 align-top text-[15px] text-[#18212f]">{item.description || "-"}</td>
                <td className="px-3 py-4 align-top text-[15px] text-[#18212f]">{item.quantity}</td>
                <td className="px-3 py-4 align-top text-[15px] text-[#18212f]">{formatMoney(item.unitAmount)}</td>
                <td className="px-3 py-4 align-top text-[15px] text-[#18212f]"></td>
                <td className="px-3 py-4 align-top text-[15px] text-[#18212f]">{item.accountCode || "-"}</td>
                <td className="px-3 py-4 align-top text-[15px] text-[#18212f]">{item.taxLabel}</td>
                <td className="px-3 py-4 text-right align-top text-[15px] text-[#18212f]">{formatMoney(item.taxAmount)}</td>
                <td className="px-3 py-4 text-right align-top text-[15px] text-[#18212f]">{formatMoney(item.lineAmount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-8 flex justify-end">
        <div className="w-full max-w-[640px] space-y-5">
          <div className="flex items-center justify-between text-[16px] text-[#1f2937]">
            <span>Subtotal</span>
            <span>{formatMoney(snapshot.subTotal ?? model.subtotal)}</span>
          </div>
          {taxGroups.map(([label, amount]) => (
            <div key={label} className="flex items-center justify-between text-[16px] text-[#1f2937]">
              <span>{`Total ${label}`}</span>
              <span>{formatMoney(amount)}</span>
            </div>
          ))}
          <div className="border-t-4 border-[#adb6c2] pt-5">
            <div className="flex items-center justify-between text-[20px] font-semibold text-[#18212f]">
              <span>Total</span>
              <span>{formatMoney(snapshot.total ?? model.totalAmount)}</span>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
