import { buildJobSheetHtml, type JobSheetRow, type JobSheetType } from "./jobSheetPrint";
import { buildWofHtml, type WofPrintData } from "./wofPrint";

export type PrintTemplateType = JobSheetType | "wof";

export type PrintTemplatePayload =
  | { type: JobSheetType; data: { row: JobSheetRow; notes: string } }
  | { type: "wof"; data: WofPrintData };

export const buildTemplateHtml = (payload: PrintTemplatePayload) => {
  switch (payload.type) {
    case "mech":
    case "paint":
      return buildJobSheetHtml(payload.type, payload.data.row, payload.data.notes);
    case "wof":
      return buildWofHtml(payload.data);
    default: {
      const neverType: never = payload;
      throw new Error(`Unknown print template: ${JSON.stringify(neverType)}`);
    }
  }
};
