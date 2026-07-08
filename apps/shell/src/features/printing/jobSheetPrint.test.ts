/// <reference types="node" />

import test from "node:test";
import assert from "node:assert/strict";
import { getPrintFrameStyle } from "./jobSheetPrint";

test("hidden print frame remains invisible for normal job sheets", () => {
  assert.deepEqual(getPrintFrameStyle("hidden"), {
    position: "fixed",
    right: "0",
    bottom: "0",
    width: "0",
    height: "0",
    border: "0",
    opacity: "0",
  });
});

test("visible print frame is large enough to expose WOF debug controls", () => {
  assert.deepEqual(getPrintFrameStyle("visible"), {
    position: "fixed",
    right: "20px",
    bottom: "20px",
    width: "min(960px, calc(100vw - 40px))",
    height: "calc(100vh - 40px)",
    border: "1px solid #cbd5e1",
    opacity: "1",
    zIndex: "2147483647",
    background: "#ffffff",
    boxShadow: "0 20px 50px rgba(15, 23, 42, 0.22)",
  });
});
