import assert from "node:assert/strict";
import test from "node:test";
import { getPartFlowContactHref } from "./partFlowContactActions";

test("getPartFlowContactHref builds tel links with whitespace removed", () => {
  assert.equal(getPartFlowContactHref("tel", " +64 21 123 4567 "), "tel:+64211234567");
});

test("getPartFlowContactHref opens trimmed email addresses in Gmail compose", () => {
  assert.equal(
    getPartFlowContactHref("mailto", " customer@example.com "),
    "https://mail.google.com/mail/?view=cm&fs=1&to=customer%40example.com",
  );
});

test("getPartFlowContactHref returns null for blank contact values", () => {
  assert.equal(getPartFlowContactHref("tel", "   "), null);
  assert.equal(getPartFlowContactHref("mailto", ""), null);
});
