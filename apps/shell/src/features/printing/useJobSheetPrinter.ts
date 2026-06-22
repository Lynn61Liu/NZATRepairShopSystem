import { useCallback } from "react";
import { useTemplatePrinter, type PrintDispatchResult } from "./useTemplatePrinter";
import type { JobSheetRow, JobSheetType } from "./jobSheetPrint";
import type { PrintMode } from "./printModes";
import type { SilentPrintRouteKey } from "./silentPrint.routes";

type ResolveJobSheetData = (id: string) => Promise<{ row: JobSheetRow; notes: string; routeKey?: SilentPrintRouteKey } | null>;

type UseJobSheetPrinterOptions = {
  onPopupBlocked?: () => void;
  onError?: (message: string) => void;
  resolveById?: ResolveJobSheetData;
  printMode?: PrintMode;
};

export function useJobSheetPrinter(options: UseJobSheetPrinterOptions = {}) {
  const { onPopupBlocked, onError, resolveById, printMode = "preview" } = options;
  const { printTemplate } = useTemplatePrinter({ onPopupBlocked, onError });

  const print = useCallback(
    (
      type: JobSheetType,
      row: JobSheetRow,
      notes: string,
      routeKey?: SilentPrintRouteKey,
      overridePrintMode?: PrintMode
    ): Promise<PrintDispatchResult> => {
      return printTemplate({ type, data: { row, notes }, routeKey, printMode: overridePrintMode ?? printMode });
    },
    [printTemplate, printMode]
  );

  const printById = useCallback(
    async (id: string, type: JobSheetType, routeKey?: SilentPrintRouteKey) => {
      if (!resolveById) {
        return { ok: false, mode: printMode, error: "resolve_by_id_unavailable" } satisfies PrintDispatchResult;
      }
      const resolved = await resolveById(id);
      if (!resolved) return { ok: false, mode: printMode, error: "job_not_found" } satisfies PrintDispatchResult;
      return print(type, resolved.row, resolved.notes, routeKey ?? resolved.routeKey);
    },
    [resolveById, print]
  );

  return { print, printById };
}
