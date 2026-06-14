export type SilentPrintRouteKey = "job-mech" | "job-wof" | "job-pnp" | "wof-record";

export type SilentPrintPrinterFamily = "hp" | "epson";

export type SilentPrintRoute = {
  routeKey: SilentPrintRouteKey;
  printerFamily: SilentPrintPrinterFamily;
  printerName: string;
  templateKey: "mech" | "pnp" | "wof-record";
};

const SILENT_PRINT_ROUTE_TABLE: Record<SilentPrintRouteKey, SilentPrintRoute> = {
  "job-mech": {
    routeKey: "job-mech",
    printerFamily: "hp",
    printerName: "HP",
    templateKey: "mech",
  },
  "job-wof": {
    routeKey: "job-wof",
    printerFamily: "hp",
    printerName: "HP",
    templateKey: "mech",
  },
  "job-pnp": {
    routeKey: "job-pnp",
    printerFamily: "hp",
    printerName: "HP",
    templateKey: "pnp",
  },
  "wof-record": {
    routeKey: "wof-record",
    printerFamily: "epson",
    printerName: "Epson",
    templateKey: "wof-record",
  },
};

export function resolveSilentPrintRoute(routeKey: SilentPrintRouteKey): SilentPrintRoute {
  return SILENT_PRINT_ROUTE_TABLE[routeKey];
}

export function resolveSilentPrintPrinterFamily(routeKey: SilentPrintRouteKey): SilentPrintPrinterFamily {
  return resolveSilentPrintRoute(routeKey).printerFamily;
}

export function resolveJobSheetRouteKey(
  templateType: "mech" | "paint",
  hasWofService: boolean
): SilentPrintRouteKey {
  if (templateType === "paint") {
    return "job-pnp";
  }

  return hasWofService ? "job-wof" : "job-mech";
}

export function resolveWofRecordRouteKey(): SilentPrintRouteKey {
  return "wof-record";
}
