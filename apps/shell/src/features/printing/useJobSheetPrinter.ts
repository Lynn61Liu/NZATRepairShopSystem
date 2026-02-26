import { useCallback } from "react";
import { useTemplatePrinter } from "./useTemplatePrinter";
import type { JobSheetRow, JobSheetType } from "./jobSheetPrint";

type ResolveJobSheetData = (id: string) => Promise<{ row: JobSheetRow; notes: string } | null>;

type UseJobSheetPrinterOptions = {
  onPopupBlocked?: () => void;
  resolveById?: ResolveJobSheetData;
};

export function useJobSheetPrinter(options: UseJobSheetPrinterOptions = {}) {
  const { onPopupBlocked, resolveById } = options;
  const { printTemplate } = useTemplatePrinter({ onPopupBlocked });

  const print = useCallback(
    (type: JobSheetType, row: JobSheetRow, notes: string) => {
      printTemplate({ type, data: { row, notes } });
    },
    [printTemplate]
  );

  const printById = useCallback(
    async (id: string, type: JobSheetType) => {
      if (!resolveById) {
        return;
      }
      const resolved = await resolveById(id);
      if (!resolved) return;
      print(type, resolved.row, resolved.notes);
    },
    [resolveById, print]
  );

  return { print, printById };
}
