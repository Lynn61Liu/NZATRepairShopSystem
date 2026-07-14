import type {
  CourtesyCarAttachment,
  CourtesyCarEditorValues,
  CourtesyCarStatus,
  CourtesyCar,
  CourtesyCarDraft,
  CourtesyCarStatusAction,
  CourtesyCarValidationResult,
  CourtesyCarWarning,
  CourtesyCarTheme,
} from "./courtesyCars.types";

function stripPlate(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7);
}

function parseNumber(value: number | string | undefined) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value !== "string") return null;
  const parsed = Number(value.replace(/,/g, "").trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function startOfDayUtc(value: string | Date) {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function daysBetween(later: string | Date, earlier: string | Date) {
  const diffMs = startOfDayUtc(later).getTime() - startOfDayUtc(earlier).getTime();
  return Math.round(diffMs / 86400000);
}

function isValidDate(value: string | null | undefined) {
  if (!value) return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime());
}

function createId(prefix = "courtesy-car") {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function toBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  if (typeof btoa === "function") {
    return btoa(binary);
  }

  throw new Error("Base64 encoding is not available in this environment.");
}

export function normalizeCourtesyCarDraft(draft: CourtesyCarDraft) {
  return {
    ...draft,
    plate: stripPlate(String(draft.plate ?? "")),
    make: String(draft.make ?? "").trim(),
    model: String(draft.model ?? "").trim(),
    color: String(draft.color ?? "").trim(),
    note: String(draft.note ?? "").trim(),
    fuelLevel: String(draft.fuelLevel ?? "").trim(),
    wofExpiry: draft.wofExpiry ? String(draft.wofExpiry).trim() : undefined,
    regoExpiry: draft.regoExpiry ? String(draft.regoExpiry).trim() : undefined,
    mileage: parseNumber(draft.mileage ?? undefined),
    year: parseNumber(draft.year ?? undefined),
    agreedValue: parseNumber(draft.agreedValue) ?? 0,
  } satisfies CourtesyCarDraft;
}

export function validateCourtesyCarDraft(draft: CourtesyCarDraft): CourtesyCarValidationResult {
  const normalized = normalizeCourtesyCarDraft(draft);
  const errors: CourtesyCarValidationResult["errors"] = {};

  if (!normalized.plate) {
    errors.plate = "Plate is required.";
  }
  if (!normalized.status) {
    errors.status = "Status is required.";
  }
  if (!Number.isFinite(Number(normalized.agreedValue)) || Number(normalized.agreedValue) <= 0) {
    errors.agreedValue = "Agreed value is required.";
  }
  if (normalized.status === "unavailable" && !normalized.note.trim()) {
    errors.note = "Unavailable vehicles require a reason note.";
  }

  return {
    valid: Object.keys(errors).length === 0,
    errors,
  };
}

export function transitionCourtesyCarStatus(
  car: Partial<CourtesyCar> & Pick<CourtesyCar, "status" | "returnedAt"> & Record<string, unknown>,
  nextStatus: CourtesyCarStatusAction,
  options?: { now?: string }
): CourtesyCar {
  const now = options?.now ?? new Date().toISOString();

  if (nextStatus === "returned") {
    return {
      ...car,
      status: "available" as const,
      returnedAt: now,
      loanedAt: null,
      borrowerName: "",
      borrowerPhone: "",
      updatedAt: now,
    } as CourtesyCar;
  }

  return {
    ...car,
    status: nextStatus,
    updatedAt: now,
  } as CourtesyCar;
}

export function filterCourtesyCarsByStatus<T extends { status: CourtesyCarStatus }>(
  cars: readonly T[],
  tab: "all" | CourtesyCarStatus
) {
  if (tab === "all") return [...cars];
  return cars.filter((car) => car.status === tab);
}

const courtesyCarThemes: CourtesyCarTheme[] = [
  {
    headerGradient: "linear-gradient(135deg, #4f83ff 0%, #7fb1ff 100%)",
    accentTone: "rgba(255,255,255,0.18)",
    headerTextClass: "text-white",
    bodyClass: "bg-white",
    badgeClass: "bg-white/20 text-white ring-1 ring-white/20",
    buttonClass: "border border-white/20 bg-white/10 text-white backdrop-blur-sm hover:bg-white/20",
  },
  {
    headerGradient: "linear-gradient(135deg, #2f6eea 0%, #8cb4ff 100%)",
    accentTone: "rgba(255,255,255,0.16)",
    headerTextClass: "text-white",
    bodyClass: "bg-white",
    badgeClass: "bg-white/20 text-white ring-1 ring-white/20",
    buttonClass: "border border-white/20 bg-white/10 text-white backdrop-blur-sm hover:bg-white/20",
  },
  {
    headerGradient: "linear-gradient(135deg, #ff6a3d 0%, #ffb24d 100%)",
    accentTone: "rgba(255,255,255,0.16)",
    headerTextClass: "text-white",
    bodyClass: "bg-white",
    badgeClass: "bg-white/20 text-white ring-1 ring-white/20",
    buttonClass: "border border-white/20 bg-white/10 text-white backdrop-blur-sm hover:bg-white/20",
  },
  {
    headerGradient: "linear-gradient(135deg, #f59e0b 0%, #fed06a 100%)",
    accentTone: "rgba(255,255,255,0.16)",
    headerTextClass: "text-white",
    bodyClass: "bg-white",
    badgeClass: "bg-white/20 text-white ring-1 ring-white/20",
    buttonClass: "border border-white/20 bg-white/10 text-white backdrop-blur-sm hover:bg-white/20",
  },
  {
    headerGradient: "linear-gradient(135deg, #10b981 0%, #7ee4c2 100%)",
    accentTone: "rgba(255,255,255,0.16)",
    headerTextClass: "text-white",
    bodyClass: "bg-white",
    badgeClass: "bg-white/20 text-white ring-1 ring-white/20",
    buttonClass: "border border-white/20 bg-white/10 text-white backdrop-blur-sm hover:bg-white/20",
  },
];

function hashPlate(plate: string) {
  let hash = 0;
  const text = plate.trim().toUpperCase();
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) >>> 0;
  }
  return hash;
}

export function getCourtesyCarTheme(plate: string): CourtesyCarTheme {
  const index = hashPlate(plate) % courtesyCarThemes.length;
  return courtesyCarThemes[index];
}

export function getCourtesyCarsGridClass() {
  return "grid gap-4 sm:grid-cols-2 xl:grid-cols-3";
}

export function getCourtesyCarCardSummary(car: Pick<CourtesyCar, "year" | "make" | "model" | "color">) {
  return {
    vehicleLabel: [car.year, car.make, car.model].filter(Boolean).join(" "),
    colorLabel: car.color || "Unknown",
  };
}

export function getCourtesyCarLoanSummary(
  car: Pick<CourtesyCar, "status" | "loanedAt" | "borrowerName" | "borrowerPhone" | "currentAgreement">
) {
  if (car.status !== "on_loan") return null;

  const agreement = car.currentAgreement ?? null;
  const borrowerName = agreement?.contactName?.trim() || agreement?.jobCustomerName?.trim() || car.borrowerName?.trim() || "—";
  const borrowerPhone = agreement?.contactPhone?.trim() || agreement?.jobCustomerPhone?.trim() || car.borrowerPhone?.trim() || "—";

  return {
    agreementLabel: agreement ? `Agreement #${agreement.agreementId} · Job ${agreement.jobId}` : null,
    loanedAtLabel: car.loanedAt ? formatDisplayDate(car.loanedAt) : "—",
    borrowerNameLabel: borrowerName,
    borrowerPhoneLabel: borrowerPhone,
  };
}

export function getCourtesyCarLookupStatusMessage(values: Pick<CourtesyCarEditorValues, "make" | "model" | "color" | "wofExpiry" | "regoExpiry">) {
  const missing: string[] = [];

  if (!values.make.trim() || !values.model.trim()) {
    missing.push("车型");
  }
  if (!values.color.trim()) {
    missing.push("颜色");
  }
  if (!values.wofExpiry.trim()) {
    missing.push("WOF");
  }
  if (!values.regoExpiry.trim()) {
    missing.push("Rego");
  }

  if (missing.length === 0) {
    return {
      tone: "success" as const,
      message: "后端抓取完成，车辆核心资料已回填到表单。",
    };
  }

  return {
    tone: "warning" as const,
    message: `后端已返回部分资料，${missing.join("、")} 还需要手动补齐。`,
  };
}

export function getCourtesyCarStatusToggleTarget(status: CourtesyCarStatus): CourtesyCarStatus {
  return status === "available" ? "on_loan" : "available";
}

export async function fileToCourtesyCarAttachment(
  file: File,
  options?: { now?: string; id?: string }
): Promise<CourtesyCarAttachment> {
  const buffer = await file.arrayBuffer();
  const base64 = toBase64(buffer);
  const mimeType = file.type || "application/octet-stream";
  const kind = mimeType.startsWith("image/") ? "image" : "file";

  return {
    id: options?.id ?? createId("att"),
    kind,
    name: file.name || "attachment",
    mimeType,
    size: file.size,
    dataUrl: `data:${mimeType};base64,${base64}`,
    createdAt: options?.now ?? new Date().toISOString(),
  };
}

export function buildCourtesyCarWarnings(
  car: Partial<Pick<CourtesyCar, "wofExpiry" | "regoExpiry">> & Record<string, unknown>,
  options?: { now?: string; warningWindowDays?: number }
): CourtesyCarWarning[] {
  const now = options?.now ?? new Date().toISOString();
  const windowDays = options?.warningWindowDays ?? 30;
  const warnings: CourtesyCarWarning[] = [];

  const addWarning = (key: "wof" | "rego", expiry: string | null | undefined) => {
    if (!isValidDate(expiry)) return;
    const remaining = daysBetween(expiry as string, now);
    if (remaining > windowDays) return;
    warnings.push({
      key,
      level: remaining < 0 ? "critical" : "warning",
      label: remaining < 0 ? `${key === "wof" ? "WOF" : "Rego"} expired` : `${key === "wof" ? "WOF" : "Rego"} expires in ${remaining} days`,
      daysRemaining: remaining,
    });
  };

  addWarning("wof", car.wofExpiry);
  addWarning("rego", car.regoExpiry);

  return warnings;
}

function formatDisplayDate(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("en-NZ", { year: "numeric", month: "short", day: "2-digit" }).format(parsed);
}
