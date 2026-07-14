/// <reference types="node" />

import assert from "node:assert/strict";
import test from "node:test";

import { createConfirmingPoSteps, getConfirmPoErrorMessage, resolveConfirmPoSteps } from "./confirmPoDialogState";
import {
  getPoTodoTableColSpan,
  normalizePoNumberInput,
  shouldShowCompletionActionColumn,
  shouldShowPoDraftColumn,
  shouldShowPoNumberColumn,
  shouldShowSentColumn,
  shouldShowXeroColumn,
} from "./poDashboardPreviewPage.utils";

test("pending send tab hides the PO number column", () => {
  assert.equal(shouldShowPoNumberColumn("pendingSend"), false);
  assert.equal(shouldShowCompletionActionColumn("pendingSend"), true);
  assert.equal(getPoTodoTableColSpan("pendingSend"), 10);
});

test("awaiting PO tab keeps the PO number column", () => {
  assert.equal(shouldShowPoNumberColumn("awaitingPo"), true);
  assert.equal(shouldShowCompletionActionColumn("awaitingPo"), true);
  assert.equal(getPoTodoTableColSpan("awaitingPo"), 11);
});

test("PO number input keeps digits only", () => {
  assert.equal(normalizePoNumberInput("PO-123 45"), "12345");
  assert.equal(normalizePoNumberInput("abc"), "");
});

test("confirm PO dialog starts with Xero in progress and later steps pending", () => {
  const steps = createConfirmingPoSteps();

  assert.deepEqual(
    steps.map((step) => [step.label, step.status]),
    [
      ["更新 Xero 中", "in_progress"],
      ["更新 Xero 状态", "pending"],
      ["添加 Gmail Label", "pending"],
      ["保存 PO Number", "pending"],
      ["更新 PO 状态", "pending"],
    ]
  );
});

test("confirm PO dialog resolves backend step status in workflow order", () => {
  const steps = resolveConfirmPoSteps(
    {
      savePo: { status: "pending", message: "Waiting to save PO." },
      xero: { status: "success", message: "Xero reference updated." },
      xeroStatus: { status: "success", message: "Xero invoice updated to Waiting Payment." },
      gmail: { status: "running", message: "Adding Gmail label." },
      poState: { status: "pending", message: "Waiting to update PO state." },
    },
    false
  );

  assert.deepEqual(
    steps.map((step) => [step.label, step.status]),
    [
      ["更新 Xero 中", "success"],
      ["更新 Xero 状态", "success"],
      ["添加 Gmail Label", "in_progress"],
      ["保存 PO Number", "pending"],
      ["更新 PO 状态", "pending"],
    ]
  );
});

test("confirm PO dialog surfaces the failed step message", () => {
  assert.equal(
    getConfirmPoErrorMessage({
      xero: { status: "success", message: "Xero reference updated." },
      gmail: { status: "failed", message: "Gmail thread or message was not found." },
    }),
    "Gmail thread or message was not found."
  );
});

test("invoiced tab hides workflow action columns", () => {
  assert.equal(shouldShowXeroColumn("invoiced"), false);
  assert.equal(shouldShowPoDraftColumn("invoiced"), false);
  assert.equal(shouldShowSentColumn("invoiced"), false);
  assert.equal(shouldShowPoNumberColumn("invoiced"), false);
  assert.equal(shouldShowCompletionActionColumn("invoiced"), false);
  assert.equal(getPoTodoTableColSpan("invoiced"), 8);
});
