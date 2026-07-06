/// <reference types="node" />

import assert from "node:assert/strict";
import test from "node:test";

import { notifyPartsFlowRefresh, subscribePartsFlowRefresh } from "./refreshSignals";

test("parts-flow refresh signal notifies current and storage listeners", () => {
  const originalWindow = globalThis.window;
  const originalLocalStorage = globalThis.localStorage;
  const target = new EventTarget();
  const values = new Map<string, string>();

  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      addEventListener: target.addEventListener.bind(target),
      removeEventListener: target.removeEventListener.bind(target),
      dispatchEvent: target.dispatchEvent.bind(target),
    },
  });
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: {
      setItem(key: string, value: string) {
        values.set(key, value);
      },
    },
  });

  try {
    let calls = 0;
    const unsubscribe = subscribePartsFlowRefresh(() => {
      calls += 1;
    });

    notifyPartsFlowRefresh();
    target.dispatchEvent(Object.assign(new Event("storage"), { key: "parts-flow:refresh" }));
    unsubscribe();
    notifyPartsFlowRefresh();

    assert.equal(calls, 2);
    assert.equal(values.has("parts-flow:refresh"), true);
  } finally {
    Object.defineProperty(globalThis, "window", { configurable: true, value: originalWindow });
    Object.defineProperty(globalThis, "localStorage", { configurable: true, value: originalLocalStorage });
  }
});
