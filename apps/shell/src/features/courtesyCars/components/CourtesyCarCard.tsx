import { Ban, History, Pencil, Trash2, TriangleAlert } from "lucide-react";
import { Card, TagPill } from "@/components/ui";
import {
  buildCourtesyCarWarnings,
  getCourtesyCarCardSummary,
  getCourtesyCarLoanSummary,
} from "../courtesyCars.utils";
import type { CourtesyCar, CourtesyCarStatusAction } from "../courtesyCars.types";
import { CourtesyCarStatusBadge } from "./CourtesyCarStatusBadge";

function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-NZ", { style: "currency", currency: "NZD", maximumFractionDigits: 0 }).format(value);
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-NZ", { year: "numeric", month: "short", day: "2-digit" }).format(parsed);
}

function expiryTag(value?: string | null, label = "Due") {
  if (!value) return <TagPill label="Not set" variant="neutral" />;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return <TagPill label={value} variant="neutral" />;
  const diffDays = Math.floor((Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate()) - Date.now()) / 86400000);
  if (diffDays < 0) return <TagPill label="Expired" variant="danger" />;
  if (diffDays <= 30) return <TagPill label={`${label} ${diffDays}d`} variant="primary" />;
  return <TagPill label={formatDate(value)} variant="neutral" />;
}

export function CourtesyCarCard({
  car,
  onViewHistory,
  onEdit,
  onDelete,
  onAction,
}: {
  car: CourtesyCar;
  onViewHistory: (car: CourtesyCar) => void;
  onEdit: (car: CourtesyCar) => void;
  onDelete: (car: CourtesyCar) => void;
  onAction: (car: CourtesyCar, action: CourtesyCarStatusAction) => void;
}) {
  const warnings = buildCourtesyCarWarnings(car);
  const summary = getCourtesyCarCardSummary(car);
  const loanSummary = getCourtesyCarLoanSummary(car);
  const wofWarning = warnings.some((warning) => warning.key === "wof");
  const regoWarning = warnings.some((warning) => warning.key === "rego");
  const isUnavailable = car.status === "unavailable";
  const nextStatus = car.status === "available" ? "on_loan" : "available";
  const badgeAction: CourtesyCarStatusAction = car.status === "on_loan" ? "returned" : nextStatus;

  return (
    <Card className="h-full overflow-hidden transition duration-200 hover:-translate-y-0.5 hover:shadow-sm">
      <div className="flex h-full flex-col p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <div className="truncate text-[1.55rem] font-bold tracking-[-0.04em] text-slate-900">{car.plate}</div>
              <CourtesyCarStatusBadge
                status={car.status}
                onClick={() => onAction(car, badgeAction)}
                title={car.status === "on_loan" ? "Return vehicle" : car.status === "available" ? "Set on loan" : "Reactivate vehicle"}
              />
            </div>
            <div className="mt-1 text-sm font-medium text-slate-600">{summary.vehicleLabel || "—"}</div>
            <div className="mt-0.5 text-xs text-slate-500">Color · {summary.colorLabel}</div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              title="View records"
              onClick={() => onViewHistory(car)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--ds-border)] bg-white text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
            >
              <History className="h-4 w-4" />
            </button>
            <button
              type="button"
              title="Edit vehicle"
              onClick={() => onEdit(car)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[var(--ds-border)] bg-white text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              type="button"
              title="Delete vehicle"
              onClick={() => onDelete(car)}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 bg-white text-red-600 transition hover:bg-red-50"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="mt-4 grid gap-x-6 gap-y-2 sm:grid-cols-2">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="font-medium text-slate-500">WOF</span>
              <span className="inline-flex items-center gap-2">
                {expiryTag(car.wofExpiry, "WOF")}
                {wofWarning ? <TriangleAlert className="h-4 w-4 text-red-500" /> : null}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="font-medium text-slate-500">Rego</span>
              <span className="inline-flex items-center gap-2">
                {expiryTag(car.regoExpiry, "Rego")}
                {regoWarning ? <TriangleAlert className="h-4 w-4 text-red-500" /> : null}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="font-medium text-slate-500">Agreed Value</span>
              <span className="font-semibold text-slate-900">{formatCurrency(car.agreedValue)}</span>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="font-medium text-slate-500">Odometer</span>
              <span className="font-medium text-slate-900">{car.mileage != null ? `${new Intl.NumberFormat("en-NZ").format(car.mileage)} km` : "—"}</span>
            </div>
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="font-medium text-slate-500">Fuel</span>
              <span className="font-medium text-slate-900">{car.fuelLevel || "—"}</span>
            </div>
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="font-medium text-slate-500">Last returned</span>
              <span className="font-medium text-slate-900">{car.returnedAt ? formatDate(car.returnedAt) : "—"}</span>
            </div>
          </div>
        </div>

        <div className="mt-auto pt-4">
          <div className="mt-3 min-h-[88px] rounded-lg border border-[var(--ds-border)] bg-slate-50/70 px-3 py-2 text-xs text-slate-700">
            {car.status === "on_loan" ? (
              <div className="flex h-full flex-col gap-2">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex flex-col">
                    <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Current loan</div>
                    {loanSummary?.agreementLabel ? (
                      <div className="text-[11px] text-slate-400">{loanSummary.agreementLabel}</div>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    onClick={() => onAction(car, "returned")}
                    className="inline-flex items-center rounded-lg border border-[var(--ds-border)] bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 transition hover:bg-slate-50"
                  >
                    归还
                  </button>
                </div>
                <div className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1.5 text-slate-600">
                  <span className="whitespace-nowrap">借出日期</span>
                  <span className="font-medium text-slate-900">{loanSummary?.loanedAtLabel ?? "—"}</span>
                  <span className="whitespace-nowrap">借用户名称</span>
                  <span className="font-medium text-slate-900">{loanSummary?.borrowerNameLabel ?? "—"}</span>
                  <span className="whitespace-nowrap">电话</span>
                  <span className="font-medium text-slate-900">{loanSummary?.borrowerPhoneLabel ?? "—"}</span>
                </div>
              </div>
            ) : isUnavailable && car.note ? (
              <div className="flex h-full flex-col gap-2">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">Unavailable note</div>
                <div className="flex-1 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">
                  <Ban className="mr-2 inline h-4 w-4" />
                  {car.note}
                </div>
              </div>
            ) : (
              <div className="flex h-full items-center text-slate-400">No loan or note details</div>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
