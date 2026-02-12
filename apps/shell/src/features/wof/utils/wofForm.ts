import type { WofCheckItem, WofRecordUpdatePayload } from "@/types";

export type WofFormState = {
  rego: string;
  makeModel: string;
  occurredAt: string;
  odo: string;
  recordState: "" | "Pass" | "Fail" | "Recheck";
  isNewWof: "" | "true" | "false";
  authCode: string;
  checkSheet: string;
  csNo: string;
  wofLabel: string;
  labelNo: string;
  failReasons: string;
  previousExpiryDate: string;
  organisationName: string;
  excelRowNo: string;
  sourceFile: string;
  note: string;
  wofUiState: "" | "Pass" | "Fail" | "Recheck" | "Printed";
  importedAt: string;
  updatedAt: string;
};

export function toWofFormState(record: WofCheckItem): WofFormState {
  return {
    rego: record.rego ?? "",
    makeModel: record.makeModel ?? "",
    occurredAt: record.occurredAt ?? "",
    odo: record.odo ?? "",
    recordState: record.recordState ?? "",
    isNewWof:
      record.isNewWof === null || record.isNewWof === undefined
        ? ""
        : record.isNewWof
          ? "true"
          : "false",
    authCode: record.authCode ?? "",
    checkSheet: record.checkSheet ?? "",
    csNo: record.csNo ?? "",
    wofLabel: record.wofLabel ?? "",
    labelNo: record.labelNo ?? "",
    failReasons: record.failReasons ?? "",
    previousExpiryDate: record.previousExpiryDate ?? "",
    organisationName: record.organisationName ?? "",
    excelRowNo: record.sourceRow ?? "",
    sourceFile: record.source ?? "",
    note: record.note ?? "",
    wofUiState: record.wofUiState ?? "",
    importedAt: record.importedAt ?? "",
    updatedAt: record.updatedAt ?? "",
  };
}

export function buildWofPayload(form: WofFormState): WofRecordUpdatePayload {
  return {
    occurredAt: form.occurredAt || null,
    rego: form.rego || null,
    makeModel: form.makeModel || null,
    odo: form.odo || null,
    recordState: form.recordState || null,
    isNewWof: form.isNewWof === "" ? null : form.isNewWof === "true",
    authCode: form.authCode || null,
    checkSheet: form.checkSheet || null,
    csNo: form.csNo || null,
    wofLabel: form.wofLabel || null,
    labelNo: form.labelNo || null,
    failReasons: form.failReasons || null,
    previousExpiryDate: form.previousExpiryDate || null,
    organisationName: form.organisationName || null,
    excelRowNo: form.excelRowNo ? Number(form.excelRowNo) : null,
    sourceFile: form.sourceFile || null,
    note: form.note || null,
    wofUiState: form.wofUiState || null,
    importedAt: form.importedAt || null,
  };
}

export function createEmptyWofFormState(): WofFormState {
  return {
    rego: "",
    makeModel: "",
    occurredAt: "",
    odo: "",
    recordState: "",
    isNewWof: "",
    authCode: "",
    checkSheet: "",
    csNo: "",
    wofLabel: "",
    labelNo: "",
    failReasons: "",
    previousExpiryDate: "",
    organisationName: "",
    excelRowNo: "",
    sourceFile: "manual",
    note: "",
    wofUiState: "",
    importedAt: "",
    updatedAt: "",
  };
}
