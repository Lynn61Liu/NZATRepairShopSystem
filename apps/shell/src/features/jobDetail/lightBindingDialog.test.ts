import assert from "node:assert/strict";
import test from "node:test";
import { selectCurrentLightBinding, shouldAutoCloseLightBindingDialog } from "./lightBindingDialog";

test("shouldAutoCloseLightBindingDialog returns true when open and binding is Bound", () => {
  assert.equal(shouldAutoCloseLightBindingDialog(true, "Bound"), true);
});

test("shouldAutoCloseLightBindingDialog returns false when binding is not Bound", () => {
  assert.equal(shouldAutoCloseLightBindingDialog(true, "PendingBind"), false);
  assert.equal(shouldAutoCloseLightBindingDialog(false, "Bound"), false);
});

test("selectCurrentLightBinding prefers Bound over PendingBind", () => {
  const pending = { id: 1, status: "PendingBind" };
  const bound = { id: 2, status: "Bound" };

  assert.equal(selectCurrentLightBinding([pending, bound]), bound);
});

test("selectCurrentLightBinding returns PendingBind when no Bound binding exists", () => {
  const failed = { id: 1, status: "BindFailed" };
  const pending = { id: 2, status: "PendingBind" };

  assert.equal(selectCurrentLightBinding([failed, pending]), pending);
});

test("selectCurrentLightBinding returns null when no usable binding exists", () => {
  assert.equal(selectCurrentLightBinding([{ id: 1, status: "BindFailed" }]), null);
  assert.equal(selectCurrentLightBinding([]), null);
});
