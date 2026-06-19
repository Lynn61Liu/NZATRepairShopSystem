import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, KeyRound, Loader2, Search, Undo2, X } from "lucide-react";
import { Button, Card, Input, useToast } from "@/components/ui";
import { fetchCourtesyCarAgreementHistory, returnCourtesyCarAgreement } from "@/features/courtesyCarAgreements/api";
import { findReturnableCourtesyCarAgreement, normalizeCourtesyCarPlate } from "@/features/courtesyCarAgreements/plateLookup";
import { CourtesyCarAgreementsPage } from "@/pages/courtesyCarAgreements/CourtesyCarAgreementsPage";

type ReturnResult = {
  agreementId: number;
  plate: string;
  returnedAt: string;
};

const pageThemeStyle = {
  "--ds-primary": "#2859d6",
  "--ds-border": "rgba(148, 163, 184, 0.24)",
} as CSSProperties & Record<string, string>;

function formatReturnTime(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-NZ", {
    timeZone: "Pacific/Auckland",
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

export function CourtesyCarEntryPage() {
  const toast = useToast();
  const [view, setView] = useState<"home" | "borrow">("home");
  const [plate, setPlate] = useState("");
  const [returnOpen, setReturnOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [returnResult, setReturnResult] = useState<ReturnResult | null>(null);

  const normalizedPlate = useMemo(() => normalizeCourtesyCarPlate(plate), [plate]);

  useEffect(() => {
    const previousTitle = document.title;
    document.title = "Courtesy Car";
    return () => {
      document.title = previousTitle;
    };
  }, []);

  useEffect(() => {
    if (!returnOpen || typeof document === "undefined") return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [returnOpen]);

  const closeReturnModal = () => {
    setReturnOpen(false);
    setPlate("");
    setError(null);
    setReturnResult(null);
    setLoading(false);
  };

  const closeBorrowView = () => {
    setView("home");
  };

  const handleReturn = async () => {
    if (loading || normalizedPlate.length < 3) return;

    setLoading(true);
    setError(null);
    setReturnResult(null);

    const historyRes = await fetchCourtesyCarAgreementHistory();
    if (!historyRes.ok) {
      setError(historyRes.error || "Failed to load agreement history.");
      setLoading(false);
      return;
    }

    const items = Array.isArray(historyRes.data?.items) ? historyRes.data.items : [];
    const match = findReturnableCourtesyCarAgreement(items, normalizedPlate);
    if (!match) {
      setError("No active courtesy car agreement was found for this plate.");
      setLoading(false);
      return;
    }

    const res = await returnCourtesyCarAgreement(match.id);
    if (!res.ok) {
      setError(res.error || "Failed to return the courtesy car.");
      setLoading(false);
      return;
    }

    const agreement = res.data?.agreement ?? null;
    const returnedAt = agreement?.closedAt || agreement?.updatedAt || new Date().toISOString();
    const returnedPlate = agreement?.jobVehiclePlate || normalizedPlate;

    setReturnResult({
      agreementId: agreement?.id ?? match.id,
      plate: returnedPlate,
      returnedAt,
    });

    toast.success(`Agreement #${match.id} returned.`);
    setLoading(false);
  };

  if (view === "borrow") {
    return <CourtesyCarAgreementsPage embedded onClose={closeBorrowView} />;
  }

  return (
    <div
      className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(40,89,214,0.12),_transparent_34%),linear-gradient(180deg,#f8fafc_0%,#eef2f7_100%)] px-4 py-6 sm:px-6 lg:px-8"
      style={pageThemeStyle}
    >
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-[1180px] items-center justify-center">
        <div className="grid w-full max-w-5xl gap-5 md:grid-cols-2">
          <button type="button" onClick={() => setView("borrow")} className="group block text-left">
            <Card className="h-full overflow-hidden border-[rgba(40,89,214,0.12)] shadow-[0_18px_50px_rgba(15,23,42,0.05)] transition duration-200 group-hover:-translate-y-1 group-hover:shadow-[0_24px_70px_rgba(15,23,42,0.08)]">
              <div className="flex h-[300px] flex-col items-center justify-center px-8 text-center bg-[linear-gradient(180deg,rgba(40,89,214,0.10),rgba(40,89,214,0.03))]">
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-white text-[var(--ds-primary)] shadow-[0_10px_30px_rgba(40,89,214,0.12)]">
                  <KeyRound className="h-9 w-9" />
                </div>
                <div className="mt-6 text-3xl font-bold tracking-[-0.05em] text-slate-900">借车</div>
                <div className="mt-2 text-sm font-semibold uppercase tracking-[0.22em] text-slate-500">Borrow</div>
                <div className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-[var(--ds-primary)]">
                  打开草稿协议
                  <ArrowRight className="h-4 w-4" />
                </div>
              </div>
            </Card>
          </button>

          <button
            type="button"
            onClick={() => setReturnOpen(true)}
            className="group block text-left"
          >
            <Card className="h-full overflow-hidden border-[rgba(16,185,129,0.14)] shadow-[0_18px_50px_rgba(15,23,42,0.05)] transition duration-200 group-hover:-translate-y-1 group-hover:shadow-[0_24px_70px_rgba(15,23,42,0.08)]">
              <div className="flex h-[300px] flex-col items-center justify-center px-8 text-center bg-[linear-gradient(180deg,rgba(16,185,129,0.10),rgba(16,185,129,0.03))]">
                <div className="flex h-20 w-20 items-center justify-center rounded-full bg-white text-emerald-600 shadow-[0_10px_30px_rgba(16,185,129,0.12)]">
                  <Undo2 className="h-9 w-9" />
                </div>
                <div className="mt-6 text-3xl font-bold tracking-[-0.05em] text-slate-900">还车</div>
                <div className="mt-2 text-sm font-semibold uppercase tracking-[0.22em] text-slate-500">Return</div>
                <div className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-emerald-700">
                  输入车牌并确认
                  <ArrowRight className="h-4 w-4" />
                </div>
              </div>
            </Card>
          </button>
        </div>
      </div>

      {returnOpen
        ? createPortal(
            <div
              className="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-950/55 px-4 py-6 backdrop-blur-sm"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) closeReturnModal();
              }}
            >
              <div className="w-full max-w-xl overflow-hidden rounded-[28px] border border-white/20 bg-white shadow-[0_32px_100px_rgba(15,23,42,0.32)]">
                <div className="flex items-start justify-between border-b border-slate-200 px-6 py-5 sm:px-8">
                  <div>
                    <div className="text-2xl font-bold tracking-[-0.04em] text-slate-900">还车</div>
                    <div className="mt-1 text-sm text-slate-500">输入 job plate，系统会找到对应 agreement 并执行归还。</div>
                  </div>
                  <button
                    type="button"
                    onClick={closeReturnModal}
                    className="rounded-full p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-900"
                    aria-label="Close modal"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>

                <div className="space-y-5 p-6 sm:p-8">
                  <div className="space-y-2">
                    <label className="block text-sm font-semibold text-slate-900">Job plate</label>
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <Input
                        value={plate}
                        onChange={(event) => setPlate(normalizeCourtesyCarPlate(event.target.value))}
                        placeholder="ABC123"
                        autoComplete="off"
                        spellCheck={false}
                        className="h-12 rounded-[14px] border-slate-200 bg-white pl-10 text-[15px] uppercase tracking-[0.08em] placeholder:normal-case placeholder:tracking-normal"
                      />
                    </div>
                    <div className="text-xs text-slate-500">We will ignore spaces and punctuation.</div>
                  </div>

                  {error ? (
                    <div className="rounded-[16px] border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-700">
                      {error}
                    </div>
                  ) : null}

                  {returnResult ? (
                    <div className="rounded-[18px] border border-emerald-200 bg-emerald-50 px-4 py-4 text-sm leading-6 text-emerald-900">
                      <div className="font-semibold">Return completed</div>
                      <div className="mt-1">
                        Agreement #{returnResult.agreementId} for plate {returnResult.plate} has been returned.
                      </div>
                      <div className="mt-1 text-emerald-700">Closed at {formatReturnTime(returnResult.returnedAt)}</div>
                    </div>
                  ) : null}

                  <Button
                    variant="primary"
                    className="!h-12 w-full rounded-[16px] px-5 text-[15px] font-semibold"
                    disabled={loading || normalizedPlate.length < 3}
                    onClick={() => void handleReturn()}
                  >
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    {loading ? "Returning..." : "确认还车"}
                  </Button>

                  <div className="flex items-center justify-between gap-3 pt-1">
                    <div className="text-xs text-slate-500">Need the draft first?</div>
                    <button
                      type="button"
                      className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--ds-primary)] hover:opacity-80"
                      onClick={() => {
                        closeReturnModal();
                        setView("borrow");
                      }}
                    >
                      Open draft view
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}
