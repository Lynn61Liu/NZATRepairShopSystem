import assert from "node:assert/strict";
import test from "node:test";

import { shouldHidePaintBoardJob, type PaintBoardJob } from "./paintBoard.utils.ts";

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
