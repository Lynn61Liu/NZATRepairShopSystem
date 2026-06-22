/// <reference types="node" />

import test from "node:test";
import assert from "node:assert/strict";
import {
  getSilentPrintRouteUnavailableMessage,
  isSilentPrintRouteAvailable,
} from "./silentPrint.availability";

test("hp routes stay available without explicit queue config", () => {
  assert.equal(isSilentPrintRouteAvailable("job-pnp", {}), true);
  assert.equal(getSilentPrintRouteUnavailableMessage("job-pnp", {}), null);
});

test("epson routes are disabled without queue config", () => {
  assert.equal(isSilentPrintRouteAvailable("wof-record", {}), false);
  assert.equal(getSilentPrintRouteUnavailableMessage("wof-record", {}), "当前电脑未配置 EPSON LQ-730KII 打印机，请先设置 VITE_SILENT_PRINT_QUEUE_EPSON。");
});

test("epson routes are enabled once queue config is present", () => {
  assert.equal(
    isSilentPrintRouteAvailable("wof-record", {
      VITE_SILENT_PRINT_QUEUE_EPSON: "Epson_TM_T88V",
    }),
    true
  );
  assert.equal(
    getSilentPrintRouteUnavailableMessage("wof-record", {
      VITE_SILENT_PRINT_QUEUE_EPSON: "Epson_TM_T88V",
    }),
    null
  );
});

test("small tag routes are disabled without Brother queue config", () => {
  assert.equal(isSilentPrintRouteAvailable("small-tag", {}), false);
  assert.equal(
    getSilentPrintRouteUnavailableMessage("small-tag", {}),
    "当前电脑未配置 Brother QL-810W 打印机，请先设置 VITE_SILENT_PRINT_QUEUE_BROTHER。"
  );
});
