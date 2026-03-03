import type { JobsFilters, JobRow } from "@/types/JobType";
import { parseTimestamp } from "@/utils/date";

export function parseJobCreatedAt(createdAt: string): Date | null {
  if (!createdAt) return null;
  const parsed = parseTimestamp(createdAt);
  if (!parsed) return null;
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate());
}


export function buildDateRange(filters: JobsFilters): { start: Date; end: Date } | null {
  const today = new Date();
  const start = new Date(today);
  const end = new Date(today);

  switch (filters.timeRange) {
    case "week": {
      // 本周：周一~周日
      const day = today.getDay() || 7; // 周日=0 -> 7
      start.setDate(today.getDate() - day + 1);
      end.setDate(today.getDate() + (7 - day));
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      return { start, end };
    }

    case "lastWeek": {
      // 上周：上周一~上周日
      const day = today.getDay() || 7;
      const thisMonday = new Date(today);
      thisMonday.setDate(today.getDate() - day + 1);

      start.setTime(thisMonday.getTime());
      start.setDate(thisMonday.getDate() - 7);
      end.setTime(thisMonday.getTime());
      end.setDate(thisMonday.getDate() - 1);

      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      return { start, end };
    }

    case "month": {
      // 本月：1号~当月最后一天（修复 end=31）
      const y = today.getFullYear();
      const m = today.getMonth();
      const monthStart = new Date(y, m, 1);
      const monthEnd = new Date(y, m + 1, 0); // 当月最后一天

      monthStart.setHours(0, 0, 0, 0);
      monthEnd.setHours(23, 59, 59, 999);
      return { start: monthStart, end: monthEnd };
    }

    case "custom": {
      if (!filters.startDate && !filters.endDate) return null;

      const s = filters.startDate ? new Date(filters.startDate) : null;
      const e = filters.endDate ? new Date(filters.endDate) : null;

      if (s) s.setHours(0, 0, 0, 0);
      if (e) e.setHours(23, 59, 59, 999);

      // 缺一边就用另一边补齐
      if (s && e) return { start: s, end: e };
      if (s && !e) return { start: s, end: s };
      if (!s && e) return { start: e, end: e };

      return null;
    }

    default:
      return null;
  }
}


export function filterJobs(rows: JobRow[], filters: JobsFilters): JobRow[] {
  const s = filters.search.trim().toLowerCase();
  const customer = filters.customer.trim().toLowerCase();

  // tags：只算一次 lower（避免每行重复计算）
  const selectedTagsLower = filters.selectedTags.map((t) => t.toLowerCase());
  const dateRange = filters.timeRange ? buildDateRange(filters) : null;

  return rows.filter((r) => {
    // 搜索过滤
    if (s) {
      const customerText = (r.customerCode || r.customerName).toLowerCase();
      const hit =
        r.id.toLowerCase().includes(s) ||
        r.plate.toLowerCase().includes(s) ||
        r.vehicleModel.toLowerCase().includes(s) ||
        customerText.includes(s);
      if (!hit) return false;
    }

    // Job Type: 默认隐藏 Archived，只有筛选时才显示
    if (!filters.jobType && r.vehicleStatus === "Archived") return false;
    if (filters.jobType && r.vehicleStatus !== filters.jobType) return false;

    // 日期范围
    if (dateRange) {
      const rowDate = parseJobCreatedAt(r.createdAt);
      if (!rowDate) return false;
      if (rowDate < dateRange.start || rowDate > dateRange.end) return false;
    }

    // 客户
    if (customer) {
      const customerText = (r.customerCode || r.customerName).toLowerCase();
      if (!customerText.includes(customer)) return false;
    }

    // Tag：任意命中（OR）
    if (selectedTagsLower.length > 0) {
      const rowTagsLower = r.selectedTags.map((t) => t.toLowerCase());
      const hit = rowTagsLower.some((t) => selectedTagsLower.includes(t));
      if (!hit) return false;
    }

    return true;
  });
}

export function sortSelected(rows: JobRow[], selectedIds: Set<string>): JobRow[] {
  return [...rows].sort((a, b) => {
    const aSelected = selectedIds.has(a.id);
    const bSelected = selectedIds.has(b.id);
    if (aSelected && !bSelected) return -1;
    if (!aSelected && bSelected) return 1;
    return 0;
  });
}
