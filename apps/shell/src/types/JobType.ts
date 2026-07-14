import type { MechWorkflowStatus } from "@/features/mechWorkflow";

export type JobStatus =
  | "In Progress"
  | "Completed"
  | "Pending"
  | "Ready"
  | "Archived"
  | "Cancelled";

export type JobRow = {
  id: string;
  vehicleStatus: JobStatus;
  urgent: boolean;
  needsPo?: boolean;
  poUnreadReplyCount?: number;
  selectedTags: string[];
  plate: string;
  vehicleModel: string;
  wofPct: number | null;
  wofStatus?: "Todo" | "Checked" | "Recorded" | null;
  mechPct: number | null;
  mechStatus?: MechWorkflowStatus | null;
  paintPct: number | null;
  paintStatus?: string | null;
  paintCurrentStage?: number | null;
  customerName: string;
  customerCode?: string;
  customerPhone: string;
  notes?: string;
  privateNotes?: string;
  externalInvoiceId?: string;
  xeroStatus?: string | null;
  createdAt: string; 
};

export type TimeRange = "" | "week" | "lastWeek" | "month" | "custom";
export type PaintFilterStatus =
  | ""
  | "on_hold"
  | "waiting"
  | "sheet"
  | "undercoat"
  | "sanding"
  | "painting"
  | "assembly"
  | "done"
  | "delivered";

export type JobsFilters = {
  search: string;
  jobType: "" | JobStatus;
  wofStatus: "" | "Todo" | "Checked" | "Recorded";
  paintStatus: PaintFilterStatus;
  xeroStatus: "" | "DRAFT" | "AUTHORISED" | "PAID";
  timeRange: TimeRange;
  startDate: string; // yyyy-mm-dd (input date)
  endDate: string;   // yyyy-mm-dd
  customer: string;
  selectedTags: string[];
};
