import assert from "node:assert/strict";
import test from "node:test";

import { shouldHidePaintBoardJob, shouldHidePaintTechBoardJob, type PaintBoardJob } from "./paintBoard.utils.ts";

const baseJob: PaintBoardJob = {
  id: "1001",
  createdAt: "2026-01-10T00:00:00.000Z",
  plate: "ABC123",
  status: "In Progress",
  currentStage: 1,
  wofStatus: null,
};

test("shouldHidePaintBoardJob hides archived jobs", () => {
  const job = {
    ...baseJob,
    status: "Archived",
  };

  assert.equal(shouldHidePaintBoardJob(job), true);
});

test("shouldHidePaintBoardJob hides waiting jobs when the job status is archived", () => {
  const job = {
    ...baseJob,
    status: "pending",
    jobStatus: "Archived",
    currentStage: -1,
  };

  assert.equal(shouldHidePaintBoardJob(job), true);
});

test("shouldHidePaintBoardJob keeps active paint jobs visible", () => {
  assert.equal(shouldHidePaintBoardJob(baseJob), false);
});

test("shouldHidePaintTechBoardJob keeps waiting jobs visible", () => {
  const job = {
    ...baseJob,
    status: "pending",
    currentStage: -1,
  };

  assert.equal(shouldHidePaintTechBoardJob(job), false);
});

test("shouldHidePaintTechBoardJob hides done paint jobs", () => {
  const job = {
    ...baseJob,
    status: "done",
    currentStage: 5,
  };

  assert.equal(shouldHidePaintTechBoardJob(job), true);
});

test("shouldHidePaintTechBoardJob keeps active tech-stage jobs visible", () => {
  assert.equal(shouldHidePaintTechBoardJob(baseJob), false);
});
