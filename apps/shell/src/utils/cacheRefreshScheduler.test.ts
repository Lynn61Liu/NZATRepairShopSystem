/// <reference types="node" />

import assert from "node:assert/strict";
import test from "node:test";

import {
  FRONTEND_CACHE_REFRESH_INTERVAL_MS,
  FRONTEND_CACHE_REFRESH_STORAGE_KEY,
  refreshFrontendCachesIfDue,
} from "./cacheRefreshScheduler";

test("refreshFrontendCachesIfDue refreshes at most twice per day", async () => {
  let now = 1_000;
  const values = new Map<string, string>();
  const refreshCalls: number[] = [];
  const storage = {
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
  };

  const refresh = async () => {
    refreshCalls.push(now);
  };

  await refreshFrontendCachesIfDue({ refresh, storage, now: () => now });
  await refreshFrontendCachesIfDue({ refresh, storage, now: () => now + FRONTEND_CACHE_REFRESH_INTERVAL_MS - 1 });

  now += FRONTEND_CACHE_REFRESH_INTERVAL_MS;
  await refreshFrontendCachesIfDue({ refresh, storage, now: () => now });

  assert.deepEqual(refreshCalls, [1_000, 1_000 + FRONTEND_CACHE_REFRESH_INTERVAL_MS]);
  assert.equal(values.get(FRONTEND_CACHE_REFRESH_STORAGE_KEY), String(now));
});
