import type { WofRecord } from "@/types";

export function mapWofRecord(record: any): WofRecord {
  return {
    id: String(record?.id ?? ""),
    jobId: record?.jobId ? String(record.jobId) : undefined,
    occurredAt: record?.occurredAt ?? record?.date ?? "",
    rego: record?.rego ?? "",
    makeModel: record?.makeModel ?? "",
    odo: record?.odo ?? "",
    recordState: record?.recordState ?? record?.result ?? null,
    isNewWof: record?.isNewWof ?? null,
    authCode: record?.authCode ?? "",
    checkSheet: record?.checkSheet ?? "",
    csNo: record?.csNo ?? "",
    wofLabel: record?.wofLabel ?? "",
    labelNo: record?.labelNo ?? "",
    failReasons: record?.failReasons ?? record?.failReason ?? "",
    previousExpiryDate: record?.previousExpiryDate ?? record?.recheckExpiryDate ?? "",
    organisationName: record?.organisationName ?? "",
    excelRowNo: record?.excelRowNo ?? record?.sourceRow ?? "",
    sourceFile: record?.sourceFile ?? record?.source ?? "",
    note: record?.note ?? "",
    wofUiState: record?.wofUiState ?? null,
    importedAt: record?.importedAt ?? "",
    updatedAt: record?.updatedAt ?? "",
    source: record?.source ?? record?.sourceFile ?? "excel",
  };
}
