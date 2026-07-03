import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CalendarDays, CarFront, ChevronRight, UserRound } from "lucide-react";
import { Button, Card, EmptyState, TagPill } from "@/components/ui";
import { fetchCourtesyCarDrafts } from "@/features/courtesyCarAgreements/api";
import type { CourtesyCarAgreementListItem } from "@/features/courtesyCarAgreements/types";

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-NZ", {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function statusVariant(status: CourtesyCarAgreementListItem["status"]) {
  if (status === "submitted") return "success";
  if (status === "closed") return "neutral";
  if (status === "cancelled") return "danger";
  if (status === "active") return "warning";
  if (status === "inprogress" || status === "in_progress") return "primary";
  return "primary";
}

function statusLabel(status: CourtesyCarAgreementListItem["status"]) {
  if (status === "inprogress" || status === "in_progress") return "In progress";
  if (status === "active") return "Active";
  if (status === "submitted") return "Submitted";
  if (status === "closed") return "Closed";
  if (status === "cancelled") return "Cancelled";
  return "Draft";
}

type CourtesyCarAgreementsPageProps = {
  embedded?: boolean;
  onClose?: () => void;
  onSelectAgreement?: (agreementId: number | string) => void;
};

export function CourtesyCarAgreementsPage({
  embedded = false,
  onClose,
  onSelectAgreement,
}: CourtesyCarAgreementsPageProps = {}) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const highlightAgreementId = searchParams.get("agreementId");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<CourtesyCarAgreementListItem[]>([]);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = "Courtesy Car Agreements";
    return () => {
      document.title = previousTitle;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      const res = await fetchCourtesyCarDrafts();
      if (cancelled) return;
      if (!res.ok) {
        setError(res.error || "Failed to load courtesy car drafts.");
        setItems([]);
      } else {
        setError(null);
        setItems(Array.isArray(res.data?.items) ? res.data.items : []);
      }
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const highlighted = useMemo(
    () => items.find((item) => String(item.id) === highlightAgreementId) ?? null,
    [highlightAgreementId, items]
  );

  const openAgreement = (agreementId: number | string) => {
    if (embedded && onSelectAgreement) {
      onSelectAgreement(agreementId);
      return;
    }

    navigate(`/courtesy-car-drafts/${agreementId}`);
  };

  return (
    <div className={embedded ? "min-h-screen space-y-6 bg-[linear-gradient(180deg,#f8fafc_0%,#eef2f7_100%)] px-4 py-6 sm:px-6 lg:px-8" : "min-h-0 flex-1 space-y-6"}>
      {embedded ? (
        <div className="rounded-[28px] border border-[rgba(0,0,0,0.06)] bg-white/85 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.06)] backdrop-blur">
          <div className="flex items-center justify-between gap-4">
            <div>
              <div className="text-4xl font-bold tracking-[-0.04em] text-slate-900">Courtesy Car Drafts</div>
              <div className="mt-2 text-lg text-slate-500">Select a draft to continue the customer handover flow.</div>
            </div>
            {onClose ? (
              <Button onClick={onClose} className="!h-11 rounded-[14px] px-4">
                返回首页
              </Button>
            ) : null}
          </div>
        </div>
      ) : (
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="text-4xl font-bold tracking-[-0.04em] text-slate-900">Courtesy Car Drafts</div>
          <div className="mt-2 text-lg text-slate-500">Select a draft to continue the customer handover flow.</div>
        </div>
        <Button onClick={() => navigate("/")} className="!h-11">
          Back to dashboard
        </Button>
      </div>
      )}

      {loading ? (
        <div className="rounded-[20px] border border-[rgba(0,0,0,0.08)] bg-white p-8 text-center text-sm text-slate-500 shadow-sm">
          Loading draft agreements...
        </div>
      ) : error ? (
        <EmptyState title="Failed to load drafts" description={error} onAction={() => window.location.reload()} actionLabel="Retry" />
      ) : items.length === 0 ? (
        <EmptyState
          title="No active drafts"
          description="Ask an admin to create a courtesy car draft from a job detail page."
          onAction={embedded && onClose ? onClose : () => navigate("/")}
          actionLabel={embedded && onClose ? "返回首页" : "Back home"}
        />
      ) : (
        <>
          {highlighted ? (
            <div className="rounded-[18px] border border-[rgba(37,99,235,0.18)] bg-[rgba(37,99,235,0.06)] p-4 text-sm text-[var(--ds-primary)]">
              Draft #{highlighted.id} is highlighted for quick access.
            </div>
          ) : null}

          <div className="grid gap-4 xl:grid-cols-2">
            {items.map((item) => {
              const active = String(item.id) === highlightAgreementId;
              return (
                <Card
                  key={item.id}
                  className={[
                    "cursor-pointer border-[rgba(0,0,0,0.08)] transition hover:-translate-y-0.5 hover:shadow-md",
                    active ? "ring-2 ring-[var(--ds-primary)]" : "",
                  ].join(" ")}
                  onClick={() => openAgreement(item.id)}
                  role="button"
                >
                  <div className="p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <div className="text-2xl font-bold tracking-[-0.03em] text-slate-900">
                            {item.jobVehiclePlate || "Unknown plate"}
                          </div>
                          <TagPill label={statusLabel(item.status)} variant={statusVariant(item.status)} />
                        </div>
                        <div className="mt-1 text-sm text-slate-500">
                          Vehicle: {item.vehiclePlate || "—"} · Step: {item.currentStep}
                        </div>
                      </div>
                      <ChevronRight className="mt-1 h-5 w-5 text-slate-400" />
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-[14px] bg-slate-50 p-3">
                        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                          <UserRound className="h-3.5 w-3.5" />
                          Customer
                        </div>
                        <div className="mt-2 text-sm font-semibold text-slate-900">{item.jobCustomerName || "—"}</div>
                        <div className="text-xs text-slate-500">{item.jobCustomerPhone || item.jobCustomerEmail || "No contact info"}</div>
                      </div>

                      <div className="rounded-[14px] bg-slate-50 p-3">
                        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">
                          <CarFront className="h-3.5 w-3.5" />
                          Courtesy car
                        </div>
                        <div className="mt-2 text-sm font-semibold text-slate-900">
                          {[item.vehicleMake, item.vehicleModel].filter(Boolean).join(" ") || "—"}
                        </div>
                        <div className="text-xs text-slate-500">Draft created at {formatDate(item.createdAt)}</div>
                      </div>
                    </div>

                    <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
                      <div className="flex items-center gap-2">
                        <CalendarDays className="h-3.5 w-3.5" />
                        Updated {formatDate(item.updatedAt)}
                      </div>
                      <Button
                        onClick={() => openAgreement(item.id)}
                        variant="primary"
                        className="!h-9"
                      >
                        Continue
                      </Button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
