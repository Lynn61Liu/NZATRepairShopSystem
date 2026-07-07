/// <reference types="node" />

import assert from "node:assert/strict";
import test from "node:test";

import { JOB_TABLE_COLUMNS, JOB_TABLE_DETAIL_ITEMS } from "./jobsTableLayout";

test("job table primary row keeps high-signal fields in the first row", () => {
  assert.deepEqual(
    JOB_TABLE_COLUMNS.map((column) => column.key),
    ["createdAt", "inShop", "status", "tag", "code", "plate", "model", "actions"]
  );
});

test("job table detail row shows notes and service statuses in the second row", () => {
  assert.deepEqual(
    JOB_TABLE_DETAIL_ITEMS.map((item) => item.key),
    ["note", "wof", "mech", "paint"]
  );
});
