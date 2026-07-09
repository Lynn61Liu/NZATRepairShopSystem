import type { PoTodoRow, PoTodoTab } from "@/features/poTodo/poTodo.types";

export const PO_TODO_PAGE_CACHE_TTL_MS = 30 * 60 * 1000;

export type PoTodoPageCacheEntry<Row extends { jobId: number } = PoTodoRow> = {
  rows: Row[];
  total: number;
  totalPages: number;
  currentPage: number;
  cachedAt: number;
};

export type PoTodoPageCache<Row extends { jobId: number } = PoTodoRow> = Record<string, PoTodoPageCacheEntry<Row>>;

export function getPoTodoPageCacheKey(tab: PoTodoTab, page: number) {
  return `${tab}:${page}`;
}

export function isPoTodoPageCacheFresh(cachedAt: number, now: number, ttlMs = PO_TODO_PAGE_CACHE_TTL_MS) {
  return now - cachedAt <= ttlMs;
}

export function invalidatePoTodoPageCache<Row extends { jobId: number }>(
  cache: PoTodoPageCache<Row>,
  jobIds: readonly number[],
  affectedTabs: readonly PoTodoTab[] = []
): PoTodoPageCache<Row> {
  const affectedJobIds = new Set(jobIds);
  const affectedTabSet = new Set(affectedTabs);
  const next: PoTodoPageCache<Row> = {};

  for (const [key, entry] of Object.entries(cache)) {
    const tab = key.split(":")[0] as PoTodoTab;
    const containsAffectedJob = entry.rows.some((row) => affectedJobIds.has(row.jobId));
    if (affectedTabSet.has(tab) || containsAffectedJob) continue;
    next[key] = entry;
  }

  return next;
}

export function shouldShowXeroColumn(tab: PoTodoTab) {
  return tab !== "invoiced";
}

export function shouldShowPoDraftColumn(tab: PoTodoTab) {
  return tab !== "invoiced";
}

export function shouldShowSentColumn(tab: PoTodoTab) {
  return tab !== "invoiced";
}

export function shouldShowPoNumberColumn(tab: PoTodoTab) {
  return tab === "awaitingPo";
}

export function getPoTodoTableColSpan(tab: PoTodoTab) {
  if (tab === "invoiced") return 8;
  return shouldShowPoNumberColumn(tab) ? 10 : 9;
}

export function normalizePoNumberInput(value: string) {
  return value.replace(/\D/g, "");
}
