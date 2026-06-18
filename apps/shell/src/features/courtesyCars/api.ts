import { requestJson } from "@/utils/api";
import type {
  CourtesyCar,
  CourtesyCarAttachment,
  CourtesyCarEditorValues,
  CourtesyCarCurrentAgreement,
  CourtesyCarStatusAction,
} from "./courtesyCars.types";
import { normalizeCourtesyCarDraft } from "./courtesyCars.utils";

type ApiAttachment = {
  id: string;
  kind: string;
  name: string;
  mimeType: string;
  size: number;
  dataUrl: string;
  createdAt: string;
};

type ApiVehicle = {
  id: number;
  plate: string;
  make?: string | null;
  model?: string | null;
  color?: string | null;
  year?: number | null;
  mileage?: number | null;
  fuelLevel?: string | null;
  agreedVehicleValue: number;
  status: CourtesyCar["status"];
  note?: string | null;
  wofExpiry?: string | null;
  regoExpiry?: string | null;
  loanedAt?: string | null;
  borrowerName?: string | null;
  borrowerPhone?: string | null;
  currentAgreement?: CourtesyCarCurrentAgreement | null;
  returnedAt?: string | null;
  attachments?: ApiAttachment[];
  createdAt: string;
  updatedAt: string;
};

type ApiListResponse<T> = { items?: T[] };
type ApiSingleResponse<T> = { vehicle?: T };

type CourtesyCarVehiclePayload = {
  plate: string;
  make?: string | null;
  model?: string | null;
  color?: string | null;
  year?: number | null;
  mileage?: number | null;
  fuelLevel?: string | null;
  agreedVehicleValue: number;
  status: CourtesyCar["status"];
  note?: string | null;
  wofExpiry?: string | null;
  regoExpiry?: string | null;
  loanedAt?: string | null;
  borrowerName?: string | null;
  borrowerPhone?: string | null;
  attachments?: CourtesyCarAttachment[];
};

function mapAttachment(attachment: ApiAttachment): CourtesyCarAttachment {
  return {
    ...attachment,
    kind: attachment.kind === "image" ? "image" : "file",
  };
}

function mapVehicle(vehicle: ApiVehicle): CourtesyCar {
  return {
    id: String(vehicle.id),
    plate: vehicle.plate,
    make: vehicle.make ?? "",
    model: vehicle.model ?? "",
    color: vehicle.color ?? "",
    year: vehicle.year ?? null,
    mileage: vehicle.mileage ?? null,
    fuelLevel: vehicle.fuelLevel ?? "",
    agreedValue: vehicle.agreedVehicleValue,
    status: vehicle.status,
    note: vehicle.note ?? "",
    wofExpiry: vehicle.wofExpiry ?? null,
    regoExpiry: vehicle.regoExpiry ?? null,
    loanedAt: vehicle.loanedAt ?? null,
    borrowerName: vehicle.borrowerName ?? "",
    borrowerPhone: vehicle.borrowerPhone ?? "",
    currentAgreement: vehicle.currentAgreement ?? null,
    returnedAt: vehicle.returnedAt ?? null,
    createdAt: vehicle.createdAt,
    updatedAt: vehicle.updatedAt,
    attachments: (vehicle.attachments ?? []).map(mapAttachment),
  };
}

function normalizePayload(values: CourtesyCarEditorValues, status: CourtesyCar["status"]): CourtesyCarVehiclePayload {
  const normalized = normalizeCourtesyCarDraft({
    plate: values.plate,
    make: values.make,
    model: values.model,
    color: values.color,
    year: values.year,
    mileage: values.mileage,
    fuelLevel: values.fuelLevel,
    agreedValue: values.agreedValue,
    status,
    note: values.note,
    wofExpiry: values.wofExpiry,
    regoExpiry: values.regoExpiry,
  });

  return {
    plate: normalized.plate,
    make: normalized.make || null,
    model: normalized.model || null,
    color: normalized.color || null,
    year: normalized.year == null ? null : Number(normalized.year),
    mileage: normalized.mileage == null ? null : Number(normalized.mileage),
    fuelLevel: normalized.fuelLevel || null,
    agreedVehicleValue: Number(normalized.agreedValue) || 0,
    status,
    note: normalized.note || null,
    wofExpiry: normalized.wofExpiry || null,
    regoExpiry: normalized.regoExpiry || null,
    loanedAt: status === "on_loan" ? values.loanedAt?.trim() || new Date().toISOString() : null,
    borrowerName: status === "on_loan" ? values.borrowerName?.trim() || null : null,
    borrowerPhone: status === "on_loan" ? values.borrowerPhone?.trim() || null : null,
    attachments: values.attachments,
  };
}

export async function fetchCourtesyCars(): Promise<CourtesyCar[]> {
  const res = await requestJson<ApiListResponse<ApiVehicle>>("/api/courtesy-cars/vehicles", {
    cache: "no-store",
  });
  const items = res.data?.items ?? [];
  return items.map(mapVehicle);
}

export async function createCourtesyCar(values: CourtesyCarEditorValues): Promise<CourtesyCar> {
  const payload = normalizePayload(values, values.status);
  const res = await requestJson<ApiSingleResponse<ApiVehicle>>("/api/courtesy-cars/vehicles", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok || !res.data?.vehicle) {
    throw new Error(res.error || "Failed to create courtesy car.");
  }
  return mapVehicle(res.data.vehicle);
}

export async function updateCourtesyCar(vehicleId: string, values: CourtesyCarEditorValues): Promise<CourtesyCar> {
  const payload = normalizePayload(values, values.status);
  const res = await requestJson<ApiSingleResponse<ApiVehicle>>(`/api/courtesy-cars/vehicles/${vehicleId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok || !res.data?.vehicle) {
    throw new Error(res.error || "Failed to update courtesy car.");
  }
  return mapVehicle(res.data.vehicle);
}

export async function setCourtesyCarStatus(vehicle: CourtesyCar, action: CourtesyCarStatusAction): Promise<CourtesyCar> {
  if (action === "returned") {
    const res = await requestJson<ApiSingleResponse<ApiVehicle>>(`/api/courtesy-cars/vehicles/${vehicle.id}/return`, {
      method: "POST",
    });
    if (!res.ok || !res.data?.vehicle) {
      throw new Error(res.error || "Failed to return courtesy car.");
    }
    return mapVehicle(res.data.vehicle);
  }

  const values: CourtesyCarEditorValues = {
    plate: vehicle.plate,
    make: vehicle.make,
    model: vehicle.model,
    color: vehicle.color,
    year: vehicle.year != null ? String(vehicle.year) : "",
    mileage: vehicle.mileage != null ? String(vehicle.mileage) : "",
    fuelLevel: vehicle.fuelLevel ?? "",
    agreedValue: String(vehicle.agreedValue),
    status: action,
    note: action === "unavailable" ? vehicle.note || "" : vehicle.note || "",
    wofExpiry: vehicle.wofExpiry || "",
    regoExpiry: vehicle.regoExpiry || "",
    loanedAt: action === "on_loan" ? vehicle.loanedAt || new Date().toISOString() : vehicle.loanedAt || "",
    borrowerName: action === "on_loan" ? vehicle.borrowerName || "" : vehicle.borrowerName || "",
    borrowerPhone: action === "on_loan" ? vehicle.borrowerPhone || "" : vehicle.borrowerPhone || "",
    attachments: vehicle.attachments,
  };

  return updateCourtesyCar(vehicle.id, values);
}

export async function deleteCourtesyCar(vehicleId: string) {
  const res = await requestJson<{ deleted?: boolean }>(`/api/courtesy-cars/vehicles/${vehicleId}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    throw new Error(res.error || "Failed to delete courtesy car.");
  }
  return true;
}
