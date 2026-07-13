import assert from "node:assert/strict";
import test from "node:test";
import { getNapaRegoUrl, getPartmasterRegoUrl } from "./vehicleQuickLinkUrls";

test("vehicle supplier URLs include an encoded registration", () => {
  assert.equal(
    getNapaRegoUrl(" RBT 429 "),
    "https://www.napaprolink.co.nz/Portal/Catalogue/Catalogue.aspx?rego=RBT%20429",
  );
  assert.equal(
    getPartmasterRegoUrl("RBT429"),
    "https://partmaster.kiwi/PM_UI_Search_Master/RegNo.aspx?regNo=RBT429",
  );
});
