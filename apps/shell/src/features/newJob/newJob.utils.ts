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
  const data = payload as {
    vehicle?: {
      make?: unknown;
      model?: unknown;
      year?: unknown;
      bodyStyle?: unknown;
      type?: unknown;
      vin?: unknown;
      fuelType?: unknown;
      nzFirstRegistration?: unknown;
    };
  } | null;
  const make = data?.vehicle?.make ? String(data.vehicle.make) : "";
  const model = data?.vehicle?.model ? String(data.vehicle.model) : "";
  const year = data?.vehicle?.year ? String(data.vehicle.year) : "";
  const type = data?.vehicle?.bodyStyle
    ? String(data.vehicle.bodyStyle)
    : data?.vehicle?.type
      ? String(data.vehicle.type)
      : "";
  const vin = data?.vehicle?.vin ? String(data.vehicle.vin) : "";
  const fuelType = data?.vehicle?.fuelType ? String(data.vehicle.fuelType) : "";
  const nzFirstRegistration = data?.vehicle?.nzFirstRegistration
    ? String(data.vehicle.nzFirstRegistration)
    : "";

  return {
    model: [make, model].filter(Boolean).join(" "),
    year,
    type: type || undefined,
    vin: vin || undefined,
    fuelType: fuelType || undefined,
    nzFirstRegistration: nzFirstRegistration || undefined,
  };
}
