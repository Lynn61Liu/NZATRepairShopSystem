/// <reference types="node" />

import test from "node:test";
import assert from "node:assert/strict";
import { wrapHtmlWithBaseUrl } from "./silentPrint.api";

test("wrapHtmlWithBaseUrl injects a base tag before </head>", () => {
  const html = "<!doctype html><html><head><title>x</title></head><body></body></html>";
  const wrapped = wrapHtmlWithBaseUrl(html, "http://localhost:5173/");

  assert.match(wrapped, /<base href="http:\/\/localhost:5173\/">/);
  assert.ok(wrapped.indexOf("<base") < wrapped.indexOf("</head>"));
});

test("wrapHtmlWithBaseUrl leaves html alone when base already exists", () => {
  const html = "<!doctype html><html><head><base href=\"http://example.com/\"></head><body></body></html>";
  const wrapped = wrapHtmlWithBaseUrl(html, "http://localhost:5173/");

  assert.equal(wrapped, html);
});
