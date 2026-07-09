/// <reference types="node" />

import assert from "node:assert/strict";
import test from "node:test";

import { PO_UNREAD_SUMMARY_POLL_MS } from "./usePoUnreadSummary";

test("PO unread summary polls every five minutes by default", () => {
  assert.equal(PO_UNREAD_SUMMARY_POLL_MS, 5 * 60 * 1000);
});
