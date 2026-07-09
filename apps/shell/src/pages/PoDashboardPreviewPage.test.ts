/// <reference types="node" />

import assert from "node:assert/strict";
import test from "node:test";

import {
  getPoTodoTableColSpan,
  getPoTodoPageCacheKey,
  invalidatePoTodoPageCache,
  isPoTodoPageCacheFresh,
  normalizePoNumberInput,
  PO_TODO_PAGE_CACHE_TTL_MS,
  shouldShowPoDraftColumn,
  shouldShowPoNumberColumn,
  shouldShowSentColumn,
  shouldShowXeroColumn,
} from "./poDashboardPreviewPage.utils";

test("pending send tab hides the PO number column", () => {
  assert.equal(shouldShowPoNumberColumn("pendingSend"), false);
  assert.equal(getPoTodoTableColSpan("pendingSend"), 9);
});

test("awaiting PO and invoiced tabs keep the PO number column", () => {
  assert.equal(shouldShowPoNumberColumn("awaitingPo"), true);
  assert.equal(getPoTodoTableColSpan("awaitingPo"), 10);
});

test("PO number input keeps digits only", () => {
  assert.equal(normalizePoNumberInput("PO-123 45"), "12345");
  assert.equal(normalizePoNumberInput("abc"), "");
});

test("invoiced tab hides workflow action columns", () => {
  assert.equal(shouldShowXeroColumn("invoiced"), false);
  assert.equal(shouldShowPoDraftColumn("invoiced"), false);
  assert.equal(shouldShowSentColumn("invoiced"), false);
  assert.equal(shouldShowPoNumberColumn("invoiced"), false);
  assert.equal(getPoTodoTableColSpan("invoiced"), 8);
});

test("PO TODO page cache is keyed by tab and page", () => {
  assert.equal(getPoTodoPageCacheKey("awaitingPo", 3), "awaitingPo:3");
});

test("PO TODO page cache expires after the freshness window", () => {
  assert.equal(isPoTodoPageCacheFresh(1000, 1000 + PO_TODO_PAGE_CACHE_TTL_MS - 1), true);
  assert.equal(isPoTodoPageCacheFresh(1000, 1000 + PO_TODO_PAGE_CACHE_TTL_MS + 1), false);
});

test("PO TODO page cache stays fresh for thirty minutes", () => {
  assert.equal(PO_TODO_PAGE_CACHE_TTL_MS, 30 * 60 * 1000);
});

test("PO TODO cache invalidation removes affected job pages and tabs", () => {
  const cache = {
    "pendingSend:1": {
      rows: [{ jobId: 11 }],
      total: 1,
      totalPages: 1,
      currentPage: 1,
      cachedAt: 1000,
    },
    "awaitingPo:1": {
      rows: [{ jobId: 22 }],
      total: 1,
      totalPages: 1,
      currentPage: 1,
      cachedAt: 1000,
    },
    "invoiced:1": {
      rows: [{ jobId: 33 }],
      total: 1,
      totalPages: 1,
      currentPage: 1,
      cachedAt: 1000,
    },
  };

  const next = invalidatePoTodoPageCache(cache, [11], ["awaitingPo"]);

  assert.equal(next["pendingSend:1"], undefined);
  assert.equal(next["awaitingPo:1"], undefined);
  assert.equal(next["invoiced:1"]?.rows[0]?.jobId, 33);
});
