import test from "node:test";
import assert from "node:assert/strict";
import { getSubmitErrorMessage } from "./submitErrorMessage";

test("getSubmitErrorMessage returns the backend error verbatim", () => {
  assert.equal(getSubmitErrorMessage("Customer email is required to send the PDF."), "Customer email is required to send the PDF.");
});

test("getSubmitErrorMessage returns null for blank input", () => {
  assert.equal(getSubmitErrorMessage(""), null);
  assert.equal(getSubmitErrorMessage("   "), null);
  assert.equal(getSubmitErrorMessage(undefined), null);
});
