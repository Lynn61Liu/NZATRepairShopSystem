import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CalendarDays, CheckCircle2, Clock3, FileText, Search, Trash2, Undo2 } from "lucide-react";
import { Card, EmptyState, Input, Select, useToast } from "@/components/ui";
import {
  deleteCourtesyCarAgreement,
  fetchCourtesyCarAgreementHistory,
  returnCourtesyCarAgreement,
} from "@/features/courtesyCarAgreements/api";
import type { CourtesyCarAgreementListItem } from "@/features/courtesyCarAgreements/types";
import { formatNzDate } from "@/utils/date";

type AgreementHistoryStatusFilter = "all" | "draft" | "inprogress" | "active" | "submitted" | "closed";
type AgreementHistoryStatus = AgreementHistoryStatusFilter | "cancelled";

type AgreementHistoryRow = CourtesyCarAgreementListItem & {
  historyStatus: AgreementHistoryStatus;
};

const statusOptions: Array<{ value: AgreementHistoryStatusFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "inprogress", label: "In progress" },
  { value: "active", label: "Active" },
  { value: "submitted", label: "Submitted" },
  { value: "closed", label: "Closed" },
];

function normalizeHistoryStatus(status: CourtesyCarAgreementListItem["status"]): AgreementHistoryStatus {
  if (status === "draft") return "draft";
  if (status === "in_progress" || status === "inprogress") return "inprogress";
  if (status === "active") return "active";
  if (status === "submitted") return "submitted";
  if (status === "closed") return "closed";
  return "cancelled";
}

function historyStatusLabel(status: AgreementHistoryStatus) {
  if (status === "draft") return "Draft";
  if (status === "inprogress") return "In progress";
  if (status === "active") return "Active";
  if (status === "submitted") return "Submitted";
  if (status === "closed") return "Closed";
  return "Cancelled";
}

function historyStatusTone(status: AgreementHistoryStatus) {
  if (status === "draft") return "neutral";
  if (status === "inprogress") return "primary";
  if (status === "active") return "warning";
  if (status === "submitted") return "success";
  if (status === "closed") return "neutral";
  return "danger";
}

function historyStatusIcon(status: AgreementHistoryStatus) {
  if (status === "draft") return <FileText className="h-3.5 w-3.5" />;
  if (status === "inprogress") return <Clock3 className="h-3.5 w-3.5" />;
  if (status === "active") return <Clock3 className="h-3.5 w-3.5" />;
  if (status === "submitted") return <CheckCircle2 className="h-3.5 w-3.5" />;
  if (status === "closed") return <CheckCircle2 className="h-3.5 w-3.5" />;
  return <CheckCircle2 className="h-3.5 w-3.5" />;
}

function formatCompactDateTime(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-NZ", {
    timeZone: "Pacific/Auckland",
    day: "numeric",
    month: "short",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function parseFilterDate(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;

  const nzMatch = trimmed.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!nzMatch) return null;
  const [, day, month, year] = nzMatch;
  return `${year}-${month}-${day}`;
}

function rowDateKey(value?: string | null) {
  return formatNzDate(value ?? undefined);
}

function matchesSearch(row: AgreementHistoryRow, search: string) {
  if (!search) return true;
  const haystack = [
    row.jobCustomerName,
    row.jobVehiclePlate,
    row.vehiclePlate,
    row.vehicleMake,
    row.vehicleModel,
    historyStatusLabel(row.historyStatus),
    row.currentStep,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(search.toLowerCase());
}

function resolveOutAt(row: AgreementHistoryRow) {
  return row.submittedAt ?? row.createdAt;
}

function resolveReturnAt(row: AgreementHistoryRow) {
  return row.closedAt ?? row.cancelledAt ?? null;
}

function StatusPill({ status }: { status: AgreementHistoryStatus }) {
  const tone = historyStatusTone(status);
  const icon = historyStatusIcon(status);
  const toneClasses: Record<string, string> = {
    primary: "bg-[rgba(37,99,235,0.10)] text-[var(--ds-primary)] border-[rgba(37,99,235,0.18)]",
    success: "bg-emerald-100 text-emerald-800 border-emerald-200",
    warning: "bg-amber-100 text-amber-800 border-amber-200",
    danger: "bg-red-100 text-red-800 border-red-200",
    neutral: "bg-slate-100 text-slate-700 border-slate-200",
  };

  return (
    <span
      className={[
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold",
        toneClasses[tone],
      ].join(" ")}
    >
      {icon}
      {historyStatusLabel(status)}
    </span>
  );
}

function EmailStatus({ sentAt, returnedAt }: { sentAt?: string | null; returnedAt?: string | null }) {
  const sent = Boolean(sentAt);
  const returned = Boolean(returnedAt);

  if (!sent && !returned) return <span className="text-sm text-slate-400">—</span>;

  return (
    <div className="space-y-1 text-sm">
      {sent ? (
        <div className="flex items-center gap-2 font-medium text-emerald-700">
          <CheckCircle2 className="h-4 w-4" />
          <span>Sent</span>
        </div>
      ) : null}
      {returned ? (
        <div className="flex items-center gap-2 font-medium text-emerald-700">
          <CheckCircle2 className="h-4 w-4" />
          <span>Return</span>
        </div>
      ) : null}
    </div>
  );
}

export function AgreementHistoryPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<AgreementHistoryRow[]>([]);
  const [search, setSearch] = useState(() => searchParams.get("search") ?? "");
  const [statusFilter, setStatusFilter] = useState<AgreementHistoryStatusFilter>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [returningId, setReturningId] = useState<number | null>(null);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = "借车协议管理";
    return () => {
      document.title = previousTitle;
    };
  }, []);

  useEffect(() => {
    setSearch(searchParams.get("search") ?? "");
  }, [searchParams]);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError(null);
      const res = await fetchCourtesyCarAgreementHistory();
      if (cancelled) return;

      if (!res.ok) {
        setItems([]);
        setError(res.error || "Failed to load agreement history.");
        setLoading(false);
        return;
      }

      const rows = Array.isArray(res.data?.items) ? res.data.items : [];
      setItems(
        rows
          .map((row) => ({
            ...row,
            historyStatus: normalizeHistoryStatus(row.status),
          }))
          .sort((left, right) => {
            const rightDate = resolveOutAt(right);
            const leftDate = resolveOutAt(left);
            const dateCompare = rightDate.localeCompare(leftDate);
            if (dateCompare !== 0) return dateCompare;
            return right.id - left.id;
          })
      );
      setLoading(false);
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredItems = useMemo(() => {
    const searchValue = search.trim();
    const fromKey = parseFilterDate(dateFrom);
    const toKey = parseFilterDate(dateTo);

    return items.filter((row) => {
      if (statusFilter !== "all" && row.historyStatus !== statusFilter) return false;
      if (!matchesSearch(row, searchValue)) return false;

      const dateOutKey = rowDateKey(resolveOutAt(row));
      if (fromKey && dateOutKey < fromKey) return false;
      if (toKey && dateOutKey > toKey) return false;

      return true;
    });
  }, [dateFrom, dateTo, items, search, statusFilter]);

  const handleDelete = async (row: AgreementHistoryRow) => {
    if (deletingId !== null) return;
    const confirmed = window.confirm(
      `删除协议 #${row.id}？这会同时删除数据库记录、事件、附件和 PDF 文件，并释放占用的车辆。此操作无法恢复。`
    );
    if (!confirmed) return;

    setDeletingId(row.id);
    const res = await deleteCourtesyCarAgreement(row.id);
    setDeletingId(null);

    if (!res.ok) {
      toast.error(res.error || "删除协议失败");
      return;
    }

    setItems((prev) => prev.filter((item) => item.id !== row.id));
    toast.success("协议已删除");
  };

  const handleReturn = async (row: AgreementHistoryRow) => {
    if (returningId !== null) return;
    if (row.historyStatus !== "active" && row.historyStatus !== "submitted") return;

    setReturningId(row.id);
    const res = await returnCourtesyCarAgreement(row.id);
    setReturningId(null);

    if (!res.ok) {
      toast.error(res.error || "归还协议失败");
      return;
    }

    const returnedAgreement = res.data?.agreement;
    if (returnedAgreement) {
      setItems((prev) =>
        prev
          .map((item) =>
            item.id === row.id
              ? {
                  ...item,
                  ...returnedAgreement,
                  historyStatus: normalizeHistoryStatus(returnedAgreement.status),
                }
              : item
          )
          .sort((left, right) => {
            const rightDate = resolveOutAt(right);
            const leftDate = resolveOutAt(left);
            const dateCompare = rightDate.localeCompare(leftDate);
            if (dateCompare !== 0) return dateCompare;
            return right.id - left.id;
          })
      );
    }

    toast.success("协议已归还");
  };

  return (
    <div className="min-h-0 flex-1 space-y-6">
      <div className="flex flex-col gap-2">
        <div className="text-4xl font-bold tracking-[-0.05em] text-slate-900">借车协议管理</div>
        <div className="text-lg text-slate-500">
          {filteredItems.length} / {items.length} agreements
        </div>
      </div>

      <Card className="border-[rgba(0,0,0,0.08)]">
        <div className="p-5 sm:p-6">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,2.5fr),180px,210px,210px]">
            <div className="space-y-2">
              <label className="block text-sm font-semibold text-slate-900">Search</label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Customer name, plate..."
                  className="h-12 rounded-[14px] border-slate-200 bg-slate-50 pl-10 text-base placeholder:text-slate-400"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-semibold text-slate-900">Status</label>
              <Select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value as AgreementHistoryStatusFilter)}
                className="h-12 rounded-[14px] border-slate-200 bg-slate-50 px-4 text-base"
              >
                {statusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-semibold text-slate-900">Date From</label>
              <div className="relative">
                <Input
                  value={dateFrom}
                  onChange={(event) => setDateFrom(event.target.value)}
                  placeholder="dd/mm/yyyy"
                  className="h-12 rounded-[14px] border-slate-200 bg-slate-50 pr-10 text-base placeholder:text-slate-400"
                />
                <CalendarDays className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              </div>
            </div>

            <div className="space-y-2">
              <label className="block text-sm font-semibold text-slate-900">Date To</label>
              <div className="relative">
                <Input
                  value={dateTo}
                  onChange={(event) => setDateTo(event.target.value)}
                  placeholder="dd/mm/yyyy"
                  className="h-12 rounded-[14px] border-slate-200 bg-slate-50 pr-10 text-base placeholder:text-slate-400"
                />
                <CalendarDays className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              </div>
            </div>
          </div>
        </div>
      </Card>

      {loading ? (
        <Card className="border-[rgba(0,0,0,0.08)]">
          <div className="p-8 text-center text-sm text-slate-500">Loading agreement history...</div>
        </Card>
      ) : error ? (
        <EmptyState title="Failed to load history" description={error} actionLabel="Retry" onAction={() => window.location.reload()} />
      ) : filteredItems.length === 0 ? (
        <EmptyState
          title="No agreements found"
          description="Try adjusting the search, status, or date filters."
          actionLabel="Reset filters"
          onAction={() => {
            setSearch("");
            setStatusFilter("all");
            setDateFrom("");
            setDateTo("");
          }}
        />
      ) : (
        <Card className="overflow-hidden border-[rgba(0,0,0,0.08)]">
          <div className="overflow-x-auto">
            <table className="min-w-[1280px] w-full border-collapse">
              <thead className="bg-slate-50">
                <tr className="text-left text-sm font-semibold text-slate-500">
                  <th className="px-6 py-4">Customer</th>
                  <th className="px-6 py-4">Customer Plate</th>
                  <th className="px-6 py-4">Courtesy Car</th>
                  <th className="px-6 py-4">Date Out</th>
                  <th className="px-6 py-4">Date Return</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">Email</th>
                  <th className="px-6 py-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((row) => {
                  const dateOut = resolveOutAt(row);
                  const dateReturn = resolveReturnAt(row);
                  return (
                    <tr key={row.id} className="border-t border-slate-200/80 text-sm text-slate-700 transition hover:bg-slate-50/70">
                      <td className="px-6 py-5">
                        <div className="text-base font-semibold text-slate-900">{row.jobCustomerName || "—"}</div>
                      </td>
                      <td className="px-6 py-5 font-medium text-slate-900">{row.jobVehiclePlate || "—"}</td>
                      <td className="px-6 py-5">
                        <div className="text-base font-semibold text-slate-900">{row.vehiclePlate || "—"}</div>
                        <div className="text-sm text-slate-500">{[row.vehicleMake, row.vehicleModel].filter(Boolean).join(" ") || "—"}</div>
                      </td>
                      <td className="px-6 py-5 text-slate-900">{formatCompactDateTime(dateOut)}</td>
                      <td className="px-6 py-5 text-slate-900">{formatCompactDateTime(dateReturn)}</td>
                      <td className="px-6 py-5">
                        <StatusPill status={row.historyStatus} />
                      </td>
                      <td className="px-6 py-5">
                        <EmailStatus sentAt={row.emailSentAt} returnedAt={dateReturn} />
                      </td>
                      <td className="px-6 py-5 text-right">
                        <div className="inline-flex items-center justify-end gap-3">
                          {(row.historyStatus === "active" || row.historyStatus === "submitted") ? (
                            <button
                              type="button"
                              onClick={() => void handleReturn(row)}
                              disabled={returningId === row.id}
                              className="inline-flex items-center gap-2 text-sm font-semibold text-emerald-700 transition hover:text-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <Undo2 className="h-4 w-4" />
                              {returningId === row.id ? "归还中..." : "归还"}
                            </button>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => navigate(`/courtesy-car-drafts/${row.id}`)}
                            className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--ds-primary)] transition hover:opacity-80"
                          >
                            <FileText className="h-4 w-4" />
                            预览协议
                          </button>
                          <button
                            type="button"
                            onClick={() => void handleDelete(row)}
                            disabled={deletingId === row.id}
                            className="inline-flex items-center gap-2 text-sm font-semibold text-red-600 transition hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <Trash2 className="h-4 w-4" />
                            {deletingId === row.id ? "删除中..." : "删除协议"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
