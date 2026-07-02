import assert from "node:assert/strict";
import test from "node:test";
import { shouldAutoCloseLightBindingDialog } from "./lightBindingDialog";

test("shouldAutoCloseLightBindingDialog returns true when open and binding is Bound", () => {
  assert.equal(shouldAutoCloseLightBindingDialog(true, "Bound"), true);
});

test("shouldAutoCloseLightBindingDialog returns false when binding is not Bound", () => {
  assert.equal(shouldAutoCloseLightBindingDialog(true, "PendingBind"), false);
  assert.equal(shouldAutoCloseLightBindingDialog(false, "Bound"), false);
});
