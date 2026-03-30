import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import { Button, Card, Input } from "@/components/ui";
import { getXeroInvoiceUrl } from "@/components/common/XeroButton";
import { requestJson } from "@/utils/api";

type InvoicePaymentRow = {
  id: string;
  jobId: string;
  jobInvoiceId: string;
  invoiceNumber: string;
  xeroInvoiceId: string;
  contact: string;
  issueDate: string;
  reference: string;
  paymentWay: string;
  paymentDate: string;
  paymentDateTime: string;
  xeroTotal?: number | null;
  amount: number;
  paymentTotal?: number | null;
  note: string;
  externalStatus: string;
  createdAt: string;
};

type DateFilterPreset = "7d" | "1m" | "custom";
type PaymentWayFilter = "all" | "epost" | "cash";

function formatPaymentWay(value: string) {
  const normalized = value.trim().toLowerCase();
  if (normalized === "cash") return "Cash";
  if (normalized === "epost") return "ePost";
  if (normalized === "bank_transfer") return "Bank Transfer";
  return value || "-";
}

function normalizePaymentWay(value: string): PaymentWayFilter | "other" {
  const normalized = value.trim().toLowerCase();
  if (normalized === "cash") return "cash";
  if (normalized === "epost") return "epost";
  return "other";
}

function formatCurrency(value?: number | null) {
  if (typeof value !== "number" || Number.isNaN(value)) return "-";
  return value.toFixed(2);
}

function formatDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function shiftDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function shiftMonths(date: Date, months: number) {
  const next = new Date(date);
  next.setMonth(next.getMonth() + months);
  return next;
}

function isWithinDateRange(rowDate: string, preset: DateFilterPreset, startDate: string, endDate: string) {
  if (!rowDate) return false;

  if (preset === "custom") {
    if (startDate && rowDate < startDate) return false;
    if (endDate && rowDate > endDate) return false;
    return true;
  }

  const today = new Date();
  const rangeStart =
    preset === "7d" ? formatDateInputValue(shiftDays(today, -6)) : formatDateInputValue(shiftMonths(today, -1));
  const rangeEnd = formatDateInputValue(today);

  return rowDate >= rangeStart && rowDate <= rangeEnd;
}

const dateFilterOptions: Array<{ key: DateFilterPreset; label: string }> = [
  { key: "7d", label: "最近1周" },
  { key: "1m", label: "最近1个月" },
  { key: "custom", label: "自定义日期" },
];

const paymentFilterOptions: Array<{ key: PaymentWayFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "epost", label: "ePost only" },
  { key: "cash", label: "Cash only" },
];

export function InvoicePage() {
  const [rows, setRows] = useState<InvoicePaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [expandedDates, setExpandedDates] = useState<Record<string, boolean>>({});
  const [dateFilterPreset, setDateFilterPreset] = useState<DateFilterPreset>("1m");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [paymentFiltersByDate, setPaymentFiltersByDate] = useState<Record<string, PaymentWayFilter>>({});

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError("");
      const res = await requestJson<{ payments?: InvoicePaymentRow[] }>("/api/invoice-payments");
      if (cancelled) return;

      if (!res.ok) {
        setError(res.error || "Failed to load invoice payments.");
        setLoading(false);
        return;
      }

      const payments = Array.isArray(res.data?.payments) ? res.data!.payments : [];
      setRows(payments);
      setExpandedDates(
        payments.reduce<Record<string, boolean>>((acc, row, index) => {
          if (!(row.paymentDate in acc)) acc[row.paymentDate] = index === 0;
          return acc;
        }, {})
      );
      setLoading(false);
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredRows = useMemo(
    () => rows.filter((row) => isWithinDateRange(row.paymentDate, dateFilterPreset, customStartDate, customEndDate)),
    [rows, dateFilterPreset, customStartDate, customEndDate]
  );

  const groups = useMemo(() => {
    const map = new Map<string, InvoicePaymentRow[]>();
    filteredRows.forEach((row) => {
      const existing = map.get(row.paymentDate) ?? [];
      existing.push(row);
      map.set(row.paymentDate, existing);
    });
    return Array.from(map.entries()).map(([date, items]) => ({
      date,
      items,
    }));
  }, [filteredRows]);

  useEffect(() => {
    if (groups.length === 0) return;

    setExpandedDates((prev) =>
      groups.reduce<Record<string, boolean>>((acc, group, index) => {
        acc[group.date] = prev[group.date] ?? index === 0;
        return acc;
      }, {})
    );
  }, [groups]);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-[rgba(0,0,0,0.72)]">Invoice Payment</h1>
      </div>

      <Card className="p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <div className="text-sm font-semibold text-[var(--ds-text)]">日期筛选</div>
            <div className="flex flex-wrap gap-2">
              {dateFilterOptions.map((option) => {
                const isActive = dateFilterPreset === option.key;
                return (
                  <button
                    key={option.key}
                    type="button"
                    onClick={() => setDateFilterPreset(option.key)}
                    className={[
                      "inline-flex items-center rounded-[999px] border px-3 py-1.5 text-sm font-medium transition",
                      isActive
                        ? "border-[rgba(37,99,235,0.18)] bg-[rgba(37,99,235,0.10)] text-blue-700"
                        : "border-[rgba(0,0,0,0.10)] bg-white text-[var(--ds-muted)] hover:bg-[rgba(0,0,0,0.03)]",
                    ].join(" ")}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </div>

          {dateFilterPreset === "custom" ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:min-w-[360px]">
              <label className="space-y-1">
                <div className="text-xs font-medium uppercase tracking-[0.04em] text-[var(--ds-muted)]">Start Date</div>
                <Input type="date" value={customStartDate} onChange={(event) => setCustomStartDate(event.target.value)} />
              </label>
              <label className="space-y-1">
                <div className="text-xs font-medium uppercase tracking-[0.04em] text-[var(--ds-muted)]">End Date</div>
                <Input type="date" value={customEndDate} onChange={(event) => setCustomEndDate(event.target.value)} />
              </label>
            </div>
          ) : null}
        </div>
      </Card>

      {loading ? <Card className="p-5 text-sm text-[var(--ds-muted)]">Loading invoice payments...</Card> : null}
      {!loading && error ? <Card className="p-5 text-sm text-red-600">{error}</Card> : null}
      {!loading && !error && groups.length === 0 ? (
        <Card className="p-5 text-sm text-[var(--ds-muted)]">目前没有 invoice payment 记录。</Card>
      ) : null}

      {!loading && !error
        ? groups.map((group) => {
            const isExpanded = expandedDates[group.date] ?? false;
            const paymentFilter = paymentFiltersByDate[group.date] ?? "all";
            const visibleItems =
              paymentFilter === "all"
                ? group.items
                : group.items.filter((row) => normalizePaymentWay(row.paymentWay) === paymentFilter);
            return (
              <Card key={group.date} className="overflow-hidden">
                <div className="flex flex-col gap-3 px-5 py-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="flex-1">
                    <div>
                      <div className="text-lg font-semibold text-[var(--ds-text)]">{group.date}</div>
                      <div className="mt-1 text-sm text-[var(--ds-muted)]">
                        Invoice 总数：{visibleItems.length}
                        {paymentFilter !== "all" ? ` / ${group.items.length}` : ""}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                    {paymentFilterOptions.map((option) => (
                      <Button
                        key={option.key}
                        type="button"
                        onClick={() =>
                          setPaymentFiltersByDate((prev) => ({
                            ...prev,
                            [group.date]: option.key,
                          }))
                        }
                        className={[
                          "rounded-[999px] px-3",
                          paymentFilter === option.key
                            ? "!border-transparent !bg-[rgba(15,118,110,0.12)] !text-teal-700"
                            : "",
                        ].join(" ")}
                      >
                        {option.label}
                      </Button>
                    ))}

                    <button
                      type="button"
                      aria-label={isExpanded ? "Collapse section" : "Expand section"}
                      className="inline-flex h-10 w-10 items-center justify-center rounded-[10px] border border-[rgba(0,0,0,0.10)] bg-white text-[var(--ds-muted)] transition hover:bg-[rgba(0,0,0,0.03)]"
                      onClick={() => setExpandedDates((prev) => ({ ...prev, [group.date]: !isExpanded }))}
                    >
                      {isExpanded ? <ChevronDown className="h-6 w-6" /> : <ChevronRight className="h-6 w-6" />}
                    </button>
                  </div>
                </div>

                {isExpanded ? (
                  <div className="border-t border-[var(--ds-border)]">
                    <div className="grid grid-cols-[110px_150px_1fr_120px_1fr_120px_120px_140px_170px_1fr] gap-3 bg-[rgba(0,0,0,0.03)] px-5 py-3 text-xs font-semibold uppercase tracking-[0.04em] text-[var(--ds-muted)]">
                      <div>Job ID</div>
                      <div>Invoice Number</div>
                      <div>Contact</div>
                      <div>Issue Date</div>
                      <div>Reference</div>
                      <div>Xero Total</div>
                      <div>Payment Total</div>
                      <div>Payment Way</div>
                      <div>Payment Datetime</div>
                      <div>Note</div>
                    </div>
                    <div>
                      {visibleItems.length === 0 ? (
                        <div className="px-5 py-6 text-sm text-[var(--ds-muted)]">当前筛选条件下没有 invoice payment。</div>
                      ) : (
                        visibleItems.map((row) => (
                          <div
                            key={row.id}
                            className="grid grid-cols-[110px_150px_1fr_120px_1fr_120px_120px_140px_170px_1fr] gap-3 border-t border-[var(--ds-border)] px-5 py-4 text-sm text-[var(--ds-text)] first:border-t-0"
                          >
                            <div>
                              <Link
                                to={`/jobs/${encodeURIComponent(row.jobId)}?tab=Invoice`}
                                className="font-semibold text-blue-600 hover:text-blue-700 hover:underline"
                              >
                                #{row.jobId}
                              </Link>
                            </div>
                            <div className="font-medium">
                              {row.xeroInvoiceId ? (
                                <a
                                  href={getXeroInvoiceUrl(row.xeroInvoiceId)}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="font-semibold text-blue-600 hover:text-blue-700 hover:underline"
                                >
                                  {row.invoiceNumber || row.xeroInvoiceId || "-"}
                                </a>
                              ) : (
                                <span>{row.invoiceNumber || row.xeroInvoiceId || "-"}</span>
                              )}
                            </div>
                            <div>{row.contact || "-"}</div>
                            <div>{row.issueDate || "-"}</div>
                            <div className="break-words">{row.reference || "-"}</div>
                            <div>{formatCurrency(row.xeroTotal)}</div>
                            <div>{formatCurrency(row.paymentTotal ?? row.amount)}</div>
                            <div>{formatPaymentWay(row.paymentWay)}</div>
                            <div>{row.paymentDateTime || row.paymentDate || "-"}</div>
                            <div className="break-words">{row.note || "-"}</div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                ) : null}
              </Card>
            );
          })
        : null}
    </div>
  );
}
