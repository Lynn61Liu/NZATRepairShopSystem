import assert from "node:assert/strict";
import test from "node:test";
import { getGmailPlateSearchUrl } from "./gmailSearch";

test("getGmailPlateSearchUrl builds a Gmail search link for a plate", () => {
  assert.equal(
    getGmailPlateSearchUrl(" RBT429 "),
    "https://mail.google.com/mail/u/0/?tab=rm&ogbl#search/RBT429",
  );
});

test("getGmailPlateSearchUrl safely encodes the search text", () => {
  assert.equal(
    getGmailPlateSearchUrl("ABC 123"),
    "https://mail.google.com/mail/u/0/?tab=rm&ogbl#search/ABC%20123",
  );
  assert.equal(getGmailPlateSearchUrl("  "), "");
});
