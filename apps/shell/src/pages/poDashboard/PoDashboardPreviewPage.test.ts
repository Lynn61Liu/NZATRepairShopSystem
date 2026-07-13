/// <reference types="node" />

import assert from "node:assert/strict";
import test from "node:test";

import {
  getPoTodoTableColSpan,
  normalizePoNumberInput,
  shouldShowPoDraftColumn,
  shouldShowPoNumberColumn,
  shouldShowSentColumn,
  shouldShowXeroColumn,
} from "./poDashboardPreviewPage.utils";

test("pending send tab hides the PO number column", () => {
  assert.equal(shouldShowPoNumberColumn("pendingSend"), false);
  assert.equal(getPoTodoTableColSpan("pendingSend"), 9);
});

test("awaiting PO tab keeps the PO number column", () => {
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
