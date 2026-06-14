import { useCallback } from "react";
import { useTemplatePrinter } from "./useTemplatePrinter";
import type { JobSheetRow, JobSheetType } from "./jobSheetPrint";
import type { SilentPrintRouteKey } from "./silentPrint.routes";

type ResolveJobSheetData = (id: string) => Promise<{ row: JobSheetRow; notes: string; routeKey?: SilentPrintRouteKey } | null>;

type UseJobSheetPrinterOptions = {
  onPopupBlocked?: () => void;
  resolveById?: ResolveJobSheetData;
};

export function useJobSheetPrinter(options: UseJobSheetPrinterOptions = {}) {
  const { onPopupBlocked, resolveById } = options;
  const { printTemplate } = useTemplatePrinter({ onPopupBlocked });

  const print = useCallback(
    (type: JobSheetType, row: JobSheetRow, notes: string, routeKey?: SilentPrintRouteKey) => {
      printTemplate({ type, data: { row, notes }, routeKey });
    },
    [printTemplate]
  );

  const printById = useCallback(
    async (id: string, type: JobSheetType, routeKey?: SilentPrintRouteKey) => {
      if (!resolveById) {
        return;
      }
      const resolved = await resolveById(id);
      if (!resolved) return;
      print(type, resolved.row, resolved.notes, routeKey ?? resolved.routeKey);
    },
    [resolveById, print]
  );

  return { print, printById };
}
