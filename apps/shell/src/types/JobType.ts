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
  paintPct: number | null;
  paintStatus?: string | null;
  paintCurrentStage?: number | null;
  customerName: string;
  customerCode?: string;
  customerPhone: string;
  notes?: string;
  externalInvoiceId?: string;
  createdAt: string; 
};

export type TimeRange = "" | "week" | "lastWeek" | "month" | "custom";

export type JobsFilters = {
  search: string;
  jobType: "" | JobStatus;
  wofStatus: "" | "Todo" | "Checked" | "Recorded";
  timeRange: TimeRange;
  startDate: string; // yyyy-mm-dd (input date)
  endDate: string;   // yyyy-mm-dd
  customer: string;
  selectedTags: string[];
};
