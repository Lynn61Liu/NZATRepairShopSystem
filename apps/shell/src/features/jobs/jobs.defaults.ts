import type { JobsFilters } from "@/types/JobType";

export const DEFAULT_JOBS_FILTERS: JobsFilters = {
  search: "",
  jobType: "",
  wofStatus: "",
  timeRange: "",
  startDate: "",
  endDate: "",
  customer: "",
  selectedTags: [],
};
