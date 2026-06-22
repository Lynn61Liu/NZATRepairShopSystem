/// <reference types="node" />

import test from "node:test";
import assert from "node:assert/strict";
import {
  resolveSilentPrintPrinterFamily,
  resolveSilentPrintRoute,
} from "./silentPrint.routes";

test("mech jobs route to HP", () => {
  assert.deepEqual(resolveSilentPrintRoute("job-mech"), {
    routeKey: "job-mech",
    printerFamily: "hp",
    printerName: "HP",
    templateKey: "mech",
  });
});

test("wof jobs share mech template but keep HP routing", () => {
  assert.deepEqual(resolveSilentPrintRoute("job-wof"), {
    routeKey: "job-wof",
    printerFamily: "hp",
    printerName: "HP",
    templateKey: "mech",
  });
});

test("pnp jobs route to HP", () => {
  assert.deepEqual(resolveSilentPrintRoute("job-pnp"), {
    routeKey: "job-pnp",
    printerFamily: "hp",
    printerName: "HP",
    templateKey: "pnp",
  });
});

test("wof record routes to EPSON LQ-730KII", () => {
  assert.deepEqual(resolveSilentPrintRoute("wof-record"), {
    routeKey: "wof-record",
    printerFamily: "epson",
    printerName: "EPSON LQ-730KII",
    templateKey: "wof-record",
  });
});

test("small tag routes to Brother", () => {
  assert.deepEqual(resolveSilentPrintRoute("small-tag"), {
    routeKey: "small-tag",
    printerFamily: "brother",
    printerName: "Brother QL-810W",
    templateKey: "small-tag",
  });
});

test("route printer family is stable", () => {
  assert.equal(resolveSilentPrintPrinterFamily("job-mech"), "hp");
  assert.equal(resolveSilentPrintPrinterFamily("job-wof"), "hp");
  assert.equal(resolveSilentPrintPrinterFamily("job-pnp"), "hp");
  assert.equal(resolveSilentPrintPrinterFamily("wof-record"), "epson");
  assert.equal(resolveSilentPrintPrinterFamily("small-tag"), "brother");
});
