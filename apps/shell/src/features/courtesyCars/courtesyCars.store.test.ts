/// <reference types="node" />

import test from "node:test";
import assert from "node:assert/strict";
import { createCourtesyCarFromEditor, createSeedCourtesyCars, deleteCourtesyCar, setCourtesyCarStatus } from "./courtesyCars.store";

test("createSeedCourtesyCars returns five vehicles for the dashboard", () => {
  const rows = createSeedCourtesyCars();

  assert.equal(rows.length, 5);
  assert.equal(rows[0].plate, "LCZ123");
});

test("createCourtesyCarFromEditor preserves attachments and normalizes plate", () => {
  const attachment = {
    id: "att-1",
    kind: "image" as const,
    name: "photo.png",
    mimeType: "image/png",
    size: 12,
    dataUrl: "data:image/png;base64,AA==",
    createdAt: "2026-06-15T00:00:00.000Z",
  };

  const car = createCourtesyCarFromEditor({
    plate: " lcz-123 ",
    make: "Toyota",
    model: "Corolla",
    color: "Silver",
    year: "2021",
    mileage: "48210",
    fuelLevel: "Half tank",
    agreedValue: "22000",
    status: "available",
    note: "",
    wofExpiry: "2026-07-10",
    regoExpiry: "2026-07-06",
    loanedAt: "2026-06-10T00:00:00.000Z",
    borrowerName: "Alex Chen",
    borrowerPhone: "021 123 456",
    attachments: [attachment],
  });

  assert.equal(car.plate, "LCZ123");
  assert.equal(car.agreedValue, 22000);
  assert.deepEqual(car.attachments, [attachment]);
  assert.equal(car.loanedAt, "2026-06-10T00:00:00.000Z");
  assert.equal(car.borrowerName, "Alex Chen");
  assert.equal(car.borrowerPhone, "021 123 456");
});

test("setCourtesyCarStatus keeps returnedAt when reactivating a vehicle", () => {
  const car = setCourtesyCarStatus(
    {
      id: "car-1",
      plate: "LCZ123",
      make: "Toyota",
      model: "Corolla",
      color: "Silver",
      agreedValue: 22000,
      status: "unavailable",
      returnedAt: "2026-06-10T00:00:00.000Z",
      createdAt: "2026-06-15T00:00:00.000Z",
      updatedAt: "2026-06-15T00:00:00.000Z",
      attachments: [],
    },
    "available",
    { now: "2026-06-15T00:00:00.000Z" }
  );

  assert.equal(car.status, "available");
  assert.equal(car.returnedAt, "2026-06-10T00:00:00.000Z");
});

test("deleteCourtesyCar removes a car from the fleet", () => {
  const rows = createSeedCourtesyCars();
  const nextRows = deleteCourtesyCar(rows, rows[0].id);

  assert.equal(nextRows.length, 4);
  assert.equal(nextRows.some((car) => car.id === rows[0].id), false);
});
