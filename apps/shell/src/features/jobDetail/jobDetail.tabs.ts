import type { JobDetailTabKey } from "@/types";
import { JOB_DETAIL_TEXT } from "./jobDetail.constants";

export const jobDetailTabs: { key: JobDetailTabKey; label: string }[] = [
  { key: "WOF", label: JOB_DETAIL_TEXT.tabs.wof },
  { key: "Mechanical", label: JOB_DETAIL_TEXT.tabs.mechanical },
  { key: "Parts", label: JOB_DETAIL_TEXT.tabs.parts },
  { key: "Paint", label: JOB_DETAIL_TEXT.tabs.paint },
  { key: "Log", label: JOB_DETAIL_TEXT.tabs.log },
  { key: "Invoice", label: JOB_DETAIL_TEXT.tabs.invoice },
];
