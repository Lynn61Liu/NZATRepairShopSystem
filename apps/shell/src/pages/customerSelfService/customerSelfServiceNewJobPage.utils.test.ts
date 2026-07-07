import assert from "node:assert/strict";
import test from "node:test";

import { buildSelfServiceJobPayload, getCustomerSelfServiceSteps } from "./customerSelfServiceNewJobPage.utils";

test("getCustomerSelfServiceSteps adds quote between contact and review for repair jobs", () => {
  assert.deepEqual(getCustomerSelfServiceSteps({ hasWof: false }), [
    { id: "plate", label: "Plate" },
    { id: "contact", label: "Contact" },
    { id: "quote", label: "Quote" },
    { id: "review", label: "Review" },
  ]);
});

test("buildSelfServiceJobPayload includes repair quote choice and optional email", () => {
  const payload = buildSelfServiceJobPayload({
    form: {
      plate: "ABC123",
      hasWof: false,
      name: "Jane Smith",
      phone: "021 123 4567",
      email: "",
      quoteEmail: " quote@example.com ",
      quotePartsContent: " front bumper ",
      notes: "",
      address: "",
      requiresQuote: true,
    },
    matchedCustomerId: "",
    customerEdited: false,
  });

  assert.equal(payload.requiresQuote, true);
  assert.equal(payload.quoteEmail, " quote@example.com ");
  assert.equal(payload.quotePartsContent, " front bumper ");
  assert.equal(payload.email, " quote@example.com ");
});

test("buildSelfServiceJobPayload omits quote email when repair quote is not selected", () => {
  const payload = buildSelfServiceJobPayload({
    form: {
      plate: "ABC123",
      hasWof: false,
      name: "Jane Smith",
      phone: "021 123 4567",
      email: "",
      quoteEmail: " quote@example.com ",
      quotePartsContent: " front bumper ",
      notes: "",
      address: "",
      requiresQuote: false,
    },
    matchedCustomerId: "",
    customerEdited: false,
  });

  assert.equal(payload.requiresQuote, false);
  assert.equal(payload.quoteEmail, undefined);
  assert.equal(payload.quotePartsContent, undefined);
  assert.equal(payload.email, "");
});
