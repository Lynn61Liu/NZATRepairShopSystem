export const FRONTEND_CACHE_REFRESH_INTERVAL_MS = 12 * 60 * 60 * 1000;
export const FRONTEND_CACHE_REFRESH_STORAGE_KEY = "cache:frontend:full-refresh:last-run:v1";

type CacheRefreshStorage = Pick<Storage, "getItem" | "setItem">;

type RefreshIfDueOptions = {
  refresh: () => Promise<void>;
  storage?: CacheRefreshStorage;
  now?: () => number;
  intervalMs?: number;
};

type SchedulerOptions = RefreshIfDueOptions & {
  setIntervalFn?: (handler: () => void, timeout: number) => number;
  clearIntervalFn?: (id: number) => void;
};

function getDefaultStorage(): CacheRefreshStorage | null {
  if (typeof window === "undefined" || typeof window.localStorage === "undefined") {
    return null;
  }

  return window.localStorage;
}

function readLastRefreshAt(storage: CacheRefreshStorage) {
  const value = Number(storage.getItem(FRONTEND_CACHE_REFRESH_STORAGE_KEY));
  return Number.isFinite(value) && value > 0 ? value : null;
}

export async function refreshFrontendCachesIfDue({
  refresh,
  storage = getDefaultStorage() ?? undefined,
  now = Date.now,
  intervalMs = FRONTEND_CACHE_REFRESH_INTERVAL_MS,
}: RefreshIfDueOptions) {
  if (!storage) return false;

  const currentTime = now();
  const lastRefreshAt = readLastRefreshAt(storage);
  if (lastRefreshAt !== null && currentTime - lastRefreshAt < intervalMs) {
    return false;
  }

  await refresh();
  storage.setItem(FRONTEND_CACHE_REFRESH_STORAGE_KEY, String(currentTime));
  return true;
}

export function startFrontendCacheRefreshScheduler({
  refresh,
  storage = getDefaultStorage() ?? undefined,
  now = Date.now,
  intervalMs = FRONTEND_CACHE_REFRESH_INTERVAL_MS,
  setIntervalFn,
  clearIntervalFn,
}: SchedulerOptions) {
  if (!storage || typeof window === "undefined") {
    return () => undefined;
  }

  const schedule = setIntervalFn ?? window.setInterval.bind(window);
  const clear = clearIntervalFn ?? window.clearInterval.bind(window);
  let running = false;
  const runIfDue = () => {
    if (running) return;
    running = true;
    void refreshFrontendCachesIfDue({ refresh, storage, now, intervalMs })
      .catch(() => undefined)
      .finally(() => {
        running = false;
      });
  };

  queueMicrotask(runIfDue);
  const timer = schedule(runIfDue, intervalMs);
  return () => clear(timer);
}
