export type CustomerUpdateUiStatus = "pending" | "in_progress" | "success" | "failed";

export type CustomerUpdateStep = {
  status: CustomerUpdateUiStatus;
  message: string;
};

export type CustomerUpdateSteps = {
  replacement: CustomerUpdateStep;
  invoice: CustomerUpdateStep;
};

export type CustomerUpdateApiSteps = {
  replacement?: { status?: string; message?: string };
  invoice?: { status?: string; message?: string };
};

export function createInitialCustomerUpdateSteps(): CustomerUpdateSteps {
  return {
    replacement: {
      status: "in_progress",
      message: "Updating the Job customer link.",
    },
    invoice: {
      status: "pending",
      message: "Waiting to update Invoice Contact Name.",
    },
  };
}

export function resolveCustomerUpdateSteps(steps: CustomerUpdateApiSteps | undefined): CustomerUpdateSteps {
  const replacementStatus = normalizeStatus(steps?.replacement?.status, "success");
  const invoiceStatus = normalizeStatus(
    steps?.invoice?.status,
    replacementStatus === "failed" ? "pending" : "success"
  );

  return {
    replacement: {
      status: replacementStatus,
      message: steps?.replacement?.message || defaultMessage("replacement", replacementStatus),
    },
    invoice: {
      status: invoiceStatus,
      message: steps?.invoice?.message || defaultMessage("invoice", invoiceStatus),
    },
  };
}

function normalizeStatus(value: string | undefined, fallback: CustomerUpdateUiStatus): CustomerUpdateUiStatus {
  if (value === "pending" || value === "in_progress" || value === "success" || value === "failed") {
    return value;
  }

  return fallback;
}

function defaultMessage(target: "replacement" | "invoice", status: CustomerUpdateUiStatus) {
  if (target === "replacement") {
    if (status === "success") return "The Job customer link has been updated.";
    if (status === "failed") return "Failed to update the Job customer link.";
    if (status === "in_progress") return "Updating the Job customer link.";
    return "Waiting to update the Job customer link.";
  }

  if (status === "success") return "Invoice Contact Name has been updated.";
  if (status === "failed") return "Failed to update Invoice Contact Name.";
  if (status === "in_progress") return "Updating Invoice Contact Name.";
  return "Waiting to update Invoice Contact Name.";
}
