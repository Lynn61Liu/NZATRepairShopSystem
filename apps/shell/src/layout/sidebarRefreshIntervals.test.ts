/// <reference types="node" />

import assert from "node:assert/strict";
import test from "node:test";

import { WOF_SIDEBAR_REFRESH_MS } from "./sidebarRefreshIntervals";

test("WOF sidebar count refreshes every five minutes", () => {
  assert.equal(WOF_SIDEBAR_REFRESH_MS, 5 * 60 * 1000);
});
