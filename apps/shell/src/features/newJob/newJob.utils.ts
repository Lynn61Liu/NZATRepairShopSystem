import type { VehicleInfo } from "./newJob.types";

export const PLATE_MIN_LENGTH = 6;

export function normalizePlateInput(raw: string): string | null {
  const sanitized = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  return sanitized;
}

export function shouldAutoImport(plate: string, minLength = PLATE_MIN_LENGTH) {
  return plate.length >= minLength;
}

export function extractVehicleInfo(payload: unknown): VehicleInfo {
  const data = payload as { vehicle?: { make?: unknown; model?: unknown; year?: unknown } } | null;
  const make = data?.vehicle?.make ? String(data.vehicle.make) : "";
  const model = data?.vehicle?.model ? String(data.vehicle.model) : "";
  const year = data?.vehicle?.year ? String(data.vehicle.year) : "";

  return {
    model: [make, model].filter(Boolean).join(" "),
    year,
  };
}
