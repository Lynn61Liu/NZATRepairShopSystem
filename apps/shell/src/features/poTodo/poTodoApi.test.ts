/// <reference types="node" />

import assert from "node:assert/strict";
import test from "node:test";

import { fetchPoTodo } from "./poTodoApi";

test("fetchPoTodo loads the requested PO TODO tab from the backend", async () => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    calls.push(String(input));
    return new Response(
      JSON.stringify({
        total: 1,
        items: [
          {
            jobId: 42,
            createdAt: "2026-07-09T10:00:00Z",
            code: "FLEET",
            plate: "ABC123",
            model: "2020 Toyota Hiace",
            notes: "Needs PO",
            reference: "PO Pending ABC123",
            xeroInvoiceId: "invoice-42",
            status: "draft",
            sentSource: null,
            detectedPoNumber: null,
            confirmedPoNumber: null,
            gmailDraftId: "draft-42",
            correlationId: "PO-42-XYZ",
          },
        ],
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  }) as typeof fetch;

  try {
    const result = await fetchPoTodo("pendingSend", 2, 15);

    assert.equal(calls.length, 1);
    assert.match(calls[0], /\/api\/po\/todo\?status=pendingSend&page=2&pageSize=15$/);
    assert.equal(result.total, 1);
    assert.equal(result.items[0]?.jobId, 42);
    assert.equal(result.items[0]?.plate, "ABC123");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fetchPoTodo loads the dashboard snapshot without query parameters", async () => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    calls.push(String(input));
    return new Response(JSON.stringify({ total: 0, items: [], currentPage: 1, pageSize: 500, totalPages: 1, lastGmailSyncedAt: "2026-07-13T10:32:00Z" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }) as typeof fetch;

  try {
    const result = await fetchPoTodo();

    assert.equal(calls.length, 1);
    assert.match(calls[0], /\/api\/po\/todo$/);
    assert.equal(result.lastGmailSyncedAt, "2026-07-13T10:32:00Z");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
