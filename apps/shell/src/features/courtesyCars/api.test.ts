/// <reference types="node" />

import test from "node:test";
import assert from "node:assert/strict";
import { fetchCourtesyCars } from "./api";

test("fetchCourtesyCars loads vehicles from the backend vehicles endpoint", async () => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    calls.push(String(input));
    return new Response(
      JSON.stringify({
        items: [
          {
            id: 11,
            plate: "LCZ123",
            make: "Toyota",
            model: "Corolla",
            color: "Silver",
            agreedVehicleValue: 22000,
            status: "available",
            attachments: [],
            createdAt: "2026-06-15T00:00:00.000Z",
            updatedAt: "2026-06-15T00:00:00.000Z",
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
    const items = await fetchCourtesyCars();

    assert.equal(calls.length, 1);
    assert.match(calls[0], /\/api\/courtesy-cars\/vehicles$/);
    assert.equal(items[0].id, "11");
    assert.equal(items[0].plate, "LCZ123");
    assert.equal(items[0].borrowerName, "");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
