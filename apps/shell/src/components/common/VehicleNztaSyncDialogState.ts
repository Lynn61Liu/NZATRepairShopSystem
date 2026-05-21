export type VehicleNztaSyncUiStatus = "pending" | "in_progress" | "success" | "failed";

export type VehicleNztaSyncApiStepResult = {
  status?: string;
  message?: string;
};

export type VehicleNztaSyncApiSteps = {
  lookup?: VehicleNztaSyncApiStepResult;
  parse?: VehicleNztaSyncApiStepResult;
  save?: VehicleNztaSyncApiStepResult;
};

export type VehicleNztaSyncDialogStep = {
  status: VehicleNztaSyncUiStatus;
  message: string;
};

export type VehicleNztaSyncDialogSteps = {
  lookup: VehicleNztaSyncDialogStep;
  parse: VehicleNztaSyncDialogStep;
  save: VehicleNztaSyncDialogStep;
};

export function createInitialVehicleNztaSyncSteps(): VehicleNztaSyncDialogSteps {
  return {
    lookup: {
      status: "pending",
      message: "Waiting to start the NZTA lookup.",
    },
    parse: {
      status: "pending",
      message: "Waiting to parse the NZTA response.",
    },
    save: {
      status: "pending",
      message: "Waiting to save vehicle details.",
    },
  };
}

export function createSyncingVehicleNztaSyncSteps(): VehicleNztaSyncDialogSteps {
  return {
    lookup: {
      status: "in_progress",
      message: "Querying NZTA for vehicle expiry details.",
    },
    parse: {
      status: "pending",
      message: "Waiting to parse the NZTA response.",
    },
    save: {
      status: "pending",
      message: "Waiting to save vehicle details.",
    },
  };
}

export function resolveVehicleNztaSyncDialogSteps(
  steps: VehicleNztaSyncApiSteps | undefined,
  success: boolean
): VehicleNztaSyncDialogSteps {
  const lookupStatus = normalizeSyncStepStatus(steps?.lookup?.status, success ? "success" : "failed");
  const parseStatus = normalizeSyncStepStatus(
    steps?.parse?.status,
    success ? "success" : lookupStatus === "failed" ? "pending" : "failed"
  );
  const saveStatus = normalizeSyncStepStatus(
    steps?.save?.status,
    success ? "success" : lookupStatus === "failed" || parseStatus === "failed" ? "pending" : "failed"
  );

  return {
    lookup: {
      status: lookupStatus,
      message: steps?.lookup?.message || defaultSyncMessage("lookup", lookupStatus),
    },
    parse: {
      status: parseStatus,
      message: steps?.parse?.message || defaultSyncMessage("parse", parseStatus),
    },
    save: {
      status: saveStatus,
      message: steps?.save?.message || defaultSyncMessage("save", saveStatus),
    },
  };
}

function normalizeSyncStepStatus(
  value: string | undefined,
  fallback: VehicleNztaSyncUiStatus
): VehicleNztaSyncUiStatus {
  if (value === "success" || value === "failed" || value === "pending" || value === "in_progress") {
    return value;
  }

  return fallback;
}

function defaultSyncMessage(target: "lookup" | "parse" | "save", status: VehicleNztaSyncUiStatus) {
  if (target === "lookup") {
    if (status === "success") return "NZTA lookup completed.";
    if (status === "failed") return "NZTA lookup failed.";
    if (status === "in_progress") return "Querying NZTA for vehicle expiry details.";
    return "Waiting to start the NZTA lookup.";
  }

  if (target === "parse") {
    if (status === "success") return "NZTA response parsed.";
    if (status === "failed") return "Failed to parse the NZTA response.";
    if (status === "in_progress") return "Parsing the NZTA response.";
    return "Waiting to parse the NZTA response.";
  }

  if (status === "success") return "Vehicle details saved.";
  if (status === "failed") return "Failed to save vehicle details.";
  if (status === "in_progress") return "Saving vehicle details.";
  return "Waiting to save vehicle details.";
}
