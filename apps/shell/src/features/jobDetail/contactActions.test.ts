import assert from "node:assert/strict";
import test from "node:test";
import { getCustomerContactHref } from "./contactActions";

test("getCustomerContactHref builds tel and sms links with whitespace removed", () => {
  assert.equal(getCustomerContactHref("tel", " +64 21 123 4567 "), "tel:+64211234567");
  assert.equal(getCustomerContactHref("sms", " +64 21 123 4567 "), "sms:+64211234567");
});

test("getCustomerContactHref opens trimmed email addresses in Gmail compose", () => {
  assert.equal(
    getCustomerContactHref("email", " customer@example.com "),
    "https://mail.google.com/mail/?view=cm&fs=1&to=customer%40example.com",
  );
});

test("getCustomerContactHref returns null for blank contact values", () => {
  assert.equal(getCustomerContactHref("tel", "   "), null);
  assert.equal(getCustomerContactHref("sms", ""), null);
  assert.equal(getCustomerContactHref("email", ""), null);
});
