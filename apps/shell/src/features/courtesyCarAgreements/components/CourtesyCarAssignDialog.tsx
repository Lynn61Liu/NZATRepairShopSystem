import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate } from "react-router-dom";
import { AlertCircle, CarFront, CheckCircle2, Loader2, MapPinned, RefreshCcw, X } from "lucide-react";
import { Button, Card, EmptyState } from "@/components/ui";
import { createCourtesyCarDraft, fetchAvailableCourtesyCars } from "../api";
import type { CourtesyCarAgreementDetail, CourtesyCarVehicle } from "../types";
import type { CourtesyCarAgreementSummary } from "@/types";

type CourtesyCarAssignDialogProps = {
  open: boolean;
  jobId: number | string;
  existingAgreement?: CourtesyCarAgreementSummary | null;
  onClose: () => void;
};

export function CourtesyCarAssignDialog({ open, jobId, existingAgreement, onClose }: CourtesyCarAssignDialogProps) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [vehicles, setVehicles] = useState<CourtesyCarVehicle[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState<number | null>(null);
  const [createdAgreement, setCreatedAgreement] = useState<CourtesyCarAgreementDetail | null>(null);
  const jobAlreadyLinked = Boolean(existingAgreement);

  const loadVehicles = async (options?: { silent?: boolean }) => {
    const silent = options?.silent ?? false;
    if (silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    const res = await fetchAvailableCourtesyCars();
    if (!silent) {
      setLoading(false);
    } else {
      setRefreshing(false);
    }

    if (!res.ok) {
      setVehicles([]);
      setError(res.error || "加载可用代步车失败");
      return;
    }

    const nextVehicles = Array.isArray(res.data?.items) ? res.data.items : [];
    setVehicles(nextVehicles);
    setSelectedVehicleId((current) => (current && nextVehicles.some((vehicle) => vehicle.id === current) ? current : null));
    setError(null);
  };

  useEffect(() => {
    if (!open) return;
    setCreatedAgreement(null);
    setSelectedVehicleId(null);
    setError(null);
    let cancelled = false;
    void (async () => {
      setLoading(true);
      const res = await fetchAvailableCourtesyCars();
      if (cancelled) return;
      if (!res.ok) {
        setVehicles([]);
        setError(res.error || "加载可用代步车失败");
      } else {
        const nextVehicles = Array.isArray(res.data?.items) ? res.data.items : [];
        setVehicles(nextVehicles);
        setSelectedVehicleId(null);
        setError(null);
      }
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [open]);

  const selectedVehicle = useMemo(
    () => vehicles.find((vehicle) => vehicle.id === selectedVehicleId) ?? null,
    [selectedVehicleId, vehicles]
  );

  const handleCreateDraft = async () => {
    if (jobAlreadyLinked) {
      setError("This job already has a courtesy car agreement.");
      return;
    }
    if (!selectedVehicleId || creating) return;
    setCreating(true);
    setError(null);
    const res = await createCourtesyCarDraft(jobId, selectedVehicleId);
    setCreating(false);
    if (!res.ok) {
      setError(res.error || "创建草稿失败");
      return;
    }

    setCreatedAgreement(res.data?.agreement ?? null);
    await loadVehicles({ silent: true });
  };

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[1000] bg-slate-950/60 px-4 py-6 backdrop-blur-sm sm:px-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="mx-auto flex h-full max-h-[calc(100vh-3rem)] w-full max-w-6xl flex-col overflow-hidden rounded-[24px] border border-[rgba(255,255,255,0.18)] bg-white shadow-[0_30px_120px_rgba(15,23,42,0.34)]">
        <div className="flex items-start justify-between border-b border-[rgba(0,0,0,0.08)] px-6 py-5">
          <div>
            <div className="text-2xl font-bold tracking-[-0.03em] text-slate-900">关联代步车</div>
            <div className="mt-1 text-sm text-slate-500">
              {jobAlreadyLinked
                ? "This job already has a courtesy car agreement linked. Open the existing agreement instead of creating another draft."
                : "选择一台可用代步车后会立即创建草稿协议，并把车辆先占用起来。"}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              onClick={() => void loadVehicles({ silent: true })}
              disabled={loading || refreshing}
              leftIcon={<RefreshCcw className={["h-4 w-4", refreshing ? "animate-spin" : ""].join(" ")} />}
              className="!h-10"
            >
              {refreshing ? "Refreshing..." : "Refresh"}
            </Button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
              aria-label="Close dialog"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {jobAlreadyLinked ? (
          <div className="border-b border-[rgba(0,0,0,0.08)] bg-amber-50 px-6 py-4 text-sm text-amber-900">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>This job already has a courtesy car agreement. You cannot create another draft for the same job.</div>
              <Link
                to={`/courtesy-car-drafts/${existingAgreement?.id}`}
                className="inline-flex h-9 items-center justify-center rounded-[8px] bg-amber-600 px-3 text-sm font-medium text-white transition hover:opacity-95"
              >
                Open existing agreement
              </Link>
            </div>
          </div>
        ) : null}

        <div className="grid min-h-0 flex-1 gap-0 overflow-hidden lg:grid-cols-[1.15fr,0.85fr]">
          <div className="min-h-0 overflow-y-auto p-5">
            {loading ? (
              <div className="rounded-[18px] border border-[rgba(0,0,0,0.08)] bg-slate-50 p-8 text-center text-sm text-slate-500">
                {refreshing ? "Refreshing available courtesy cars..." : "Loading available courtesy cars..."}
              </div>
            ) : vehicles.length === 0 ? (
              <EmptyState
                title="No available courtesy cars"
                description="Create or release a vehicle before starting a draft agreement."
                onAction={onClose}
                actionLabel="Close"
              />
            ) : (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {vehicles.map((vehicle) => {
                  const selected = vehicle.id === selectedVehicleId;
                  return (
                    <Card
                      key={vehicle.id}
                      className={[
                        "border-[rgba(0,0,0,0.08)] transition",
                        jobAlreadyLinked ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:-translate-y-0.5 hover:shadow-md",
                        selected ? "ring-2 ring-[var(--ds-primary)]" : "",
                      ].join(" ")}
                      onClick={() => {
                        if (jobAlreadyLinked) return;
                        setSelectedVehicleId(vehicle.id);
                      }}
                    >
                      <div className="p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-xl font-bold tracking-[-0.02em] text-slate-900">{vehicle.plate}</div>
                            <div className="text-sm text-slate-500">
                              {[vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ")}
                            </div>
                          </div>
                          <div
                            className={[
                              "rounded-full px-2.5 py-1 text-xs font-semibold",
                              vehicle.status === "available"
                                ? "bg-emerald-100 text-emerald-700"
                                : vehicle.status === "on_loan"
                                  ? "bg-blue-100 text-blue-700"
                                  : "bg-amber-100 text-amber-700",
                            ].join(" ")}
                          >
                            {vehicle.status}
                          </div>
                        </div>

                        <div className="mt-3 space-y-2 text-sm text-slate-600">
                          <div className="flex items-center gap-2">
                            <CarFront className="h-4 w-4 text-slate-400" />
                            <span>Value: ${Number(vehicle.agreedVehicleValue || 0).toLocaleString("en-NZ")}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <CheckCircle2 className="h-4 w-4 text-slate-400" />
                            <span>WOF {vehicle.wofExpiry || "—"}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <MapPinned className="h-4 w-4 text-slate-400" />
                            <span>Rego {vehicle.regoExpiry || "—"}</span>
                          </div>
                        </div>

                        {selected ? (
                          <div className="mt-4 rounded-[14px] bg-[rgba(37,99,235,0.08)] px-3 py-2 text-sm font-medium text-[var(--ds-primary)]">
                            Selected
                          </div>
                        ) : null}
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>

          <div className="min-h-0 overflow-y-auto border-t border-[rgba(0,0,0,0.08)] bg-slate-50 p-5 lg:border-l lg:border-t-0">
            <div className="rounded-[20px] border border-[rgba(0,0,0,0.08)] bg-white p-5 shadow-sm">
              <div className="text-lg font-semibold text-slate-900">Selected vehicle</div>
              {selectedVehicle ? (
                <div className="mt-4 space-y-3 text-sm text-slate-600">
                  <div className="text-2xl font-bold tracking-[-0.03em] text-slate-900">{selectedVehicle.plate}</div>
                  <div>{[selectedVehicle.year, selectedVehicle.make, selectedVehicle.model].filter(Boolean).join(" ")}</div>
                  <div>Agreed value: ${Number(selectedVehicle.agreedVehicleValue || 0).toLocaleString("en-NZ")}</div>
                  <div>WOF: {selectedVehicle.wofExpiry || "—"}</div>
                  <div>Rego: {selectedVehicle.regoExpiry || "—"}</div>
                </div>
              ) : jobAlreadyLinked ? (
                <div className="mt-4 rounded-[16px] border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                  <div className="font-semibold">Draft creation disabled</div>
                  <div className="mt-1">Open the existing agreement instead of creating another draft.</div>
                </div>
              ) : (
                <div className="mt-4 text-sm text-slate-500">
                  Pick a vehicle from the list to create a draft agreement.
                </div>
              )}

              {error ? (
                <div className="mt-4 rounded-[14px] border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  <AlertCircle className="mr-2 inline h-4 w-4" />
                  {error}
                </div>
              ) : null}

              {createdAgreement ? (
                <div className="mt-4 space-y-3">
                  <div className="rounded-[14px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                    Draft agreement #{createdAgreement.id} created successfully.
                  </div>
                  <Button
                    variant="primary"
                    className="w-full"
                    onClick={() => {
                      navigate(`/courtesy-car?agreementId=${encodeURIComponent(String(createdAgreement.id))}`);
                      onClose();
                    }}
                  >
                    打开用户端借车页
                  </Button>
                  <Button
                    className="w-full"
                    onClick={() => {
                      onClose();
                    }}
                  >
                    Close
                  </Button>
                </div>
              ) : (
                <div className="mt-4 flex gap-3">
                  <Button
                    variant="primary"
                    className="flex-1"
                    disabled={jobAlreadyLinked || !selectedVehicle || creating}
                    onClick={() => void handleCreateDraft()}
                    leftIcon={creating ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  >
                    {jobAlreadyLinked ? "Already linked" : creating ? "Creating..." : "Create draft"}
                  </Button>
                  <Button className="flex-1" onClick={onClose}>
                    Close
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
