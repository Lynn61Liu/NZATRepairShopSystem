import { getCachedValue, setCachedValue } from "@/utils/localCache";
import type {
  CourtesyCar,
  CourtesyCarEditorValues,
  CourtesyCarStatusAction,
} from "./courtesyCars.types";
import { normalizeCourtesyCarDraft, transitionCourtesyCarStatus } from "./courtesyCars.utils";

const STORAGE_KEY = "courtesy-cars:v1";

function createId(prefix = "car") {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createSeedCourtesyCars(): CourtesyCar[] {
  return [];
}

export function loadCourtesyCars(): CourtesyCar[] {
  const cached = getCachedValue<CourtesyCar[]>(STORAGE_KEY);
  if (cached?.data && Array.isArray(cached.data) && cached.data.length > 0) {
    return cached.data;
  }

  const seed = createSeedCourtesyCars();
  setCachedValue(STORAGE_KEY, seed);
  return seed;
}

export function saveCourtesyCars(cars: CourtesyCar[]) {
  setCachedValue(STORAGE_KEY, cars);
}

export function deleteCourtesyCar(cars: CourtesyCar[], carId: string) {
  return cars.filter((car) => car.id !== carId);
}

export function upsertCourtesyCar(cars: CourtesyCar[], next: CourtesyCar) {
  const index = cars.findIndex((car) => car.id === next.id);
  if (index === -1) return [...cars, next];
  const updated = [...cars];
  updated[index] = next;
  return updated;
}

export function removeCourtesyCarAttachment(cars: CourtesyCar[], carId: string, attachmentId: string) {
  return cars.map((car) =>
    car.id === carId ? { ...car, attachments: car.attachments.filter((attachment) => attachment.id !== attachmentId) } : car
  );
}

export function setCourtesyCarStatus(
  car: CourtesyCar,
  action: CourtesyCarStatusAction,
  options?: { now?: string; note?: string }
) {
  if (action === "returned") {
    return transitionCourtesyCarStatus(car, action, { now: options?.now });
  }

  const now = options?.now ?? new Date().toISOString();
  return {
    ...car,
    status: action,
    note: action === "unavailable" ? (options?.note ?? car.note ?? "") : car.note ?? "",
    returnedAt: action === "available" ? car.returnedAt : car.returnedAt,
    loanedAt: action === "available" ? null : car.loanedAt ?? null,
    borrowerName: action === "available" ? "" : car.borrowerName ?? "",
    borrowerPhone: action === "available" ? "" : car.borrowerPhone ?? "",
    updatedAt: now,
  };
}

export function createCourtesyCarFromEditor(
  values: CourtesyCarEditorValues,
  existing?: CourtesyCar | null,
  options?: { now?: string }
): CourtesyCar {
  const now = options?.now ?? new Date().toISOString();
  const normalized = normalizeCourtesyCarDraft({
    plate: values.plate,
    make: values.make,
    model: values.model,
    color: values.color,
    year: values.year,
    mileage: values.mileage,
    fuelLevel: values.fuelLevel,
    agreedValue: values.agreedValue,
    status: values.status,
    note: values.note,
    wofExpiry: values.wofExpiry,
    regoExpiry: values.regoExpiry,
  });

    return {
      id: existing?.id ?? createId("car"),
      plate: normalized.plate,
      make: normalized.make,
      model: normalized.model,
    color: normalized.color,
    year: normalized.year == null ? null : Number(normalized.year),
    mileage: normalized.mileage == null ? null : Number(normalized.mileage),
    fuelLevel: normalized.fuelLevel ?? "",
    agreedValue: Number(normalized.agreedValue) || 0,
    status: normalized.status,
      note: normalized.note?.trim() || "",
      wofExpiry: normalized.wofExpiry ?? null,
      regoExpiry: normalized.regoExpiry ?? null,
      loanedAt: values.loanedAt ?? null,
      borrowerName: values.borrowerName?.trim() || "",
    borrowerPhone: values.borrowerPhone?.trim() || "",
    returnedAt: existing?.returnedAt ?? null,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    attachments: values.attachments,
  };
}
