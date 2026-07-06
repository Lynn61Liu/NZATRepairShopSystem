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
      notes: "",
      address: "",
      requiresQuote: true,
    },
    matchedCustomerId: "",
    customerEdited: false,
  });

  assert.equal(payload.requiresQuote, true);
  assert.equal(payload.quoteEmail, " quote@example.com ");
  assert.equal(payload.email, " quote@example.com ");
});
