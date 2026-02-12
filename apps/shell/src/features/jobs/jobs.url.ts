import type { JobsFilters } from "@/types/JobType";
import { DEFAULT_JOBS_FILTERS } from "./jobs.defaults";

const SEP = ",";

export function filtersToSearchParams(filters: JobsFilters): URLSearchParams {
  const p = new URLSearchParams();

  if (filters.search) p.set("q", filters.search);
  if (filters.jobType) p.set("status", filters.jobType);
  if (filters.timeRange) p.set("range", filters.timeRange);
  if (filters.startDate) p.set("start", filters.startDate);
  if (filters.endDate) p.set("end", filters.endDate);
  if (filters.customer) p.set("customer", filters.customer);

  if (filters.selectedTags.length > 0) {
    p.set("tags", filters.selectedTags.join(SEP));
  }

  return p;
}

export function searchParamsToFilters(sp: URLSearchParams): JobsFilters {
  const next: JobsFilters = { ...DEFAULT_JOBS_FILTERS };

  next.search = sp.get("q") ?? "";
  next.jobType = (sp.get("status") ?? "") as JobsFilters["jobType"];
  next.timeRange = (sp.get("range") ?? "") as JobsFilters["timeRange"];
  next.startDate = sp.get("start") ?? "";
  next.endDate = sp.get("end") ?? "";
  next.customer = sp.get("customer") ?? "";

  const tags = sp.get("tags");
  next.selectedTags = tags ? tags.split(SEP).filter(Boolean) : [];

  return next;
}

export function getPageFromSearchParams(sp: URLSearchParams): number {
  const raw = sp.get("page");
  const n = raw ? Number(raw) : 1;
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
}
