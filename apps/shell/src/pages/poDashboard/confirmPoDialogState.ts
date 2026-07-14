import type { StepProgressItem, StepProgressStatus } from "@/components/common/StepProgressDialog";
import type { ConfirmPoResponse, PoTodoStepResult } from "@/features/poTodo/poTodo.types";

type ConfirmPoApiSteps = ConfirmPoResponse["steps"];
type ConfirmPoStepKey = "xero" | "xeroStatus" | "gmail" | "savePo" | "poState";

const STEP_LABELS: Record<ConfirmPoStepKey, string> = {
  xero: "更新 Xero 中",
  xeroStatus: "更新 Xero 状态",
  gmail: "添加 Gmail Label",
  savePo: "保存 PO Number",
  poState: "更新 PO 状态",
};

export function createConfirmingPoSteps(): StepProgressItem[] {
  return [
    {
      label: STEP_LABELS.xero,
      status: "in_progress",
      message: "正在更新 Xero reference。",
    },
    {
      label: STEP_LABELS.xeroStatus,
      status: "pending",
      message: "等待更新 Xero invoice 为 Waiting Payment。",
    },
    {
      label: STEP_LABELS.gmail,
      status: "pending",
      message: "等待添加 Gmail label。",
    },
    {
      label: STEP_LABELS.savePo,
      status: "pending",
      message: "等待保存 PO number。",
    },
    {
      label: STEP_LABELS.poState,
      status: "pending",
      message: "等待更新 PO 状态。",
    },
  ];
}

export function resolveConfirmPoSteps(steps: ConfirmPoApiSteps | undefined, success: boolean): StepProgressItem[] {
  const xeroStatus = normalizeConfirmPoStepStatus(steps?.xero?.status, success ? "success" : "failed");
  const xeroInvoiceStatus = normalizeConfirmPoStepStatus(
    steps?.xeroStatus?.status,
    success ? "success" : xeroStatus === "failed" ? "pending" : "failed"
  );
  const gmailStatus = normalizeConfirmPoStepStatus(
    steps?.gmail?.status,
    success ? "success" : xeroStatus === "failed" ? "pending" : "failed"
  );
  const savePoStatus = normalizeConfirmPoStepStatus(
    steps?.savePo?.status,
    success ? "success" : xeroStatus === "failed" || gmailStatus === "failed" ? "pending" : "failed"
  );
  const poStateStatus = normalizeConfirmPoStepStatus(
    steps?.poState?.status,
    success ? "success" : savePoStatus === "failed" ? "failed" : "pending"
  );

  return [
    toStep("xero", xeroStatus, steps?.xero),
    toStep("xeroStatus", xeroInvoiceStatus, steps?.xeroStatus),
    toStep("gmail", gmailStatus, steps?.gmail),
    toStep("savePo", savePoStatus, steps?.savePo),
    toStep("poState", poStateStatus, steps?.poState),
  ];
}

export function getConfirmPoErrorMessage(steps: ConfirmPoApiSteps | undefined) {
  const failedStep = ["xero", "xeroStatus", "gmail", "savePo", "poState"]
    .map((key) => steps?.[key])
    .find((step): step is PoTodoStepResult => step?.status === "failed" && Boolean(step.message));

  return failedStep?.message ?? null;
}

function toStep(key: ConfirmPoStepKey, status: StepProgressStatus, step?: PoTodoStepResult): StepProgressItem {
  return {
    label: STEP_LABELS[key],
    status,
    message: step?.message || defaultConfirmPoMessage(key, status),
  };
}

function normalizeConfirmPoStepStatus(value: string | undefined, fallback: StepProgressStatus): StepProgressStatus {
  if (value === "success" || value === "failed" || value === "pending" || value === "in_progress") {
    return value;
  }

  if (value === "running") {
    return "in_progress";
  }

  return fallback;
}

function defaultConfirmPoMessage(key: ConfirmPoStepKey, status: StepProgressStatus) {
  if (key === "xero") {
    if (status === "success") return "Xero reference 更新完成。";
    if (status === "failed") return "更新 Xero reference 失败。";
    if (status === "in_progress") return "正在更新 Xero reference。";
    return "等待更新 Xero reference。";
  }

  if (key === "gmail") {
    if (status === "success") return "Gmail label 添加完成。";
    if (status === "failed") return "添加 Gmail label 失败。";
    if (status === "in_progress") return "正在添加 Gmail label。";
    return "等待添加 Gmail label。";
  }

  if (key === "xeroStatus") {
    if (status === "success") return "Xero invoice 已更新为 Waiting Payment。";
    if (status === "failed") return "更新 Xero invoice 状态失败。";
    if (status === "in_progress") return "正在更新 Xero invoice 为 Waiting Payment。";
    return "等待更新 Xero invoice 为 Waiting Payment。";
  }

  if (key === "savePo") {
    if (status === "success") return "PO number 保存完成。";
    if (status === "failed") return "保存 PO number 失败。";
    if (status === "in_progress") return "正在保存 PO number。";
    return "等待保存 PO number。";
  }

  if (status === "success") return "PO 状态更新完成。";
  if (status === "failed") return "更新 PO 状态失败。";
  if (status === "in_progress") return "正在更新 PO 状态。";
  return "等待更新 PO 状态。";
}
