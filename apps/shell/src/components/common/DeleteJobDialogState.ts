export type DeleteJobUiStatus = "pending" | "in_progress" | "success" | "failed";

export type DeleteJobApiStepResult = {
  status?: string;
  message?: string;
};

export type DeleteJobApiSteps = {
  xero?: DeleteJobApiStepResult;
  gmail?: DeleteJobApiStepResult;
  jobStep?: DeleteJobApiStepResult;
};

export type DeleteJobDialogStep = {
  status: DeleteJobUiStatus;
  message: string;
};

export type DeleteJobDialogSteps = {
  xero: DeleteJobDialogStep;
  gmail: DeleteJobDialogStep;
  job: DeleteJobDialogStep;
};

export function createInitialDeleteJobSteps(): DeleteJobDialogSteps {
  return {
    xero: {
      status: "pending",
      message: "Waiting to start deleting the Xero draft.",
    },
    gmail: {
      status: "pending",
      message: "Waiting to start deleting the Gmail message.",
    },
    job: {
      status: "pending",
      message: "Waiting to start deleting the local job.",
    },
  };
}

export function createDeletingDeleteJobSteps(): DeleteJobDialogSteps {
  return {
    xero: {
      status: "in_progress",
      message: "Deleting the Xero draft.",
    },
    gmail: {
      status: "pending",
      message: "Waiting to delete the Gmail message.",
    },
    job: {
      status: "pending",
      message: "Waiting to delete the local job.",
    },
  };
}

export function resolveDeleteJobDialogSteps(
  steps: DeleteJobApiSteps | undefined,
  success: boolean
): DeleteJobDialogSteps {
  const xeroStatus = normalizeDeleteStepStatus(steps?.xero?.status, success ? "success" : "failed");
  const jobStatus = normalizeDeleteStepStatus(
    steps?.jobStep?.status,
    success ? "success" : xeroStatus === "failed" ? "pending" : "failed"
  );
  const gmailStatus = normalizeDeleteStepStatus(
    steps?.gmail?.status,
    success ? "success" : xeroStatus === "failed" ? "pending" : jobStatus === "failed" ? "failed" : "pending"
  );

  return {
    xero: {
      status: xeroStatus,
      message: steps?.xero?.message || defaultDeleteMessage("xero", xeroStatus),
    },
    gmail: {
      status: gmailStatus,
      message: steps?.gmail?.message || defaultDeleteMessage("gmail", gmailStatus),
    },
    job: {
      status: jobStatus,
      message: steps?.jobStep?.message || defaultDeleteMessage("job", jobStatus),
    },
  };
}

function normalizeDeleteStepStatus(
  value: string | undefined,
  fallback: DeleteJobUiStatus
): DeleteJobUiStatus {
  if (value === "success" || value === "failed" || value === "pending" || value === "in_progress") {
    return value;
  }

  return fallback;
}

function defaultDeleteMessage(target: "xero" | "gmail" | "job", status: DeleteJobUiStatus) {
  if (target === "xero") {
    if (status === "success") return "Xero draft deleted.";
    if (status === "failed") return "Failed to delete the Xero draft.";
    if (status === "in_progress") return "Deleting the Xero draft.";
    return "Waiting to delete the Xero draft.";
  }

  if (target === "gmail") {
    if (status === "success") return "Gmail message deleted.";
    if (status === "failed") return "Failed to delete the Gmail message.";
    if (status === "in_progress") return "Deleting the Gmail message.";
    return "Waiting to delete the Gmail message.";
  }

  if (status === "success") return "Local job deleted.";
  if (status === "failed") return "Failed to delete the local job.";
  if (status === "in_progress") return "Deleting the local job.";
  return "Waiting to delete the local job.";
}
