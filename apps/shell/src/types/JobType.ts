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
  selectedTags: string[];
  plate: string;
  vehicleModel: string;
  wofPct: number | null;
  mechPct: number | null;
  paintPct: number | null;
  customerName: string;
  customerCode?: string;
  customerPhone: string;
  createdAt: string; // 建议后期换成 ISO
};

export type TimeRange = "" | "week" | "lastWeek" | "month" | "custom";

export type JobsFilters = {
  search: string;
  jobType: "" | JobStatus;
  timeRange: TimeRange;
  startDate: string; // yyyy-mm-dd (input date)
  endDate: string;   // yyyy-mm-dd
  customer: string;
  selectedTags: string[];
};
