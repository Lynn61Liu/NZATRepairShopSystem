/// <reference types="node" />

import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCourtesyCarWarnings,
  fileToCourtesyCarAttachment,
  filterCourtesyCarsByStatus,
  getCourtesyCarTheme,
  getCourtesyCarCardSummary,
  getCourtesyCarLoanSummary,
  getCourtesyCarLookupStatusMessage,
  getCourtesyCarsGridClass,
  getCourtesyCarStatusToggleTarget,
  normalizeCourtesyCarDraft,
  transitionCourtesyCarStatus,
  validateCourtesyCarDraft,
} from "./courtesyCars.utils";

test("normalizeCourtesyCarDraft uppercases and strips the plate", () => {
  const draft = normalizeCourtesyCarDraft({
    plate: " lcz-123 ",
    make: "Toyota",
    model: "Corolla",
    status: "available",
    agreedValue: "22000",
  });

  assert.equal(draft.plate, "LCZ123");
  assert.equal(draft.make, "Toyota");
  assert.equal(draft.model, "Corolla");
  assert.equal(draft.agreedValue, 22000);
});

test("validateCourtesyCarDraft requires unavailable notes", () => {
  const result = validateCourtesyCarDraft({
    plate: "LCZ123",
    status: "unavailable",
    agreedValue: 22000,
  });

  assert.deepEqual(result.errors, {
    note: "Unavailable vehicles require a reason note.",
  });
});

test("transitionCourtesyCarStatus returns available after returned and keeps returnedAt", () => {
  const result = transitionCourtesyCarStatus(
    {
      id: "car-1",
      plate: "LCZ123",
      status: "on_loan",
      returnedAt: null,
    },
    "returned",
    { now: "2026-06-15T00:00:00.000Z" }
  );

  assert.equal(result.status, "available");
  assert.equal(result.returnedAt, "2026-06-15T00:00:00.000Z");
});

test("buildCourtesyCarWarnings marks records within one month as warning and expired as critical", () => {
  const warnings = buildCourtesyCarWarnings(
    {
      id: "car-1",
      plate: "LCZ123",
      status: "available",
      wofExpiry: "2026-07-10",
      regoExpiry: "2026-05-10",
    },
    { now: "2026-06-15T00:00:00.000Z" }
  );

  assert.deepEqual(warnings, [
    {
      key: "wof",
      label: "WOF expires in 25 days",
      level: "warning",
      daysRemaining: 25,
    },
    {
      key: "rego",
      label: "Rego expired",
      level: "critical",
      daysRemaining: -36,
    },
  ]);
});

test("filterCourtesyCarsByStatus returns the active tab rows", () => {
  const rows = [
    { id: "1", status: "available" as const },
    { id: "2", status: "on_loan" as const },
    { id: "3", status: "unavailable" as const },
  ];

  assert.deepEqual(filterCourtesyCarsByStatus(rows, "available").map((row) => row.id), ["1"]);
  assert.deepEqual(filterCourtesyCarsByStatus(rows, "on_loan").map((row) => row.id), ["2"]);
  assert.deepEqual(filterCourtesyCarsByStatus(rows, "all").map((row) => row.id), ["1", "2", "3"]);
});

test("fileToCourtesyCarAttachment turns image uploads into previewable data urls", async () => {
  const file = new File([new Uint8Array([1, 2, 3, 4])], "car-photo.png", { type: "image/png" });

  const attachment = await fileToCourtesyCarAttachment(file, { now: "2026-06-15T00:00:00.000Z", id: "att-1" });

  assert.equal(attachment.kind, "image");
  assert.equal(attachment.name, "car-photo.png");
  assert.match(attachment.dataUrl, /^data:image\/png;base64,/);
});

test("getCourtesyCarTheme is stable per plate and varies across the fleet", () => {
  const themeA1 = getCourtesyCarTheme("LCZ123");
  const themeA2 = getCourtesyCarTheme("LCZ123");
  const themeB = getCourtesyCarTheme("MKP456");

  assert.deepEqual(themeA1, themeA2);
  assert.notDeepEqual(themeA1, themeB);
  assert.match(themeA1.headerGradient, /^linear-gradient\(/);
});

test("getCourtesyCarCardSummary keeps the main vehicle identity concise", () => {
  const summary = getCourtesyCarCardSummary({
    year: 2021,
    make: "Toyota",
    model: "Corolla",
    color: "Silver",
  });

  assert.deepEqual(summary, {
    vehicleLabel: "2021 Toyota Corolla",
    colorLabel: "Silver",
  });
});

test("getCourtesyCarLoanSummary returns the active loan description only for on loan vehicles", () => {
  const summary = getCourtesyCarLoanSummary({
    status: "on_loan",
    loanedAt: "2026-06-12T08:30:00.000Z",
    borrowerName: "Alex Chen",
    borrowerPhone: "021 123 456",
    currentAgreement: null,
  });

  assert.deepEqual(summary, {
    agreementLabel: null,
    loanedAtLabel: "12 Jun 2026",
    borrowerNameLabel: "Alex Chen",
    borrowerPhoneLabel: "021 123 456",
  });
  assert.equal(
    getCourtesyCarLoanSummary({
      status: "available",
      loanedAt: "2026-06-12T08:30:00.000Z",
      borrowerName: "Alex Chen",
      borrowerPhone: "021 123 456",
      currentAgreement: null,
    }),
    null
  );
});

test("getCourtesyCarLoanSummary prefers current agreement contact details when available", () => {
  const summary = getCourtesyCarLoanSummary({
    status: "on_loan",
    loanedAt: "2026-06-12T08:30:00.000Z",
    borrowerName: "Alex Chen",
    borrowerPhone: "021 123 456",
    currentAgreement: {
      agreementId: 7001,
      jobId: 1001,
      status: "draft",
      currentStep: "contact",
      jobVehiclePlate: "ABC123",
      jobCustomerName: "Jane Smith",
      jobCustomerPhone: "021 555 0101",
      contactName: "Jane Smith",
      contactPhone: "021 555 0101",
    },
  });

  assert.deepEqual(summary, {
    agreementLabel: "Agreement #7001 · Job 1001",
    loanedAtLabel: "12 Jun 2026",
    borrowerNameLabel: "Jane Smith",
    borrowerPhoneLabel: "021 555 0101",
  });
});

test("getCourtesyCarLookupStatusMessage distinguishes complete and partial lookups", () => {
  assert.deepEqual(
    getCourtesyCarLookupStatusMessage({
      make: "Toyota",
      model: "Corolla",
      color: "Silver",
      wofExpiry: "2026-08-01",
      regoExpiry: "2026-09-11",
    }),
    {
      tone: "success",
      message: "后端抓取完成，车辆核心资料已回填到表单。",
    }
  );

  assert.deepEqual(
    getCourtesyCarLookupStatusMessage({
      make: "Toyota",
      model: "Corolla",
      color: "",
      wofExpiry: "2026-08-01",
      regoExpiry: "",
    }),
    {
      tone: "warning",
      message: "后端已返回部分资料，颜色、Rego 还需要手动补齐。",
    }
  );
});

test("getCourtesyCarStatusToggleTarget uses badge click as a quick available/on loan switch", () => {
  assert.equal(getCourtesyCarStatusToggleTarget("available"), "on_loan");
  assert.equal(getCourtesyCarStatusToggleTarget("on_loan"), "available");
  assert.equal(getCourtesyCarStatusToggleTarget("unavailable"), "available");
});

test("getCourtesyCarsGridClass keeps three columns on wide screens", () => {
  const className = getCourtesyCarsGridClass();

  assert.match(className, /xl:grid-cols-3/);
  assert.match(className, /gap-4/);
});
