import test from "node:test";
import assert from "node:assert/strict";
import { getCanvasPointFromPointer } from "./signaturePadPointer";

test("getCanvasPointFromPointer uses viewport coordinates instead of event offsets", () => {
  const touchPointer = {
    clientX: 142,
    clientY: 88,
    offsetX: 0,
    offsetY: 0,
  };

  const point = getCanvasPointFromPointer(
    touchPointer,
    {
      left: 42,
      top: 18,
    }
  );

  assert.deepEqual(point, { x: 100, y: 70 });
});
