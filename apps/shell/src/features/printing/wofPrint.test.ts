/// <reference types="node" />

import test from "node:test";
import assert from "node:assert/strict";
import { buildWofHtml, type WofPrintData } from "./wofPrint";

const sampleWofData: WofPrintData = {
  jobId: "J123",
  recordId: "R123",
  recordStateLabel: "Pass",
  rego: "ABC123",
  makeModel: "Toyota Aqua",
  nzFirstRegistration: "2020-01-02",
  vin: "VIN123",
  odoText: "12345 km",
  organisationName: "NZ Auto Tech",
  customerName: "Test Customer",
  customerPhone: "021000000",
  customerEmail: "test@example.com",
  customerAddress: "1 Test Street",
  inspectionDate: "2026-01-01",
  inspectionNumber: "I123",
  recheckDate: "",
  recheckNumber: "",
  recheckOdo: "",
  isNewWof: true,
  newWofDate: "2027-01-01",
  authCode: "AUTH123",
  checkSheet: "CS",
  csNo: "CS123",
  wofLabel: "WOF123",
  labelNo: "L123",
  msNumber: "MS123",
  failReasons: "",
  previousExpiryDate: "2026-01-01",
  failRecheckDate: "",
  note: "",
  placeholderDash: "-",
  placeholderCheck: "p",
  placeholderMs: "MS",
  placeholderCode: "CODE",
};

test("WOF debug reference grid uses 5cm by 1cm cells", () => {
  const html = buildWofHtml(sampleWofData);

  assert.match(html, /--wof-reference-grid-width:\s*50mm;/);
  assert.match(html, /--wof-reference-grid-height:\s*10mm;/);
  assert.match(html, /--wof-reference-grid-color:\s*rgba\(239,\s*68,\s*68,\s*0\.55\);/);
  assert.match(html, /--wof-reference-corner-color:\s*rgba\(220,\s*38,\s*38,\s*0\.9\);/);
  assert.match(html, /linear-gradient\(to right,\s*var\(--wof-reference-grid-color\)\s+1px,\s*transparent\s+1px\)/);
  assert.match(html, /border-color:\s*var\(--wof-reference-corner-color\);/);
  assert.match(html, /background-size:\s*var\(--wof-reference-grid-width\)\s+var\(--wof-reference-grid-height\);/);
});

test("WOF reference grid is hidden normally but remains printable in debug mode", () => {
  const html = buildWofHtml(sampleWofData);

  assert.match(html, /\.reference-layer\s*{\s*display:\s*none;/);
  assert.match(html, /\.debug \.reference-layer\s*{\s*display:\s*block;/);
  assert.match(html, /@media print[\s\S]*?\.debug \.reference-layer\s*{\s*display:\s*block;/);
});
