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
      message: "等待发起 NZTA 查询。",
    },
    parse: {
      status: "pending",
      message: "等待解析 NZTA 返回数据。",
    },
    save: {
      status: "pending",
      message: "等待写入车辆资料。",
    },
  };
}

export function createSyncingVehicleNztaSyncSteps(): VehicleNztaSyncDialogSteps {
  return {
    lookup: {
      status: "in_progress",
      message: "已打开专用 Chrome。请在窗口中完成 NZTA 验证，系统会自动继续。",
    },
    parse: {
      status: "pending",
      message: "等待解析 NZTA 返回数据。",
    },
    save: {
      status: "pending",
      message: "等待写入车辆资料。",
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
    if (status === "success") return "NZTA 查询完成。";
    if (status === "failed") return "NZTA 查询失败。";
    if (status === "in_progress") return "正在向 NZTA 查询车辆到期信息。";
    return "等待发起 NZTA 查询。";
  }

  if (target === "parse") {
    if (status === "success") return "NZTA 返回数据解析完成。";
    if (status === "failed") return "解析 NZTA 返回数据失败。";
    if (status === "in_progress") return "正在解析 NZTA 返回数据。";
    return "等待解析 NZTA 返回数据。";
  }

  if (status === "success") return "车辆资料写入完成。";
  if (status === "failed") return "写入车辆资料失败。";
  if (status === "in_progress") return "正在写入车辆资料。";
  return "等待写入车辆资料。";
}
