import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Card, Input, Pagination } from "@/components/ui";
import { getXeroInvoiceUrl } from "@/components/common/XeroButton";
import { requestJson } from "@/utils/api";
import { paginate } from "@/utils/pagination";

type InvoicePaymentRow = {
  id: string;
  jobId: string;
  jobInvoiceId: string;
  invoiceNumber: string;
  xeroInvoiceId: string;
  contact: string;
  reference: string;
  paymentWay: string;
  paymentDate: string;
  paymentDateTime: string;
  xeroTotal?: number | null;
  amount: number;
  paymentTotal?: number | null;
  note: string;
  jobNote: string;
  externalStatus: string;
  createdAt: string;
};

type DateFilterPreset = "7d" | "1m" | "custom";
type PaymentWayFilter = "all" | "epost" | "cash";

function resolvePaymentGroupDate(row: Pick<InvoicePaymentRow, "paymentDateTime" | "paymentDate">) {
  const paymentDateTime = row.paymentDateTime?.trim();
  if (/^\d{4}-\d{2}-\d{2}\b/.test(paymentDateTime)) {
    return paymentDateTime.slice(0, 10);
  }
  return row.paymentDate;
}

function formatPaymentWay(value: string) {
  const normalized = value.trim().toLowerCase();
  if (normalized === "cash") return "Cash";
  if (normalized === "epost") return "Eftpos";
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

function formatNzDateTitle(value: string) {
  if (!value) return "-";
  const parts = value.split("-").map(Number);
  if (parts.length !== 3 || parts.some((part) => Number.isNaN(part))) return value;
  const [year, month, day] = parts;
  const date = new Date(Date.UTC(year, month - 1, day));
  return new Intl.DateTimeFormat("en-NZ", {
    timeZone: "Pacific/Auckland",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function sortInvoicePaymentRows(items: InvoicePaymentRow[]) {
  return [...items].sort((left, right) => {
    const dateCompare = resolvePaymentGroupDate(right).localeCompare(resolvePaymentGroupDate(left));
    if (dateCompare !== 0) return dateCompare;

    const rightDateTime = right.paymentDateTime || right.createdAt || "";
    const leftDateTime = left.paymentDateTime || left.createdAt || "";
    const dateTimeCompare = rightDateTime.localeCompare(leftDateTime);
    if (dateTimeCompare !== 0) return dateTimeCompare;

    return right.id.localeCompare(left.id);
  });
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
  { key: "epost", label: "Eftpos only" },
  { key: "cash", label: "Cash only" },
];

const GROUPS_PER_PAGE = 7;

export function InvoicePage() {
  const [rows, setRows] = useState<InvoicePaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [actionError, setActionError] = useState("");
  const [expandedDates, setExpandedDates] = useState<Record<string, boolean>>({});
  const [dateFilterPreset, setDateFilterPreset] = useState<DateFilterPreset>("1m");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");
  const [paymentFilter, setPaymentFilter] = useState<PaymentWayFilter>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [editingPaymentDate, setEditingPaymentDate] = useState("");
  const [savingRowId, setSavingRowId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError("");
      setActionError("");
      const res = await requestJson<{ payments?: InvoicePaymentRow[] }>("/api/invoice-payments");
      if (cancelled) return;

      if (!res.ok) {
        setError(res.error || "Failed to load invoice payments.");
        setLoading(false);
        return;
      }

      const payments = Array.isArray(res.data?.payments) ? res.data!.payments : [];
      setRows(sortInvoicePaymentRows(payments));
      setExpandedDates(
        payments.reduce<Record<string, boolean>>((acc, row, index) => {
          const groupDate = resolvePaymentGroupDate(row);
          if (!(groupDate in acc)) acc[groupDate] = index === 0;
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
    () =>
      rows.filter((row) =>
        isWithinDateRange(resolvePaymentGroupDate(row), dateFilterPreset, customStartDate, customEndDate)
      ),
    [rows, dateFilterPreset, customStartDate, customEndDate]
  );

  const paymentFilteredRows = useMemo(
    () =>
      paymentFilter === "all"
        ? filteredRows
        : filteredRows.filter((row) => normalizePaymentWay(row.paymentWay) === paymentFilter),
    [filteredRows, paymentFilter]
  );

  const groups = useMemo(() => {
    const map = new Map<string, InvoicePaymentRow[]>();
    paymentFilteredRows.forEach((row) => {
      const groupDate = resolvePaymentGroupDate(row);
      const existing = map.get(groupDate) ?? [];
      existing.push(row);
      map.set(groupDate, existing);
    });
    return Array.from(map.entries()).map(([date, items]) => ({
      date,
      items,
    }));
  }, [paymentFilteredRows]);

  useEffect(() => {
    if (groups.length === 0) return;

    setExpandedDates((prev) =>
      groups.reduce<Record<string, boolean>>((acc, group, index) => {
        acc[group.date] = prev[group.date] ?? index === 0;
        return acc;
      }, {})
    );
  }, [groups]);

  const pagination = useMemo(() => paginate(groups, currentPage, GROUPS_PER_PAGE), [groups, currentPage]);
  const safePage = pagination.currentPage;
  const pagedGroups = pagination.pageRows;

  useEffect(() => {
    if (safePage !== currentPage) {
      setCurrentPage(safePage);
    }
  }, [safePage, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [dateFilterPreset, customStartDate, customEndDate, paymentFilter]);

  const startEditingPaymentDate = (row: InvoicePaymentRow) => {
    setActionError("");
    setEditingRowId(row.id);
    setEditingPaymentDate(row.paymentDate || resolvePaymentGroupDate(row) || "");
  };

  const cancelEditingPaymentDate = () => {
    setActionError("");
    setEditingRowId(null);
    setEditingPaymentDate("");
  };

  const savePaymentDate = async (row: InvoicePaymentRow) => {
    if (!editingPaymentDate) {
      setActionError("Payment date is required.");
      return;
    }

    setSavingRowId(row.id);
    setActionError("");
    try {
      const res = await requestJson<{ payment?: InvoicePaymentRow }>(
        `/api/invoice-payments/${encodeURIComponent(row.id)}/payment-date`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ paymentDate: editingPaymentDate }),
        }
      );

      if (!res.ok || !res.data?.payment) {
        setActionError(res.error || "Failed to update payment date.");
        return;
      }

      const nextRow = res.data.payment;
      setRows((currentRows) =>
        sortInvoicePaymentRows(currentRows.map((item) => (item.id === nextRow.id ? nextRow : item)))
      );
      setEditingRowId(null);
      setEditingPaymentDate("");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to update payment date.");
    } finally {
      setSavingRowId(null);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-[rgba(0,0,0,0.72)]">Invoice Payment</h1>
      </div>

      <Card className="p-5">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="flex flex-1 flex-col gap-4 lg:flex-row lg:items-end lg:gap-8">
            <div className="space-y-2">
              <div className="text-sm font-semibold text-[var(--ds-text)]">付款方式筛选</div>
              <div className="flex flex-wrap gap-2">
                {paymentFilterOptions.map((option) => {
                  const isActive = paymentFilter === option.key;
                  return (
                    <button
                      key={option.key}
                      type="button"
                      onClick={() => setPaymentFilter(option.key)}
                      className={[
                        "inline-flex items-center rounded-[999px] border px-3 py-1.5 text-sm font-medium transition",
                        isActive
                          ? "border-[rgba(15,118,110,0.18)] bg-[rgba(15,118,110,0.10)] text-teal-700"
                          : "border-[rgba(0,0,0,0.10)] bg-white text-[var(--ds-muted)] hover:bg-[rgba(0,0,0,0.03)]",
                      ].join(" ")}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>

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
          </div>

          {dateFilterPreset === "custom" ? (
            <div className="grid gap-3 sm:grid-cols-2 xl:min-w-[360px]">
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
      {!loading && !error && actionError ? <Card className="p-5 text-sm text-red-600">{actionError}</Card> : null}
      {!loading && !error && groups.length === 0 ? (
        <Card className="p-5 text-sm text-[var(--ds-muted)]">目前没有 invoice payment 记录。</Card>
      ) : null}

      {!loading && !error
        ? pagedGroups.map((group) => {
            const isExpanded = expandedDates[group.date] ?? false;
            return (
              <Card key={group.date} className="overflow-hidden">
                <div className="flex flex-col gap-3 px-5 py-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="flex-1">
                    <div>
                      <div className="text-lg font-semibold text-[var(--ds-text)]">{formatNzDateTitle(group.date)}</div>
                      <div className="mt-1 text-sm text-[var(--ds-muted)]">
                        Invoice 总数：{group.items.length}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 lg:justify-end">
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
                    <div className="grid grid-cols-[110px_150px_1fr_1fr_1fr_120px_120px_140px_240px_1fr] gap-3 bg-[rgba(0,0,0,0.03)] px-5 py-3 text-xs font-semibold uppercase tracking-[0.04em] text-[var(--ds-muted)]">
                      <div>Job ID</div>
                      <div>Invoice Number</div>
                      <div>Contact</div>
                      <div>Reference</div>
                      <div>Job Note</div>
                      <div>Xero Total</div>
                      <div>Payment Total</div>
                      <div>Payment Way</div>
                      <div>Payment Datetime</div>
                      <div>Note</div>
                    </div>
                    <div>
                      {group.items.length === 0 ? (
                        <div className="px-5 py-6 text-sm text-[var(--ds-muted)]">当前筛选条件下没有 invoice payment。</div>
                      ) : (
                        group.items.map((row) => (
                          <div
                            key={row.id}
                            className="grid grid-cols-[110px_150px_1fr_1fr_1fr_120px_120px_140px_240px_1fr] gap-3 border-t border-[var(--ds-border)] px-5 py-4 text-sm text-[var(--ds-text)] first:border-t-0"
                          >
                            <div className="font-semibold text-[var(--ds-text)]">#{row.jobId}</div>
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
                            <div className="break-words">{row.reference || "-"}</div>
                            <div className="break-words text-[var(--ds-muted)]">{row.jobNote || "-"}</div>
                            <div>{formatCurrency(row.xeroTotal)}</div>
                            <div>{formatCurrency(row.paymentTotal ?? row.amount)}</div>
                            <div>{formatPaymentWay(row.paymentWay)}</div>
                            <div className="space-y-2">
                              {editingRowId === row.id ? (
                                <>
                                  <Input
                                    type="date"
                                    value={editingPaymentDate}
                                    onChange={(event) => setEditingPaymentDate(event.target.value)}
                                    disabled={savingRowId === row.id}
                                  />
                                  <div className="flex flex-wrap gap-2">
                                    <button
                                      type="button"
                                      onClick={() => savePaymentDate(row)}
                                      disabled={savingRowId === row.id || !editingPaymentDate}
                                      className="inline-flex items-center rounded-[10px] bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                      {savingRowId === row.id ? "Saving..." : "Save"}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={cancelEditingPaymentDate}
                                      disabled={savingRowId === row.id}
                                      className="inline-flex items-center rounded-[10px] border border-[rgba(0,0,0,0.12)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--ds-muted)] transition hover:bg-[rgba(0,0,0,0.03)] disabled:cursor-not-allowed disabled:opacity-60"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </>
                              ) : (
                                <>
                                  <div>{row.paymentDateTime || row.paymentDate || "-"}</div>
                                  <button
                                    type="button"
                                    onClick={() => startEditingPaymentDate(row)}
                                    className="inline-flex items-center rounded-[10px] border border-[rgba(0,0,0,0.12)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--ds-muted)] transition hover:bg-[rgba(0,0,0,0.03)]"
                                  >
                                    Modify
                                  </button>
                                </>
                              )}
                            </div>
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

      {!loading && !error && pagination.totalItems > 0 ? (
        <Card className="overflow-hidden">
          <Pagination
            currentPage={safePage}
            totalPages={pagination.totalPages}
            pageSize={GROUPS_PER_PAGE}
            totalItems={pagination.totalItems}
            onPageChange={setCurrentPage}
          />
        </Card>
      ) : null}
    </div>
  );
}
