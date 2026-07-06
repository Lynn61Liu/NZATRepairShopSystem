import assert from "node:assert/strict";
import test from "node:test";

import { getPoRequestSnapshotTotal } from "./poDashboard.utils";
import type { PoPanelModel } from "../../hooks/useInvoiceDashboardState";

test("getPoRequestSnapshotTotal uses the Xero subtotal for the PO request amount", () => {
  const model = {
    subtotal: 100,
    totalAmount: 115,
  } as PoPanelModel;

  assert.equal(getPoRequestSnapshotTotal(model), 100);
});
