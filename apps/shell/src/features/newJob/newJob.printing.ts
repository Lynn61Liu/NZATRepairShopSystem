import type { ServiceType } from "./newJob.types";
import type { JobSheetRow, JobSheetType } from "@/features/printing/jobSheetPrint";
import { resolveJobSheetRouteKey, type SilentPrintRouteKey } from "@/features/printing/silentPrint.routes";

export type SaveAndPrintTemplateType = "mech" | "paint";

export function getSaveAndPrintTypes(selectedServices: readonly ServiceType[]): SaveAndPrintTemplateType[] {
  const types: SaveAndPrintTemplateType[] = [];
  if (selectedServices.includes("mech")) {
    types.push("mech");
  }
  if (selectedServices.includes("paint")) {
    types.push("paint");
  }
  return types;
}

type PrintJobSheetWithRoute = (
  type: JobSheetType,
  row: JobSheetRow,
  notes: string,
  routeKey?: SilentPrintRouteKey
) => void;

export type SaveAndPrintJobSheetOptions = {
  selectedServices: readonly ServiceType[];
  row: JobSheetRow;
  notes: string;
  print: PrintJobSheetWithRoute;
};

export type SaveAndPrintJobSheetResult = {
  attempted: boolean;
  printedAny: boolean;
  failed: boolean;
  failedTypes: SaveAndPrintTemplateType[];
};

export function printSavedJobSheets({
  selectedServices,
  row,
  notes,
  print,
}: SaveAndPrintJobSheetOptions): SaveAndPrintJobSheetResult {
  const printableTypes = getSaveAndPrintTypes(selectedServices);
  const result: SaveAndPrintJobSheetResult = {
    attempted: printableTypes.length > 0,
    printedAny: false,
    failed: false,
    failedTypes: [],
  };

  for (const type of printableTypes) {
    try {
      const routeKey = resolveSaveAndPrintRouteKey(type, selectedServices);
      print(type, row, notes, routeKey);
      result.printedAny = true;
    } catch {
      result.failed = true;
      result.failedTypes.push(type);
    }
  }

  return result;
}

export function resolveSaveAndPrintRouteKey(
  type: SaveAndPrintTemplateType,
  selectedServices: readonly ServiceType[]
): SilentPrintRouteKey {
  if (type === "paint") {
    return "job-pnp";
  }

  return resolveJobSheetRouteKey(type, selectedServices.includes("wof"));
}
