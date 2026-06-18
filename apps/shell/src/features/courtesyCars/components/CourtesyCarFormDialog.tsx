import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertCircle, FileText, Image as ImageIcon, Loader2, Plus, Upload, X } from "lucide-react";
import { Alert, Button, Input, Textarea } from "@/components/ui";
import { VehicleInfoBanner } from "@/features/newJob/components";
import { extractVehicleInfo, normalizePlateInput, type VehicleInfo } from "@/features/newJob";
import { withApiBase } from "@/utils/api";
import type { CourtesyCar, CourtesyCarEditorValues } from "../courtesyCars.types";
import {
  fileToCourtesyCarAttachment,
  getCourtesyCarLookupStatusMessage,
  normalizeCourtesyCarDraft,
  validateCourtesyCarDraft,
} from "../courtesyCars.utils";
import { CourtesyCarAttachmentStrip } from "./CourtesyCarAttachmentStrip";
import { CourtesyCarStatusBadge } from "./CourtesyCarStatusBadge";

type LookupState = "idle" | "loading" | "success" | "error";

function emptyValues(): CourtesyCarEditorValues {
  return {
    plate: "",
    make: "",
    model: "",
    color: "",
    year: "",
    mileage: "",
    fuelLevel: "",
    agreedValue: "",
    status: "available",
    note: "",
    wofExpiry: "",
    regoExpiry: "",
    loanedAt: "",
    borrowerName: "",
    borrowerPhone: "",
    attachments: [],
  };
}

function valuesFromCar(car: CourtesyCar | null): CourtesyCarEditorValues {
  if (!car) return emptyValues();
  return {
    plate: car.plate,
    make: car.make,
    model: car.model,
    color: car.color,
    year: car.year != null ? String(car.year) : "",
    mileage: car.mileage != null ? String(car.mileage) : "",
    fuelLevel: car.fuelLevel ?? "",
    agreedValue: String(car.agreedValue ?? ""),
    status: car.status,
    note: car.note ?? "",
    wofExpiry: car.wofExpiry ?? "",
    regoExpiry: car.regoExpiry ?? "",
    loanedAt: car.loanedAt ?? "",
    borrowerName: car.borrowerName ?? "",
    borrowerPhone: car.borrowerPhone ?? "",
    attachments: car.attachments,
  };
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 KB";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function normalizeLookupPlate(value: string) {
  return (normalizePlateInput(value) ?? "").toUpperCase().slice(0, 7);
}

function toText(value: unknown) {
  if (value == null) return "";
  return String(value).trim();
}

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

type LookupResult = {
  vehicleInfo: VehicleInfo;
  plate: string;
  make: string;
  model: string;
  year: string;
  color: string;
  mileage: string;
  fuelLevel: string;
  wofExpiry: string;
  regoExpiry: string;
};

async function fetchLookupResult(plate: string): Promise<LookupResult> {
  const normalized = normalizeLookupPlate(plate);
  const importRes = await fetch(withApiBase(`/api/carjam/import?plate=${encodeURIComponent(normalized)}`), {
    method: "POST",
  });
  const importData = await importRes.json().catch(() => null);
  if (!importRes.ok) {
    throw new Error(importData?.error || "抓取车辆资料失败，请稍后重试。");
  }

  let payload: any = null;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const res = await fetch(withApiBase(`/api/vehicles/by-plate?plate=${encodeURIComponent(normalized)}`));
    payload = await res.json().catch(() => null);
    if (res.ok && payload?.vehicle) break;
    if (attempt < 5) {
      await delay(700);
    }
  }

  if (!payload?.vehicle) {
    throw new Error("已触发后台抓取，但车辆资料尚未准备好，请稍后再试。");
  }

  const vehicle = payload.vehicle as Record<string, unknown>;
  const vehicleInfo = extractVehicleInfo(payload);

  return {
    vehicleInfo,
    plate: normalized,
    make: toText(vehicle.make),
    model: toText(vehicle.model),
    year: toText(vehicle.year),
    color: toText(vehicle.colour ?? vehicle.color),
    mileage: toText(vehicle.odometer ?? vehicle.mileage),
    fuelLevel: toText(vehicle.fuelLevel),
    wofExpiry: toText(vehicle.wofExpiry),
    regoExpiry: toText(vehicle.regoExpiry ?? vehicle.registrationExpiry ?? vehicle.licenceExpiry),
  };
}

export function CourtesyCarFormDialog({
  open,
  car,
  onClose,
  onSave,
}: {
  open: boolean;
  car: CourtesyCar | null;
  onClose: () => void;
  onSave: (values: CourtesyCarEditorValues) => void | Promise<void>;
}) {
  const isCreateMode = car === null;
  const [values, setValues] = useState<CourtesyCarEditorValues>(() => valuesFromCar(car));
  const [errors, setErrors] = useState<Partial<Record<"plate" | "status" | "agreedValue" | "note", string>>>({});
  const [selectedAttachmentId, setSelectedAttachmentId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [lookupState, setLookupState] = useState<LookupState>(isCreateMode ? "idle" : "success");
  const [lookupError, setLookupError] = useState("");
  const [lookupInfo, setLookupInfo] = useState<VehicleInfo | null>(null);
  const [lookupPlate, setLookupPlate] = useState("");
  const [lookupBusy, setLookupBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const nextValues = valuesFromCar(car);
    setValues(nextValues);
    setErrors({});
    setSelectedAttachmentId(nextValues.attachments[0]?.id ?? null);
    setIsDragging(false);
    setLookupError("");
    setLookupInfo(null);
    setLookupPlate(car?.plate ?? "");
    setLookupBusy(false);
    setLookupState(car ? "success" : "idle");
  }, [car, open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  const selectedAttachment = useMemo(
    () => values.attachments.find((attachment) => attachment.id === selectedAttachmentId) ?? values.attachments[0] ?? null,
    [selectedAttachmentId, values.attachments]
  );

  const canSave = !isCreateMode || lookupState === "success";
  const showLoanFields = values.status === "on_loan";
  const lookupStatus = isCreateMode && lookupState === "success" ? getCourtesyCarLookupStatusMessage(values) : null;

  const resetLookupState = () => {
    if (!isCreateMode) return;
    setLookupState("idle");
    setLookupError("");
    setLookupInfo(null);
    setLookupPlate("");
  };

  const handlePlateChange = (nextPlate: string) => {
    const normalized = normalizeLookupPlate(nextPlate);
    setValues((prev) => ({ ...prev, plate: normalized }));
    if (isCreateMode && lookupState === "success" && normalized !== lookupPlate) {
      resetLookupState();
    }
  };

  const appendFiles = async (files: File[]) => {
    if (files.length === 0) return;
    const attachments = await Promise.all(files.map((file) => fileToCourtesyCarAttachment(file)));
    setValues((prev) => ({ ...prev, attachments: [...prev.attachments, ...attachments] }));
    setSelectedAttachmentId((current) => current ?? attachments[0]?.id ?? null);
  };

  const handleLookup = async () => {
    const normalized = normalizeLookupPlate(values.plate);
    if (!normalized || lookupBusy) {
      if (!normalized) setLookupError("请先输入车牌。");
      return;
    }

    setLookupBusy(true);
    setLookupState("loading");
    setLookupError("");
    try {
      const result = await fetchLookupResult(normalized);
      setLookupInfo(result.vehicleInfo);
      setLookupPlate(result.plate);
      setValues((prev) => ({
        ...prev,
        plate: result.plate,
        make: result.make || prev.make,
        model: result.model || prev.model,
        year: result.year || prev.year,
        color: result.color || prev.color,
        mileage: result.mileage || prev.mileage,
        fuelLevel: result.fuelLevel || prev.fuelLevel,
        wofExpiry: result.wofExpiry || prev.wofExpiry,
        regoExpiry: result.regoExpiry || prev.regoExpiry,
      }));
      setLookupState("success");
    } catch (err) {
      setLookupState("error");
      setLookupError(err instanceof Error ? err.message : "抓取车辆资料失败，请稍后重试。");
    } finally {
      setLookupBusy(false);
    }
  };

  const handleSubmit = async () => {
    const normalized = normalizeCourtesyCarDraft(values);
    const result = validateCourtesyCarDraft(normalized);
    setErrors(result.errors);
    if (!result.valid || !canSave) return;

    const payload: CourtesyCarEditorValues = {
      ...values,
      plate: normalized.plate,
      make: normalized.make,
      model: normalized.model,
      color: normalized.color,
      year: normalized.year == null ? "" : String(normalized.year),
      mileage: normalized.mileage == null ? "" : String(normalized.mileage),
      fuelLevel: normalized.fuelLevel ?? "",
      agreedValue: String(normalized.agreedValue),
      status: normalized.status,
      note: normalized.note ?? "",
      wofExpiry: normalized.wofExpiry ?? "",
      regoExpiry: normalized.regoExpiry ?? "",
      loanedAt: values.status === "on_loan" && !values.loanedAt.trim() ? new Date().toISOString() : values.loanedAt,
      borrowerName: values.borrowerName ?? "",
      borrowerPhone: values.borrowerPhone ?? "",
    };

    await onSave(payload);
  };

  if (!open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[1000] bg-slate-950/50 px-4 py-6 backdrop-blur-[2px] sm:px-6"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="mx-auto flex h-full max-h-[calc(100vh-3rem)] w-full max-w-6xl flex-col overflow-hidden rounded-[24px] border border-[rgba(255,255,255,0.2)] bg-[#f8fafc] shadow-[0_30px_100px_rgba(15,23,42,0.25)]">
        <div className="flex items-start justify-between border-b border-[rgba(0,0,0,0.08)] bg-white px-6 py-5">
          <div>
            <div className="text-2xl font-bold tracking-[-0.03em] text-slate-900">{car ? `Edit ${car.plate}` : "Add Vehicle"}</div>
            <div className="mt-1 text-sm text-slate-500">
              {isCreateMode
                ? "先输入车牌并抓取 carjam / WOF / Rego 信息，抓取完成后才能保存。"
                : "Manage core vehicle details, reminder dates, and attached images/files."}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
            aria-label="Close dialog"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
          {isCreateMode && lookupState !== "success" ? (
            <div className="mx-auto flex h-full max-w-2xl items-center">
              <div className="w-full rounded-[24px] border border-[rgba(15,23,42,0.08)] bg-white p-6 shadow-sm">
                <div className="text-xl font-bold tracking-[-0.03em] text-slate-900">Start with plate</div>
                <div className="mt-2 text-sm text-slate-500">输入车牌后，我们会后台抓取车辆资料，再允许保存。</div>

                <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto]">
                  <Input
                    value={values.plate}
                    onChange={(event) => handlePlateChange(event.target.value)}
                    placeholder="LCZ123"
                    className="h-11 rounded-[12px] text-base font-semibold tracking-[0.12em]"
                  />
                  <Button
                    variant="primary"
                    onClick={() => void handleLookup()}
                    disabled={lookupBusy || !values.plate.trim()}
                    leftIcon={lookupBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    className="!h-11 !px-5"
                  >
                    {lookupBusy ? "抓取中" : "抓取车辆资料"}
                  </Button>
                </div>

                <div className="mt-4 text-xs text-slate-500">将自动抓取 make / model / year / color / WOF / Rego 信息。</div>
                {lookupState === "error" ? (
                  <div className="mt-4">
                    <Alert variant="warning" description={lookupError} />
                  </div>
                ) : null}

                {lookupState === "loading" ? (
                  <div className="mt-4 flex items-center gap-2 rounded-[14px] bg-slate-50 px-4 py-3 text-sm text-slate-600">
                    <Loader2 className="h-4 w-4 animate-spin text-[var(--ds-primary)]" />
                    正在后台抓取并等待车辆资料写入...
                  </div>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="grid min-h-0 gap-0 overflow-hidden lg:grid-cols-[1.2fr,0.9fr]">
              <div className="min-h-0 overflow-y-auto pr-0 lg:pr-6">
                {lookupStatus ? (
                  <div
                    className={[
                      "mb-4 rounded-[14px] border px-4 py-3 text-sm",
                      lookupStatus.tone === "success"
                        ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                        : "border-amber-200 bg-amber-50 text-amber-900",
                    ].join(" ")}
                  >
                    {lookupStatus.message}
                  </div>
                ) : null}

                {isCreateMode && lookupInfo ? (
                  <div className="mb-4">
                    <VehicleInfoBanner info={lookupInfo} />
                  </div>
                ) : null}

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Plate" error={errors.plate}>
                    <Input
                      value={values.plate}
                      onChange={(event) => handlePlateChange(event.target.value)}
                      placeholder="LCZ123"
                    />
                  </Field>
                  <Field label="Status" error={errors.status}>
                    <select
                      value={values.status}
                      onChange={(event) => setValues((prev) => ({ ...prev, status: event.target.value as CourtesyCarEditorValues["status"] }))}
                      className="h-9 w-full rounded-[8px] border border-[rgba(0,0,0,0.10)] bg-white px-3 text-sm outline-none focus:border-[rgba(37,99,235,0.45)] focus:ring-2 focus:ring-[rgba(37,99,235,0.12)]"
                    >
                      <option value="available">Available</option>
                      <option value="on_loan">On Loan</option>
                      <option value="unavailable">Unavailable</option>
                    </select>
                  </Field>
                  <Field label="Make">
                    <Input value={values.make} onChange={(event) => setValues((prev) => ({ ...prev, make: event.target.value }))} placeholder="Toyota" />
                  </Field>
                  <Field label="Model">
                    <Input value={values.model} onChange={(event) => setValues((prev) => ({ ...prev, model: event.target.value }))} placeholder="Corolla" />
                  </Field>
                  <Field label="Color">
                    <Input value={values.color} onChange={(event) => setValues((prev) => ({ ...prev, color: event.target.value }))} placeholder="Silver" />
                  </Field>
                  <Field label="Year">
                    <Input value={values.year} onChange={(event) => setValues((prev) => ({ ...prev, year: event.target.value }))} placeholder="2021" />
                  </Field>
                  <Field label="Mileage">
                    <Input value={values.mileage} onChange={(event) => setValues((prev) => ({ ...prev, mileage: event.target.value }))} placeholder="48210" />
                  </Field>
                  <Field label="Fuel level">
                    <Input value={values.fuelLevel} onChange={(event) => setValues((prev) => ({ ...prev, fuelLevel: event.target.value }))} placeholder="Half tank" />
                  </Field>
                  <Field label="Agreed Vehicle Value" error={errors.agreedValue}>
                    <Input
                      value={values.agreedValue}
                      onChange={(event) => setValues((prev) => ({ ...prev, agreedValue: event.target.value }))}
                      placeholder="22000"
                    />
                  </Field>
                  <Field label="WOF expiry">
                    <Input value={values.wofExpiry} onChange={(event) => setValues((prev) => ({ ...prev, wofExpiry: event.target.value }))} placeholder="2026-07-10" />
                  </Field>
                  <Field label="Rego expiry">
                    <Input value={values.regoExpiry} onChange={(event) => setValues((prev) => ({ ...prev, regoExpiry: event.target.value }))} placeholder="2026-07-06" />
                  </Field>
                </div>

                {showLoanFields ? (
                  <div className="mt-5 rounded-[18px] border border-[rgba(37,99,235,0.12)] bg-[rgba(37,99,235,0.04)] p-4">
                    <div className="text-sm font-semibold text-slate-900">Current loan agreement</div>
                    <div className="mt-3 grid gap-4 sm:grid-cols-2">
                      <Field label="Loaned at">
                        <Input
                          value={values.loanedAt ?? ""}
                          onChange={(event) => setValues((prev) => ({ ...prev, loanedAt: event.target.value }))}
                          placeholder="2026-06-15T08:30:00.000Z"
                        />
                      </Field>
                      <Field label="Borrower name">
                        <Input
                          value={values.borrowerName ?? ""}
                          onChange={(event) => setValues((prev) => ({ ...prev, borrowerName: event.target.value }))}
                          placeholder="Alex Chen"
                        />
                      </Field>
                      <Field label="Borrower phone" className="sm:col-span-2">
                        <Input
                          value={values.borrowerPhone ?? ""}
                          onChange={(event) => setValues((prev) => ({ ...prev, borrowerPhone: event.target.value }))}
                          placeholder="021 555 0101"
                        />
                      </Field>
                    </div>
                  </div>
                ) : null}

                <div className="mt-4">
                  <Field label="Unavailable note" hint="Required when status is Unavailable" error={errors.note}>
                    <Textarea
                      value={values.note}
                      onChange={(event) => setValues((prev) => ({ ...prev, note: event.target.value }))}
                      placeholder="Minor dent repair in progress at panel shop."
                      rows={4}
                    />
                  </Field>
                </div>

                <div className="mt-5 flex items-center justify-between">
                  <div>
                    <div className="text-lg font-semibold text-slate-900">Current status</div>
                    <div className="text-sm text-slate-500">Returned action flips the car back to Available and records the return time.</div>
                  </div>
                  <CourtesyCarStatusBadge status={values.status} />
                </div>

                {errors.note && values.status === "unavailable" ? (
                  <div className="mt-3">
                    <Alert variant="warning" description={errors.note} />
                  </div>
                ) : null}
              </div>

              <div className="min-h-0 overflow-y-auto border-t border-[rgba(0,0,0,0.08)] bg-[rgba(248,250,252,0.92)] px-0 pt-5 lg:border-l lg:border-t-0 lg:pl-6">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-lg font-semibold text-slate-900">Attachments</div>
                    <div className="text-sm text-slate-500">Drag images/files here, or use the picker.</div>
                  </div>
                  <Button leftIcon={<Plus className="h-4 w-4" />} onClick={() => fileInputRef.current?.click()} className="!h-9">
                    Add
                  </Button>
                </div>

                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={async (event) => {
                    const files = Array.from(event.target.files ?? []);
                    await appendFiles(files);
                    event.target.value = "";
                  }}
                />

                <div
                  className={[
                    "mt-4 rounded-[20px] border-2 border-dashed p-4 transition",
                    isDragging ? "border-[var(--ds-primary)] bg-[rgba(37,99,235,0.06)]" : "border-[rgba(0,0,0,0.14)] bg-white",
                  ].join(" ")}
                  onDragEnter={(event) => {
                    event.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragOver={(event) => {
                    event.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={() => setIsDragging(false)}
                  onDrop={async (event) => {
                    event.preventDefault();
                    setIsDragging(false);
                    await appendFiles(Array.from(event.dataTransfer.files));
                  }}
                >
                  <div className="flex items-center gap-3 text-slate-600">
                    <Upload className="h-5 w-5 text-[var(--ds-primary)]" />
                    <div>
                      <div className="text-sm font-semibold text-slate-900">Drop files here</div>
                      <div className="text-xs text-slate-500">PNG, JPG, PDF, or any file you want attached to the vehicle record.</div>
                    </div>
                  </div>
                </div>

                <div className="mt-5">
                  <div className="text-sm font-semibold text-slate-900">Preview</div>
                  <div className="mt-3 rounded-[18px] border border-[rgba(0,0,0,0.08)] bg-white p-3 shadow-sm">
                    {selectedAttachment ? (
                      <div className="space-y-3">
                        {selectedAttachment.kind === "image" || selectedAttachment.mimeType.startsWith("image/") ? (
                          <img
                            src={selectedAttachment.dataUrl}
                            alt={selectedAttachment.name}
                            className="h-56 w-full rounded-[14px] object-cover"
                          />
                        ) : (
                          <div className="flex h-56 items-center justify-center rounded-[14px] bg-slate-50">
                            <div className="text-center">
                              <FileText className="mx-auto h-10 w-10 text-slate-400" />
                              <div className="mt-2 text-base font-semibold text-slate-900">{selectedAttachment.name}</div>
                              <div className="text-sm text-slate-500">{selectedAttachment.mimeType}</div>
                            </div>
                          </div>
                        )}
                        <div className="flex items-center justify-between">
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-slate-900">{selectedAttachment.name}</div>
                            <div className="text-xs text-slate-500">
                              {selectedAttachment.kind === "image" ? "Image" : "File"} · {formatBytes(selectedAttachment.size)}
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="flex h-56 items-center justify-center rounded-[14px] bg-slate-50 text-slate-500">
                        <div className="text-center">
                          <ImageIcon className="mx-auto h-10 w-10 text-slate-400" />
                          <div className="mt-2 text-sm font-semibold text-slate-900">No attachment selected</div>
                          <div className="text-xs text-slate-500">Add a photo or file to see it here.</div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-4">
                  <CourtesyCarAttachmentStrip
                    attachments={values.attachments}
                    selectedId={selectedAttachment?.id ?? null}
                    onSelect={(attachment) => setSelectedAttachmentId(attachment.id)}
                    onRemove={(attachmentId) =>
                      setValues((prev) => {
                        const nextAttachments = prev.attachments.filter((attachment) => attachment.id !== attachmentId);
                        if (selectedAttachmentId === attachmentId) {
                          setSelectedAttachmentId(nextAttachments[0]?.id ?? null);
                        }
                        return { ...prev, attachments: nextAttachments };
                      })
                    }
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-[rgba(0,0,0,0.08)] bg-white px-6 py-4">
          <div className="text-sm text-slate-500">
            {isCreateMode && lookupState !== "success" ? "先完成车牌抓取，再保存。Attachments 是可选项。" : "Attachments are saved with the vehicle record and previewed inline."}
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={onClose}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => void handleSubmit()}
              leftIcon={isCreateMode && !canSave ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              disabled={!canSave || (isCreateMode && lookupBusy)}
            >
              {isCreateMode && lookupState !== "success" ? "Save after lookup" : "Save vehicle"}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}

function Field({
  label,
  hint,
  error,
  className = "",
  children,
}: {
  label: string;
  hint?: string;
  error?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={["block", className].join(" ")}>
      <div className="mb-1 flex items-end justify-between gap-2">
        <span className="text-sm font-semibold text-slate-800">{label}</span>
        {hint ? <span className="text-xs text-slate-500">{hint}</span> : null}
      </div>
      {children}
      {error ? (
        <div className="mt-1 flex items-center gap-1 text-xs text-red-600">
          <AlertCircle className="h-3.5 w-3.5" />
          {error}
        </div>
      ) : null}
    </label>
  );
}
