import type React from "react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Plus, RefreshCw, Search, Settings2, StickyNote } from "lucide-react";
import { Button, Card, Input, Pagination, Select, Textarea } from "@/components/ui";
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

type PaymarkTransactionRow = {
  id: string;
  transactionKey: string;
  terminalId: string;
  retrievalRef: string;
  transactionNumber: string;
  transactionTime: string;
  transactionTimeUtc: string;
  settlementDate: string;
  cardLogo: string;
  suffix: string;
  transactionAmount: number;
  purchaseAmount: number;
  cashoutAmount: number;
  status: string;
  matchedJobId: string;
  paymentRecorded?: boolean;
  matchedInvoiceStatus?: string;
  matchedInvoiceNumber?: string;
  localNote?: string | null;
};

type JobSearchRow = {
  id: string;
  plate: string;
  vehicleModel: string;
  customerName: string;
  customerCode: string;
  notes: string;
  createdAt: string;
};

type PaymarkQuickJobOption = {
  id: string;
  code: string;
  label: string;
  serviceType: string;
  description: string;
  defaultAmountInclGst: number;
  isActive: boolean;
  sortOrder: number;
};

type QuickJobFormState = {
  plate: string;
  quickService: string;
  amountInclGst: string;
  serviceDescription: string;
  customerId: number | null;
  customerType: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  note: string;
};

type VehicleLookupPayload = {
  vehicle?: {
    plate?: string | null;
    make?: string | null;
    model?: string | null;
    year?: number | null;
    vin?: string | null;
  } | null;
  linkedCustomer?: {
    source?: string | null;
    jobId?: number | string | null;
    customer?: {
      id?: number | string | null;
      type?: string | null;
      name?: string | null;
      phone?: string | null;
      email?: string | null;
      businessCode?: string | null;
    } | null;
  } | null;
};

type VehicleLookupState = {
  loading: boolean;
  error: string;
  payload: VehicleLookupPayload | null;
};

type EftposXeroBatchResult = {
  ok: boolean;
  error?: string | null;
  message?: string;
  posted?: boolean;
  paymentDate: string;
  bankAmount: number;
  localEftposTotal: number;
  xeroAmountDueTotal: number;
  batchPaymentId?: string | null;
  account?: {
    accountId?: string | null;
    code?: string;
    name?: string;
    bankAccountNumber?: string;
  } | null;
  invoices?: Array<{
    invoiceId: string;
    invoiceNumber: string;
    status: string;
    contactName: string;
    currencyCode: string;
    total: number;
    amountDue: number;
  }>;
};

type EftposXeroBatchHistory = {
  paymentDate: string;
  batchPaymentId: string;
  invoiceCount: number;
  invoiceNumbers: string[];
  bankAmount: number;
  accountName: string;
  postedAt: string;
};

type DateFilterPreset = "7d" | "1m" | "custom";
type PaymentWayFilter = "all" | "epost" | "cash";
type PaymarkActionMode = "match" | "quick" | "note";

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

function formatCurrencyBadge(value: number) {
  return new Intl.NumberFormat("en-NZ", {
    style: "currency",
    currency: "NZD",
  }).format(value);
}

function getPaymentAmount(row: Pick<InvoicePaymentRow, "paymentTotal" | "amount">) {
  const value = row.paymentTotal ?? row.amount;
  return typeof value === "number" && !Number.isNaN(value) ? value : 0;
}

function summarizePayments(items: InvoicePaymentRow[]) {
  return items.reduce(
    (summary, row) => {
      const amount = getPaymentAmount(row);
      const paymentWay = normalizePaymentWay(row.paymentWay);

      if (paymentWay === "epost") summary.eftpos += amount;
      if (paymentWay === "cash") summary.cash += amount;
      summary.total += amount;

      return summary;
    },
    { eftpos: 0, cash: 0, total: 0 }
  );
}

function getPaymentWayBadgeClass(value: string) {
  const paymentWay = normalizePaymentWay(value);
  if (paymentWay === "epost") return "border-blue-200 bg-blue-50 text-blue-700";
  if (paymentWay === "cash") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

function getEftposBatchRows(items: InvoicePaymentRow[]) {
  return items.filter((row) => normalizePaymentWay(row.paymentWay) === "epost" && row.invoiceNumber.trim());
}

function getUniqueInvoiceNumbers(items: InvoicePaymentRow[]) {
  return Array.from(new Set(getEftposBatchRows(items).map((row) => row.invoiceNumber.trim()).filter(Boolean))).sort();
}

function normalizeLookupPlate(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function formatDefaultQuickAmount(value?: number | null) {
  return typeof value === "number" && value > 0 ? value.toFixed(2) : "";
}

function createQuickJobForm(defaultQuickService = "puncture", amountInclGst = "", note = ""): QuickJobFormState {
  return {
    plate: "",
    quickService: defaultQuickService,
    amountInclGst,
    serviceDescription: "",
    customerId: null,
    customerType: "",
    customerName: "",
    customerPhone: "",
    customerEmail: "",
    note,
  };
}

function clearQuickJobCustomer(form: QuickJobFormState, plate: string): QuickJobFormState {
  return {
    ...form,
    plate,
    customerId: null,
    customerType: "",
    customerName: "",
    customerPhone: "",
    customerEmail: "",
  };
}

function formatVehicleLookupSummary(payload: VehicleLookupPayload | null) {
  const vehicle = payload?.vehicle;
  if (!vehicle) return "";
  return [vehicle.plate, vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ");
}

function formatLinkedCustomer(payload: VehicleLookupPayload | null) {
  const customer = payload?.linkedCustomer?.customer;
  if (!customer) return "";
  return [customer.businessCode, customer.name, customer.phone, customer.email].filter(Boolean).join(" · ");
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

function getNzDayUtcRange(dateValue: string) {
  const start = new Date(`${dateValue}T00:00:00`);
  const end = new Date(`${dateValue}T23:59:59.999`);
  return {
    fromUtc: start.toISOString(),
    toUtc: end.toISOString(),
  };
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
  const [paymarkDate, setPaymarkDate] = useState(() => formatDateInputValue(new Date()));
  const [paymarkRows, setPaymarkRows] = useState<PaymarkTransactionRow[]>([]);
  const [paymarkLoading, setPaymarkLoading] = useState(false);
  const [paymarkSyncing, setPaymarkSyncing] = useState(false);
  const [paymarkMessage, setPaymarkMessage] = useState("");
  const [paymarkError, setPaymarkError] = useState("");
  const [activePaymarkId, setActivePaymarkId] = useState<string | null>(null);
  const [paymarkActionMode, setPaymarkActionMode] = useState<PaymarkActionMode>("match");
  const [paymarkActionSaving, setPaymarkActionSaving] = useState(false);
  const [paymarkSettlementId, setPaymarkSettlementId] = useState<string | null>(null);
  const [paymarkActionError, setPaymarkActionError] = useState("");
  const [paymarkNote, setPaymarkNote] = useState("");
  const [paymarkQuickOptions, setPaymarkQuickOptions] = useState<PaymarkQuickJobOption[]>([]);
  const [paymarkQuickOptionsError, setPaymarkQuickOptionsError] = useState("");
  const [jobSearch, setJobSearch] = useState("");
  const [jobSearchRows, setJobSearchRows] = useState<JobSearchRow[]>([]);
  const [jobSearchLoading, setJobSearchLoading] = useState(false);
  const [quickJobForm, setQuickJobForm] = useState<QuickJobFormState>(() => createQuickJobForm());
  const [preQuickJobForm, setPreQuickJobForm] = useState<QuickJobFormState>(() => createQuickJobForm());
  const [preQuickJobSaving, setPreQuickJobSaving] = useState(false);
  const [preQuickJobError, setPreQuickJobError] = useState("");
  const [preQuickJobMessage, setPreQuickJobMessage] = useState("");
  const [eftposBatchBankAmounts, setEftposBatchBankAmounts] = useState<Record<string, string>>({});
  const [eftposBatchResults, setEftposBatchResults] = useState<Record<string, EftposXeroBatchResult | null>>({});
  const [eftposBatchErrors, setEftposBatchErrors] = useState<Record<string, string>>({});
  const [eftposBatchPostingDate, setEftposBatchPostingDate] = useState<string | null>(null);
  const [eftposBatchHistory, setEftposBatchHistory] = useState<EftposXeroBatchHistory[]>([]);
  const [preVehicleLookup, setPreVehicleLookup] = useState<VehicleLookupState>({
    loading: false,
    error: "",
    payload: null,
  });
  const [inlineVehicleLookup, setInlineVehicleLookup] = useState<VehicleLookupState>({
    loading: false,
    error: "",
    payload: null,
  });

  const loadInvoicePayments = useCallback(async () => {
    setLoading(true);
    setError("");
    setActionError("");
    const res = await requestJson<{ payments?: InvoicePaymentRow[]; eftposBatches?: EftposXeroBatchHistory[] }>("/api/invoice-payments");

    if (!res.ok) {
      setError(res.error || "Failed to load invoice payments.");
      setLoading(false);
      return;
    }

    const payments = Array.isArray(res.data?.payments) ? res.data!.payments : [];
    setRows(sortInvoicePaymentRows(payments));
    setEftposBatchHistory(Array.isArray(res.data?.eftposBatches) ? res.data!.eftposBatches : []);
    setExpandedDates(
      payments.reduce<Record<string, boolean>>((acc, row, index) => {
        const groupDate = resolvePaymentGroupDate(row);
        if (!(groupDate in acc)) acc[groupDate] = index === 0;
        return acc;
      }, {})
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadInvoicePayments();
  }, [loadInvoicePayments]);

  useEffect(() => {
    let cancelled = false;

    const loadPaymarkTransactions = async () => {
      setPaymarkLoading(true);
      setPaymarkError("");
      setPaymarkMessage("");
      const range = getNzDayUtcRange(paymarkDate);
      const params = new URLSearchParams(range);
      const res = await requestJson<{ transactions?: PaymarkTransactionRow[] }>(
        `/api/paymark-transactions?${params.toString()}`
      );
      if (cancelled) return;

      if (!res.ok) {
        setPaymarkError(res.error || "Failed to load Paymark transactions.");
        setPaymarkLoading(false);
        return;
      }

      setPaymarkRows(Array.isArray(res.data?.transactions) ? res.data!.transactions : []);
      setPaymarkLoading(false);
    };

    void loadPaymarkTransactions();
    return () => {
      cancelled = true;
    };
  }, [paymarkDate]);

  useEffect(() => {
    let cancelled = false;

    const loadPaymarkQuickOptions = async () => {
      const res = await requestJson<{ options?: PaymarkQuickJobOption[] }>("/api/paymark-transactions/quick-job-options");
      if (cancelled) return;

      if (!res.ok) {
        setPaymarkQuickOptionsError(res.error || "Failed to load quick job options.");
        setPaymarkQuickOptions([]);
        return;
      }

      setPaymarkQuickOptions(Array.isArray(res.data?.options) ? res.data!.options : []);
      setPaymarkQuickOptionsError("");
    };

    void loadPaymarkQuickOptions();
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
  const unresolvedPaymarkRows = useMemo(
    () => paymarkRows.filter((row) => !row.paymentRecorded),
    [paymarkRows]
  );
  const activePaymarkQuickOptions = useMemo(
    () => paymarkQuickOptions.filter((option) => option.isActive),
    [paymarkQuickOptions]
  );
  const defaultQuickJobCode = activePaymarkQuickOptions[0]?.code || "puncture";
  const selectedQuickJobOption = useMemo(
    () => activePaymarkQuickOptions.find((option) => option.code === quickJobForm.quickService),
    [activePaymarkQuickOptions, quickJobForm.quickService]
  );
  const selectedPreQuickJobOption = useMemo(
    () => activePaymarkQuickOptions.find((option) => option.code === preQuickJobForm.quickService),
    [activePaymarkQuickOptions, preQuickJobForm.quickService]
  );

  useEffect(() => {
    if (activePaymarkQuickOptions.length === 0) return;

    setQuickJobForm((prev) =>
      activePaymarkQuickOptions.some((option) => option.code === prev.quickService)
        ? prev
        : { ...prev, quickService: defaultQuickJobCode }
    );
    setPreQuickJobForm((prev) => {
      if (activePaymarkQuickOptions.some((option) => option.code === prev.quickService)) return prev;
      const option = activePaymarkQuickOptions[0];
      return {
        ...prev,
        quickService: option.code,
        amountInclGst: prev.amountInclGst || formatDefaultQuickAmount(option.defaultAmountInclGst),
      };
    });
  }, [activePaymarkQuickOptions, defaultQuickJobCode]);

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

  const syncPaymarkTransactions = async () => {
    setPaymarkSyncing(true);
    setPaymarkError("");
    setPaymarkMessage("If a Paymark login window opens, please login there. Sync will continue automatically.");
    const range = getNzDayUtcRange(paymarkDate);

    try {
      const res = await requestJson<{
        imported?: number;
        updated?: number;
        totalResults?: number;
        transactions?: PaymarkTransactionRow[];
      }>("/api/paymark-transactions/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(range),
      });

      if (!res.ok) {
        setPaymarkError(res.error || "Failed to sync Paymark transactions.");
        return;
      }

      setPaymarkRows(Array.isArray(res.data?.transactions) ? res.data!.transactions : []);
      setPaymarkMessage(
        `Paymark synced. Imported ${res.data?.imported ?? 0}, updated ${res.data?.updated ?? 0}, total ${res.data?.totalResults ?? 0}.`
      );
    } catch (err) {
      setPaymarkError(err instanceof Error ? err.message : "Failed to sync Paymark transactions.");
    } finally {
      setPaymarkSyncing(false);
    }
  };

  const updatePaymarkRow = (nextRow: PaymarkTransactionRow) => {
    setPaymarkRows((current) => current.map((row) => (row.id === nextRow.id ? nextRow : row)));
  };

  const openPaymarkAction = (row: PaymarkTransactionRow, mode: PaymarkActionMode) => {
    setActivePaymarkId((current) => (current === row.id && paymarkActionMode === mode ? null : row.id));
    setPaymarkActionMode(mode);
    setPaymarkActionError("");
    setPaymarkNote(row.localNote || "");
    setJobSearch("");
    setJobSearchRows([]);
    setJobSearchLoading(false);
    setInlineVehicleLookup({ loading: false, error: "", payload: null });
    setQuickJobForm(createQuickJobForm(defaultQuickJobCode, "", row.localNote || ""));
  };

  const applyVehicleLookupToForm = useCallback((
    payload: VehicleLookupPayload,
    setForm: React.Dispatch<React.SetStateAction<QuickJobFormState>>
  ) => {
    const customer = payload.linkedCustomer?.customer;
    if (!customer) return;

    const parsedCustomerId = Number(customer.id);
    setForm((prev) => ({
      ...prev,
      customerId: Number.isFinite(parsedCustomerId) && parsedCustomerId > 0 ? parsedCustomerId : null,
      customerType: customer.type || "",
      customerName: customer.name || "",
      customerPhone: customer.phone || "",
      customerEmail: customer.email || "",
    }));
  }, []);

  useEffect(() => {
    const normalized = normalizeLookupPlate(preQuickJobForm.plate);
    if (normalized.length < 2) {
      setPreVehicleLookup({ loading: false, error: "", payload: null });
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setPreVehicleLookup((prev) => ({ ...prev, loading: true, error: "" }));
      const res = await requestJson<VehicleLookupPayload>(`/api/vehicles/by-plate?plate=${encodeURIComponent(normalized)}`);
      if (cancelled) return;

      if (!res.ok || !res.data) {
        setPreVehicleLookup({
          loading: false,
          error: res.status === 404 ? "" : res.error || "Vehicle lookup failed.",
          payload: null,
        });
        return;
      }

      setPreVehicleLookup({ loading: false, error: "", payload: res.data });
      applyVehicleLookupToForm(res.data, setPreQuickJobForm);
    }, 400);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [applyVehicleLookupToForm, preQuickJobForm.plate]);

  useEffect(() => {
    if (!activePaymarkId || paymarkActionMode !== "quick") return;

    const normalized = normalizeLookupPlate(quickJobForm.plate);
    if (normalized.length < 2) {
      setInlineVehicleLookup({ loading: false, error: "", payload: null });
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setInlineVehicleLookup((prev) => ({ ...prev, loading: true, error: "" }));
      const res = await requestJson<VehicleLookupPayload>(`/api/vehicles/by-plate?plate=${encodeURIComponent(normalized)}`);
      if (cancelled) return;

      if (!res.ok || !res.data) {
        setInlineVehicleLookup({
          loading: false,
          error: res.status === 404 ? "" : res.error || "Vehicle lookup failed.",
          payload: null,
        });
        return;
      }

      setInlineVehicleLookup({ loading: false, error: "", payload: res.data });
      applyVehicleLookupToForm(res.data, setQuickJobForm);
    }, 400);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [activePaymarkId, applyVehicleLookupToForm, paymarkActionMode, quickJobForm.plate]);

  useEffect(() => {
    if (!activePaymarkId || paymarkActionMode !== "match") return;

    const keyword = jobSearch.trim();
    if (keyword.length < 2) {
      setJobSearchRows([]);
      setJobSearchLoading(false);
      return;
    }

    let cancelled = false;
    setJobSearchLoading(true);
    setPaymarkActionError("");

    const timer = window.setTimeout(async () => {
      const params = new URLSearchParams({
        q: keyword,
        page: "1",
        pageSize: "10",
      });
      const res = await requestJson<{ items?: JobSearchRow[] }>(`/api/jobs?${params.toString()}`);
      if (cancelled) return;

      if (!res.ok) {
        setPaymarkActionError(res.error || "Failed to search jobs.");
        setJobSearchRows([]);
        setJobSearchLoading(false);
        return;
      }

      setJobSearchRows(Array.isArray(res.data?.items) ? res.data!.items : []);
      setJobSearchLoading(false);
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [activePaymarkId, jobSearch, paymarkActionMode]);

  const savePaymarkNote = async (row: PaymarkTransactionRow) => {
    setPaymarkActionSaving(true);
    setPaymarkActionError("");
    try {
      const res = await requestJson<{ transaction?: PaymarkTransactionRow }>(
        `/api/paymark-transactions/${encodeURIComponent(row.id)}/note`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ note: paymarkNote }),
        }
      );
      if (!res.ok || !res.data?.transaction) {
        setPaymarkActionError(res.error || "Failed to save note.");
        return;
      }
      updatePaymarkRow(res.data.transaction);
      setActivePaymarkId(null);
    } finally {
      setPaymarkActionSaving(false);
    }
  };

  const matchPaymarkJob = async (row: PaymarkTransactionRow, jobId: string) => {
    if (!jobId.trim()) {
      setPaymarkActionError("Please select a job.");
      return;
    }

    setPaymarkActionSaving(true);
    setPaymarkActionError("");
    try {
      const res = await requestJson<{
        transaction?: PaymarkTransactionRow;
        paymentRecorded?: boolean;
        archived?: boolean;
        message?: string;
      }>(
        `/api/paymark-transactions/${encodeURIComponent(row.id)}/match`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobId: Number(jobId) }),
        }
      );
      if (!res.ok || !res.data?.transaction) {
        setPaymarkActionError(res.error || "Failed to match job.");
        return;
      }
      updatePaymarkRow(res.data.transaction);
      if (res.data.paymentRecorded) {
        setPaymarkMessage(res.data.message || "Paymark payment recorded and job archived.");
        await loadInvoicePayments();
      } else {
        setPaymarkMessage(res.data.message || "Paymark transaction matched.");
      }
      setActivePaymarkId(null);
    } finally {
      setPaymarkActionSaving(false);
    }
  };

  const retryPaymarkSettlement = async (row: PaymarkTransactionRow) => {
    setPaymarkSettlementId(row.id);
    setPaymarkError("");
    setPaymarkMessage("");
    try {
      const res = await requestJson<{
        transaction?: PaymarkTransactionRow;
        paymentRecorded?: boolean;
        archived?: boolean;
        message?: string;
      }>(`/api/paymark-transactions/${encodeURIComponent(row.id)}/settle`, {
        method: "POST",
      });

      if (!res.ok || !res.data?.transaction) {
        setPaymarkError(res.error || "Failed to update Paymark settlement.");
        return;
      }

      updatePaymarkRow(res.data.transaction);
      setPaymarkMessage(res.data.message || "Paymark settlement updated.");
      if (res.data.paymentRecorded) {
        await loadInvoicePayments();
      }
    } catch (err) {
      setPaymarkError(err instanceof Error ? err.message : "Failed to update Paymark settlement.");
    } finally {
      setPaymarkSettlementId(null);
    }
  };

  const createQuickPaymarkJob = async (row: PaymarkTransactionRow) => {
    if (!quickJobForm.plate.trim()) {
      setPaymarkActionError("Rego/VIN/Chassis is required.");
      return;
    }
    if (!quickJobForm.quickService.trim()) {
      setPaymarkActionError("Please select a quick job option.");
      return;
    }

    setPaymarkActionSaving(true);
    setPaymarkActionError("");
    try {
      const res = await requestJson<{ transaction?: PaymarkTransactionRow; jobId?: string }>(
        `/api/paymark-transactions/${encodeURIComponent(row.id)}/quick-job`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(quickJobForm),
        }
      );
      if (!res.ok || !res.data?.transaction) {
        setPaymarkActionError(res.error || "Failed to create quick job.");
        return;
      }
      updatePaymarkRow(res.data.transaction);
      await loadInvoicePayments();
      setPaymarkMessage(
        `Quick job #${res.data.jobId || res.data.transaction.matchedJobId} created, Xero invoice authorised, and EFTPOS payment recorded.`
      );
      setActivePaymarkId(null);
    } finally {
      setPaymarkActionSaving(false);
    }
  };

  const changePreQuickService = (quickService: string) => {
    const option = activePaymarkQuickOptions.find((item) => item.code === quickService);
    setPreQuickJobForm((prev) => ({
      ...prev,
      quickService,
      amountInclGst: formatDefaultQuickAmount(option?.defaultAmountInclGst) || prev.amountInclGst,
    }));
  };

  const changeInlineQuickService = (quickService: string) => {
    setQuickJobForm((prev) => ({ ...prev, quickService }));
  };

  const createPreQuickJob = async () => {
    if (!preQuickJobForm.plate.trim()) {
      setPreQuickJobError("Rego/VIN/Chassis is required.");
      return;
    }
    if (!preQuickJobForm.quickService.trim()) {
      setPreQuickJobError("Please select a quick job option.");
      return;
    }

    const amountInclGst = Number(preQuickJobForm.amountInclGst);
    if (!Number.isFinite(amountInclGst) || amountInclGst <= 0) {
      setPreQuickJobError("Amount incl. GST is required.");
      return;
    }

    setPreQuickJobSaving(true);
    setPreQuickJobError("");
    setPreQuickJobMessage("");
    try {
      const res = await requestJson<{
        jobId?: string;
        invoice?: {
          externalInvoiceNumber?: string;
          externalStatus?: string;
        } | null;
      }>("/api/paymark-transactions/quick-job", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...preQuickJobForm,
          amountInclGst,
        }),
      });

      if (!res.ok || !res.data?.jobId) {
        setPreQuickJobError(res.error || "Failed to create quick job.");
        return;
      }

      const invoiceLabel = res.data.invoice?.externalInvoiceNumber
        ? ` · ${res.data.invoice.externalInvoiceNumber} ${res.data.invoice.externalStatus || ""}`.trimEnd()
        : "";
      setPreQuickJobMessage(`Quick job #${res.data.jobId} created${invoiceLabel}.`);
      setPreQuickJobForm(createQuickJobForm(defaultQuickJobCode, formatDefaultQuickAmount(selectedPreQuickJobOption?.defaultAmountInclGst)));
      setPreVehicleLookup({ loading: false, error: "", payload: null });
    } finally {
      setPreQuickJobSaving(false);
    }
  };

  const getEftposBatchBankAmount = (date: string, defaultAmount: number) =>
    eftposBatchBankAmounts[date] ?? defaultAmount.toFixed(2);

  const runEftposXeroBatch = async (group: { date: string; items: InvoicePaymentRow[] }, bankAmountDefault: number) => {
    const invoiceNumbers = getUniqueInvoiceNumbers(group.items);
    if (invoiceNumbers.length === 0) {
      setEftposBatchErrors((prev) => ({ ...prev, [group.date]: "No EFTPOS Xero invoice numbers found for this date." }));
      return;
    }

    const bankAmount = Number(getEftposBatchBankAmount(group.date, bankAmountDefault));
    if (!Number.isFinite(bankAmount) || bankAmount <= 0) {
      setEftposBatchErrors((prev) => ({ ...prev, [group.date]: "POS bank amount is required." }));
      return;
    }

    setEftposBatchPostingDate(group.date);
    setEftposBatchErrors((prev) => ({ ...prev, [group.date]: "" }));

    try {
      const res = await requestJson<{ result?: EftposXeroBatchResult }>(
        "/api/invoice-payments/eftpos-xero-batch/post",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            paymentDate: group.date,
            bankAmount,
            invoiceNumbers,
          }),
        }
      );

      if (!res.ok || !res.data?.result) {
        if (res.data?.result) {
          setEftposBatchResults((prev) => ({ ...prev, [group.date]: res.data!.result! }));
        }
        setEftposBatchErrors((prev) => ({ ...prev, [group.date]: res.error || "Failed to process Xero EFTPOS batch." }));
        return;
      }

      setEftposBatchResults((prev) => ({ ...prev, [group.date]: res.data!.result! }));
      await loadInvoicePayments();
      setEftposBatchResults((prev) => ({ ...prev, [group.date]: null }));
    } catch (err) {
      setEftposBatchErrors((prev) => ({
        ...prev,
        [group.date]: err instanceof Error ? err.message : "Failed to process Xero EFTPOS batch.",
      }));
    } finally {
      setEftposBatchPostingDate(null);
    }
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-[rgba(0,0,0,0.72)]">Invoice Payment</h1>
      </div>

      <Card className="p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-lg font-semibold text-[var(--ds-text)]">Pre-create Quick Job</div>
            <div className="mt-1 text-sm text-[var(--ds-muted)]">Xero awaiting payment</div>
          </div>
          <Button
            type="button"
            href="/eftpos-quick-jobs"
            leftIcon={<Settings2 className="h-4 w-4" />}
          >
            Quick job settings
          </Button>
        </div>

        {preQuickJobError ? <div className="mt-3 text-sm text-red-600">{preQuickJobError}</div> : null}
        {preQuickJobMessage ? <div className="mt-3 text-sm text-emerald-700">{preQuickJobMessage}</div> : null}

        <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(180px,1.1fr)_190px_150px_minmax(180px,1fr)_160px_220px]">
          <div>
            <Input
              value={preQuickJobForm.plate}
              onChange={(event) => {
                setPreVehicleLookup({ loading: false, error: "", payload: null });
                setPreQuickJobForm((prev) => clearQuickJobCustomer(prev, event.target.value));
              }}
              placeholder="Rego/VIN/Chassis"
            />
            {preVehicleLookup.loading ? (
              <div className="mt-1 text-xs text-[var(--ds-muted)]">Checking saved vehicle...</div>
            ) : preVehicleLookup.payload ? (
              <div className="mt-1 text-xs text-blue-700">
                {[formatVehicleLookupSummary(preVehicleLookup.payload), formatLinkedCustomer(preVehicleLookup.payload)]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            ) : preVehicleLookup.error ? (
              <div className="mt-1 text-xs text-red-600">{preVehicleLookup.error}</div>
            ) : null}
          </div>
          <Select value={preQuickJobForm.quickService} onChange={(event) => changePreQuickService(event.target.value)}>
            {activePaymarkQuickOptions.length === 0 ? (
              <option value="">No active quick job options</option>
            ) : (
              activePaymarkQuickOptions.map((option) => (
                <option key={option.id} value={option.code}>
                  {option.label}
                </option>
              ))
            )}
          </Select>
          <Input
            type="number"
            min="0"
            step="0.01"
            value={preQuickJobForm.amountInclGst}
            onChange={(event) => setPreQuickJobForm((prev) => ({ ...prev, amountInclGst: event.target.value }))}
            placeholder="Incl. GST"
          />
          <Input
            value={preQuickJobForm.customerName}
            onChange={(event) => setPreQuickJobForm((prev) => ({ ...prev, customerId: null, customerType: "", customerName: event.target.value }))}
            placeholder="Customer name"
          />
          <Input
            value={preQuickJobForm.customerPhone}
            onChange={(event) => setPreQuickJobForm((prev) => ({ ...prev, customerPhone: event.target.value }))}
            placeholder="Phone"
          />
          <Input
            value={preQuickJobForm.customerEmail}
            onChange={(event) => setPreQuickJobForm((prev) => ({ ...prev, customerEmail: event.target.value }))}
            placeholder="Email"
          />
          {preQuickJobForm.quickService === "other" ? (
            <Input
              className="xl:col-span-2"
              value={preQuickJobForm.serviceDescription}
              onChange={(event) => setPreQuickJobForm((prev) => ({ ...prev, serviceDescription: event.target.value }))}
              placeholder="Service description"
            />
          ) : null}
          <Textarea
            className={preQuickJobForm.quickService === "other" ? "xl:col-span-3" : "xl:col-span-5"}
            rows={2}
            value={preQuickJobForm.note}
            onChange={(event) => setPreQuickJobForm((prev) => ({ ...prev, note: event.target.value }))}
            placeholder="Note"
          />
          <Button
            type="button"
            variant="primary"
            onClick={() => void createPreQuickJob()}
            disabled={preQuickJobSaving || activePaymarkQuickOptions.length === 0}
            className="justify-center"
          >
            {preQuickJobSaving ? "Creating..." : "Create Job"}
          </Button>
        </div>
        {selectedPreQuickJobOption?.description ? (
          <div className="mt-2 text-xs text-[var(--ds-muted)]">{selectedPreQuickJobOption.description}</div>
        ) : null}
      </Card>

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

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 px-5 py-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-lg font-semibold text-[var(--ds-text)]">Paymark Transactions</div>
            <div className="mt-1 text-sm text-[var(--ds-muted)]">
              Sync EFTPOS transactions from the dedicated Paymark browser profile.
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <label className="space-y-1">
              <div className="text-xs font-medium uppercase tracking-[0.04em] text-[var(--ds-muted)]">Transaction Date</div>
              <Input type="date" value={paymarkDate} onChange={(event) => setPaymarkDate(event.target.value)} />
            </label>
            <Button
              type="button"
              onClick={() => void syncPaymarkTransactions()}
              disabled={paymarkSyncing || paymarkLoading}
              className="inline-flex items-center gap-2"
            >
              <RefreshCw className={["h-4 w-4", paymarkSyncing ? "animate-spin" : ""].join(" ")} />
              {paymarkSyncing ? "Syncing..." : "Sync Paymark"}
            </Button>
            <Button
              type="button"
              href="/eftpos-quick-jobs"
              leftIcon={<Settings2 className="h-4 w-4" />}
            >
              Quick job settings
            </Button>
          </div>
        </div>
        {paymarkError ? (
          <div className="border-t border-red-100 bg-red-50 px-5 py-3 text-sm text-red-700">{paymarkError}</div>
        ) : null}
        {paymarkMessage ? (
          <div className="border-t border-emerald-100 bg-emerald-50 px-5 py-3 text-sm text-emerald-700">
            {paymarkMessage}
          </div>
        ) : null}
        {paymarkQuickOptionsError ? (
          <div className="border-t border-amber-100 bg-amber-50 px-5 py-3 text-sm text-amber-700">
            {paymarkQuickOptionsError}
          </div>
        ) : null}
        <div className="border-t border-[var(--ds-border)]">
          <div className="grid grid-cols-[160px_120px_110px_80px_80px_110px_90px_110px_1fr_230px] gap-3 bg-[rgba(0,0,0,0.03)] px-5 py-3 text-xs font-semibold uppercase tracking-[0.04em] text-[var(--ds-muted)]">
            <div>Time</div>
            <div>Terminal</div>
            <div>TXN #</div>
            <div>Last 4</div>
            <div>Card</div>
            <div className="text-right">Purchase</div>
            <div>Status</div>
            <div>Job</div>
            <div>Note</div>
            <div></div>
          </div>
          {paymarkLoading ? (
            <div className="px-5 py-5 text-sm text-[var(--ds-muted)]">Loading Paymark transactions...</div>
          ) : paymarkRows.length === 0 ? (
            <div className="px-5 py-5 text-sm text-[var(--ds-muted)]">No Paymark transactions synced for this date.</div>
          ) : unresolvedPaymarkRows.length === 0 ? (
            <div className="px-5 py-5 text-sm text-[var(--ds-muted)]">
              All Paymark transactions for this date are matched.
            </div>
          ) : (
            unresolvedPaymarkRows.map((row) => {
              const isActive = activePaymarkId === row.id;
              return (
                <div key={row.id} className="border-t border-[var(--ds-border)] first:border-t-0">
                  <div className="grid grid-cols-[160px_120px_110px_80px_80px_110px_90px_110px_1fr_230px] gap-3 px-5 py-3 text-sm text-[var(--ds-text)]">
                    <div className="tabular-nums">{row.transactionTime || row.transactionTimeUtc}</div>
                    <div>{row.terminalId || "-"}</div>
                    <div className="font-medium">{row.transactionNumber || row.retrievalRef || "-"}</div>
                    <div>{row.suffix || "-"}</div>
                    <div>{row.cardLogo || "-"}</div>
                    <div className="text-right tabular-nums">{formatCurrency(row.purchaseAmount ?? row.transactionAmount)}</div>
                    <div>
                      <span className="inline-flex items-center rounded-[999px] border border-emerald-100 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                        {row.status || "-"}
                      </span>
                    </div>
                    <div>
                      {row.matchedJobId ? (
                        <div>
                          <a href={`/jobs/${row.matchedJobId}`} className="font-semibold text-blue-600 hover:underline">
                            #{row.matchedJobId}
                          </a>
                          {!row.paymentRecorded ? (
                            <div className="mt-1 text-[11px] font-medium text-amber-700">
                              {row.matchedInvoiceStatus ? `Invoice ${row.matchedInvoiceStatus}` : "Invoice not ready"}
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <span className="text-[var(--ds-muted)]">Unmatched</span>
                      )}
                    </div>
                    <div className="break-words text-[var(--ds-muted)]">{row.localNote || "-"}</div>
                    <div className="flex flex-wrap justify-end gap-2">
                      {row.matchedJobId && !row.paymentRecorded && row.matchedInvoiceStatus?.toUpperCase() === "AUTHORISED" ? (
                        <button
                          type="button"
                          onClick={() => void retryPaymarkSettlement(row)}
                          disabled={paymarkSettlementId === row.id}
                          className="inline-flex h-8 items-center gap-1 rounded-[8px] border border-amber-200 bg-amber-50 px-2.5 text-xs font-semibold text-amber-700 hover:bg-amber-100 disabled:cursor-wait disabled:opacity-70"
                        >
                          <RefreshCw className={["h-3.5 w-3.5", paymarkSettlementId === row.id ? "animate-spin" : ""].join(" ")} />
                          {paymarkSettlementId === row.id ? "更新中..." : "更新结算"}
                        </button>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => openPaymarkAction(row, "match")}
                        className="inline-flex h-8 items-center gap-1 rounded-[8px] border border-blue-100 bg-blue-50 px-2.5 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                      >
                        <Search className="h-3.5 w-3.5" />
                        Match
                      </button>
                      <button
                        type="button"
                        onClick={() => openPaymarkAction(row, "quick")}
                        className="inline-flex h-8 items-center gap-1 rounded-[8px] border border-emerald-100 bg-emerald-50 px-2.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Quick Job
                      </button>
                      <button
                        type="button"
                        onClick={() => openPaymarkAction(row, "note")}
                        className="inline-flex h-8 items-center gap-1 rounded-[8px] border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                      >
                        <StickyNote className="h-3.5 w-3.5" />
                        Note
                      </button>
                    </div>
                  </div>
                  {isActive ? (
                    <div className="border-t border-[var(--ds-border)] bg-slate-50 px-5 py-4">
                      {paymarkActionError ? <div className="mb-3 text-sm text-red-600">{paymarkActionError}</div> : null}
                      {paymarkActionMode === "match" ? (
                        <div className="space-y-3">
                          <Input
                            value={jobSearch}
                            onChange={(event) => setJobSearch(event.target.value)}
                            placeholder="Search rego, customer, or note"
                            autoFocus
                          />
                          {jobSearchLoading ? (
                            <div className="text-sm text-[var(--ds-muted)]">Searching...</div>
                          ) : jobSearch.trim().length >= 2 && jobSearchRows.length === 0 ? (
                            <div className="text-sm text-[var(--ds-muted)]">No matching open jobs found.</div>
                          ) : null}
                          {jobSearchRows.length > 0 ? (
                            <div className="overflow-hidden rounded-[8px] border border-[var(--ds-border)] bg-white">
                              {jobSearchRows.map((job) => (
                                <button
                                  key={job.id}
                                  type="button"
                                  onClick={() => void matchPaymarkJob(row, job.id)}
                                  disabled={paymarkActionSaving}
                                  className="grid w-full grid-cols-[90px_120px_1fr_140px_110px_90px] gap-3 border-t border-[var(--ds-border)] bg-white px-3 py-2 text-left text-sm first:border-t-0 hover:bg-blue-50 disabled:cursor-wait disabled:opacity-70"
                                >
                                  <span className="font-semibold">#{job.id}</span>
                                  <span className="font-semibold text-blue-600">{job.plate || "-"}</span>
                                  <span>{job.vehicleModel || "-"}</span>
                                  <span>{job.customerCode || job.customerName || "-"}</span>
                                  <span className="text-xs text-[var(--ds-muted)]">{job.createdAt}</span>
                                  <span className="text-xs font-semibold text-blue-700">
                                    {paymarkActionSaving ? "Saving..." : "Match"}
                                  </span>
                                </button>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                      {paymarkActionMode === "quick" ? (
                        <div className="grid gap-3 lg:grid-cols-3">
                          <Input
                            value={quickJobForm.plate}
                            onChange={(event) => {
                              setInlineVehicleLookup({ loading: false, error: "", payload: null });
                              setQuickJobForm((prev) => clearQuickJobCustomer(prev, event.target.value));
                            }}
                            placeholder="Rego/VIN/Chassis"
                          />
                          {inlineVehicleLookup.loading || inlineVehicleLookup.payload || inlineVehicleLookup.error ? (
                            <div className="text-xs lg:col-span-3">
                              {inlineVehicleLookup.loading ? (
                                <span className="text-[var(--ds-muted)]">Checking saved vehicle...</span>
                              ) : inlineVehicleLookup.payload ? (
                                <span className="text-blue-700">
                                  {[formatVehicleLookupSummary(inlineVehicleLookup.payload), formatLinkedCustomer(inlineVehicleLookup.payload)]
                                    .filter(Boolean)
                                    .join(" · ")}
                                </span>
                              ) : inlineVehicleLookup.error ? (
                                <span className="text-red-600">{inlineVehicleLookup.error}</span>
                              ) : null}
                            </div>
                          ) : null}
                          <Select
                            value={quickJobForm.quickService}
                            onChange={(event) => changeInlineQuickService(event.target.value)}
                          >
                            {activePaymarkQuickOptions.length === 0 ? (
                              <option value="">No active quick job options</option>
                            ) : (
                              activePaymarkQuickOptions.map((option) => (
                                <option key={option.id} value={option.code}>
                                  {option.label}
                                </option>
                              ))
                            )}
                          </Select>
                          <Input
                            value={quickJobForm.customerName}
                            onChange={(event) =>
                              setQuickJobForm((prev) => ({
                                ...prev,
                                customerId: null,
                                customerType: "",
                                customerName: event.target.value,
                              }))
                            }
                            placeholder="Customer name (optional)"
                          />
                          {quickJobForm.quickService === "other" ? (
                            <Input
                              value={quickJobForm.serviceDescription}
                              onChange={(event) => setQuickJobForm((prev) => ({ ...prev, serviceDescription: event.target.value }))}
                              placeholder="Service description"
                            />
                          ) : null}
                          <Input
                            value={quickJobForm.customerPhone}
                            onChange={(event) => setQuickJobForm((prev) => ({ ...prev, customerPhone: event.target.value }))}
                            placeholder="Phone (optional)"
                          />
                          <Input
                            value={quickJobForm.customerEmail}
                            onChange={(event) => setQuickJobForm((prev) => ({ ...prev, customerEmail: event.target.value }))}
                            placeholder="Email (optional)"
                          />
                          <div className="lg:col-span-3">
                            <Textarea
                              rows={2}
                              value={quickJobForm.note}
                              onChange={(event) => setQuickJobForm((prev) => ({ ...prev, note: event.target.value }))}
                              placeholder="Optional note"
                            />
                          </div>
                          <div className="lg:col-span-3">
                            <div className="mb-2 text-xs text-[var(--ds-muted)]">
                              Invoice amount will be {formatCurrencyBadge(row.purchaseAmount ?? row.transactionAmount)} incl. GST
                              {selectedQuickJobOption?.description ? ` · ${selectedQuickJobOption.description}` : ""}
                            </div>
                            <Button
                              type="button"
                              onClick={() => void createQuickPaymarkJob(row)}
                              disabled={paymarkActionSaving || activePaymarkQuickOptions.length === 0}
                            >
                              {paymarkActionSaving ? "Creating..." : "Create job, authorise invoice, and match"}
                            </Button>
                          </div>
                        </div>
                      ) : null}
                      {paymarkActionMode === "note" ? (
                        <div className="grid gap-3 lg:grid-cols-[1fr_120px]">
                          <Textarea rows={2} value={paymarkNote} onChange={(event) => setPaymarkNote(event.target.value)} />
                          <Button type="button" onClick={() => void savePaymarkNote(row)} disabled={paymarkActionSaving}>
                            {paymarkActionSaving ? "Saving..." : "Save note"}
                          </Button>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })
          )}
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
            const paymentSummary = summarizePayments(group.items);
            const postedBatches = eftposBatchHistory.filter((batch) => batch.paymentDate === group.date);
            const postedInvoiceNumbers = new Set(
              postedBatches.flatMap((batch) => batch.invoiceNumbers).map((value) => value.trim().toUpperCase())
            );
            const unpostedEftposItems = group.items.filter(
              (row) => normalizePaymentWay(row.paymentWay) === "epost"
                && !postedInvoiceNumbers.has(row.invoiceNumber.trim().toUpperCase())
            );
            const unpostedEftposTotal = summarizePayments(unpostedEftposItems).eftpos;
            const eftposInvoiceNumbers = getUniqueInvoiceNumbers(unpostedEftposItems);
            const eftposBatchResult = eftposBatchResults[group.date];
            const eftposBatchError = eftposBatchErrors[group.date];
            const eftposBankAmount = getEftposBatchBankAmount(group.date, unpostedEftposTotal);
            const canRunEftposBatch = eftposInvoiceNumbers.length > 0 && unpostedEftposTotal > 0;
            return (
              <Card key={group.date} className="overflow-hidden">
                <div className="flex flex-col gap-3 px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex-1">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-lg font-semibold text-[var(--ds-text)]">{formatNzDateTitle(group.date)}</div>
                        {postedBatches.length > 0 ? (
                          <span className="inline-flex items-center rounded-[999px] border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                            ✓ Xero Batch Posted{postedBatches.length > 1 ? ` × ${postedBatches.length}` : ""}
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-1 text-sm text-[var(--ds-muted)]">Invoice 总数：{group.items.length}</div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                    <div className="inline-flex items-center gap-2 rounded-[999px] border border-blue-100 bg-blue-50 px-3 py-1.5 text-sm">
                      <span className="font-medium text-blue-700">Eftpos</span>
                      <span className="font-semibold text-blue-900">{formatCurrencyBadge(paymentSummary.eftpos)}</span>
                      {postedBatches.length > 0 ? <span className="font-semibold text-emerald-700">✓ Posted</span> : null}
                    </div>
                    <div className="inline-flex items-center gap-2 rounded-[999px] border border-emerald-100 bg-emerald-50 px-3 py-1.5 text-sm">
                      <span className="font-medium text-emerald-700">Cash</span>
                      <span className="font-semibold text-emerald-900">{formatCurrencyBadge(paymentSummary.cash)}</span>
                    </div>
                    <div className="inline-flex items-center gap-2 rounded-[999px] border border-[rgba(0,0,0,0.10)] bg-white px-3 py-1.5 text-sm">
                      <span className="font-medium text-[var(--ds-muted)]">Total</span>
                      <span className="font-semibold text-[var(--ds-text)]">{formatCurrencyBadge(paymentSummary.total)}</span>
                    </div>
                    {canRunEftposBatch ? <div className="flex items-center gap-2 rounded-[10px] border border-[rgba(0,0,0,0.10)] bg-white px-2 py-1.5">
                      <span className="whitespace-nowrap text-xs font-semibold text-[var(--ds-muted)]">POS bank</span>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        value={eftposBankAmount}
                        onChange={(event) => {
                          setEftposBatchBankAmounts((prev) => ({ ...prev, [group.date]: event.target.value }));
                          setEftposBatchResults((prev) => ({ ...prev, [group.date]: null }));
                          setEftposBatchErrors((prev) => ({ ...prev, [group.date]: "" }));
                        }}
                        className="h-8 w-[110px] text-right"
                      />
                    </div> : null}
                    {canRunEftposBatch ? <button
                      type="button"
                      onClick={() => void runEftposXeroBatch({ date: group.date, items: unpostedEftposItems }, unpostedEftposTotal)}
                      disabled={
                        !canRunEftposBatch ||
                        eftposBatchPostingDate === group.date ||
                        Boolean(eftposBatchResult?.posted)
                      }
                      className="inline-flex h-10 items-center rounded-[10px] border border-emerald-100 bg-emerald-50 px-3 text-sm font-semibold text-emerald-700 transition hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {eftposBatchPostingDate === group.date ? "Checking & posting..." : "Check & Post"}
                    </button> : null}
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

                {eftposBatchError ? (
                  <div className="border-t border-red-100 bg-red-50 px-5 py-3 text-sm text-red-700">{eftposBatchError}</div>
                ) : null}
                {isExpanded ? (
                  <div className="border-t border-[var(--ds-border)]">
                    {postedBatches.length > 0 || eftposBatchResult?.ok ? (
                      <div className="border-b border-[var(--ds-border)] bg-slate-50 px-5 py-4">
                        <div className="mb-2 text-xs font-semibold uppercase tracking-[0.04em] text-[var(--ds-muted)]">Xero Batch History</div>
                        <div className="grid gap-2 lg:grid-cols-2">
                          {postedBatches.map((batch) => (
                            <div key={batch.batchPaymentId} className="rounded-[10px] border border-emerald-200 bg-white px-3 py-2.5">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="text-sm font-semibold text-emerald-700">✓ Posted</span>
                                <span className="font-mono text-[11px] text-[var(--ds-muted)]">{batch.batchPaymentId}</span>
                              </div>
                              <div className="mt-1.5 text-sm text-[var(--ds-text)]">
                                {batch.invoiceCount} invoice(s) · {formatCurrencyBadge(batch.bankAmount)}
                              </div>
                              <div className="mt-0.5 text-xs text-[var(--ds-muted)]">
                                {[batch.accountName, batch.postedAt].filter(Boolean).join(" · ")}
                              </div>
                            </div>
                          ))}
                          {eftposBatchResult?.ok && !eftposBatchResult.posted ? (
                            <div className="rounded-[10px] border border-blue-200 bg-white px-3 py-2.5 text-sm text-blue-800">
                              Ready for Xero batch · {eftposBatchResult.invoices?.length ?? 0} invoice(s) · {formatCurrencyBadge(eftposBatchResult.bankAmount)}
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ) : null}
                    <div className="grid grid-cols-[110px_150px_1fr_1fr_1fr_120px_120px_140px_240px_1fr] gap-3 bg-[rgba(0,0,0,0.03)] px-5 py-3 text-xs font-semibold uppercase tracking-[0.04em] text-[var(--ds-muted)]">
                      <div>Job ID</div>
                      <div>Invoice Number</div>
                      <div>Contact</div>
                      <div>Reference</div>
                      <div>Job Note</div>
                      <div className="text-right">Xero Total</div>
                      <div className="text-right">Payment Total</div>
                      <div>Payment Way</div>
                      <div>Payment Date</div>
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
                            <div className="text-right tabular-nums">{formatCurrency(row.xeroTotal)}</div>
                            <div className="text-right tabular-nums">{formatCurrency(row.paymentTotal ?? row.amount)}</div>
                            <div>
                              <span
                                className={[
                                  "inline-flex items-center rounded-[999px] border px-2.5 py-1 text-xs font-semibold",
                                  getPaymentWayBadgeClass(row.paymentWay),
                                ].join(" ")}
                              >
                                {formatPaymentWay(row.paymentWay)}
                              </span>
                            </div>
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
                                <button
                                  type="button"
                                  onClick={() => startEditingPaymentDate(row)}
                                  className="block text-left font-medium text-[var(--ds-text)] transition hover:text-blue-700 hover:underline"
                                  title="Click to edit payment date"
                                >
                                  {row.paymentDateTime || row.paymentDate || "-"}
                                </button>
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
