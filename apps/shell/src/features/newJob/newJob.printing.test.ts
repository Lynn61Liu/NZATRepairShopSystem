/// <reference types="node" />

import test from "node:test";
import assert from "node:assert/strict";
import {
  getSaveAndPrintTypes,
  printSavedJobSheets,
  resolveSaveAndPrintRouteKey,
} from "./newJob.printing";

test("save and print ignores wof and preserves mech/paint selection", () => {
  assert.deepEqual(getSaveAndPrintTypes(["wof", "mech", "paint"]), ["mech", "paint"]);
});

test("save and print returns only mech when paint is not selected", () => {
  assert.deepEqual(getSaveAndPrintTypes(["wof", "mech"]), ["mech"]);
});

test("save and print returns only paint when mech is not selected", () => {
  assert.deepEqual(getSaveAndPrintTypes(["wof", "paint"]), ["paint"]);
});

test("save and print returns empty array when only wof is selected", () => {
  assert.deepEqual(getSaveAndPrintTypes(["wof"]), []);
});

test("save and print routes mech jobs with wof selection to job-wof", () => {
  assert.equal(resolveSaveAndPrintRouteKey("mech", ["wof", "mech"]), "job-wof");
});

test("save and print routes mech jobs without wof selection to job-mech", () => {
  assert.equal(resolveSaveAndPrintRouteKey("mech", ["mech"]), "job-mech");
});

test("save and print routes paint jobs to job-pnp", () => {
  assert.equal(resolveSaveAndPrintRouteKey("paint", ["paint"]), "job-pnp");
});

test("save and print continues after one template fails", () => {
  const calls: Array<string> = [];
  const result = printSavedJobSheets({
    selectedServices: ["mech", "paint"],
    row: { plate: "ABC123" },
    notes: "notes",
    print(type, _row, _notes, routeKey) {
      calls.push(`${type}:${routeKey}`);
      if (type === "mech") {
        throw new Error("printer failed");
      }
    },
  });

  assert.deepEqual(calls, ["mech:job-mech", "paint:job-pnp"]);
  assert.equal(result.attempted, true);
  assert.equal(result.printedAny, true);
  assert.equal(result.failed, true);
  assert.deepEqual(result.failedTypes, ["mech"]);
});

test("save and print uses job-wof route when wof is selected", () => {
  const calls: Array<string> = [];
  printSavedJobSheets({
    selectedServices: ["wof", "mech"],
    row: { plate: "ABC123" },
    notes: "notes",
    print(type, _row, _notes, routeKey) {
      calls.push(`${type}:${routeKey}`);
    },
  });

  assert.deepEqual(calls, ["mech:job-wof"]);
});
