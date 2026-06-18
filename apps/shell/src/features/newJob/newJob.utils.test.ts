/// <reference types="node" />

import test from "node:test";
import assert from "node:assert/strict";
import { extractVehicleInfo } from "./newJob.utils";

test("extractVehicleInfo maps WOF and rego expiry fields from lookup payloads", () => {
  const info = extractVehicleInfo({
    vehicle: {
      make: "Toyota",
      model: "Corolla",
      year: 2021,
      colour: "Silver",
      wofExpiry: "2026-08-01",
      regoExpiry: "2026-09-11",
    },
  });

  assert.equal(info.model, "Toyota Corolla");
  assert.equal(info.year, "2021");
  assert.equal(info.color, "Silver");
  assert.equal(info.wofExpiry, "2026-08-01");
  assert.equal(info.regoExpiry, "2026-09-11");
});
