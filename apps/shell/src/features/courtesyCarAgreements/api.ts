import { requestJson, withApiBase } from "@/utils/api";
import type {
  CourtesyCarAgreementDetail,
  CourtesyCarAgreementListItem,
  CourtesyCarAgreementPreviewValidation,
  CourtesyCarAgreementUpdatePayload,
  CourtesyCarVehicle,
  CourtesyCarAgreementAttachment,
} from "./types";

type ApiListResponse<T> = { items?: T[] };
type ApiSingleResponse<T> = { agreement?: T; attachment?: T };
type ApiValidationResponse<T> = { validation?: T };

export async function fetchAvailableCourtesyCars() {
  return requestJson<ApiListResponse<CourtesyCarVehicle>>("/api/courtesy-cars/available", {
    cache: "no-store",
  });
}

export async function fetchCourtesyCarDrafts() {
  return requestJson<ApiListResponse<CourtesyCarAgreementListItem>>("/api/courtesy-cars/drafts");
}

export async function fetchCourtesyCarAgreementHistory() {
  const historyRes = await requestJson<ApiListResponse<CourtesyCarAgreementListItem>>("/api/courtesy-cars/history");
  if (historyRes.ok || historyRes.status !== 404) {
    return historyRes;
  }

  // Some environments still run the older backend build that only exposes
  // `/drafts`. Fall back so the history page can still show existing drafts.
  return requestJson<ApiListResponse<CourtesyCarAgreementListItem>>("/api/courtesy-cars/drafts");
}

export async function deleteCourtesyCarAgreement(agreementId: number | string) {
  return requestJson<{ deleted?: boolean }>(`/api/courtesy-cars/drafts/${agreementId}`, {
    method: "DELETE",
  });
}

export async function returnCourtesyCarAgreement(agreementId: number | string) {
  return requestJson<ApiSingleResponse<CourtesyCarAgreementDetail>>(`/api/courtesy-cars/drafts/${agreementId}/return`, {
    method: "POST",
  });
}

export async function fetchCourtesyCarAgreement(agreementId: number | string) {
  return requestJson<ApiSingleResponse<CourtesyCarAgreementDetail>>(`/api/courtesy-cars/drafts/${agreementId}`);
}

export async function validateCourtesyCarAgreementPreview(agreementId: number | string) {
  return requestJson<ApiValidationResponse<CourtesyCarAgreementPreviewValidation>>(
    `/api/courtesy-cars/drafts/${agreementId}/preview-validation`
  );
}

export async function createCourtesyCarDraft(jobId: number | string, vehicleId: number | string) {
  return requestJson<ApiSingleResponse<CourtesyCarAgreementDetail>>(`/api/courtesy-cars/jobs/${jobId}/drafts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ vehicleId: Number(vehicleId) }),
  });
}

export async function updateCourtesyCarAgreement(agreementId: number | string, payload: CourtesyCarAgreementUpdatePayload) {
  return requestJson<ApiSingleResponse<CourtesyCarAgreementDetail>>(`/api/courtesy-cars/drafts/${agreementId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function uploadCourtesyCarAttachment(
  agreementId: number | string,
  kind: string,
  file: File
) {
  const formData = new FormData();
  formData.append("kind", kind);
  formData.append("file", file);
  return requestJson<{ attachment?: CourtesyCarAgreementAttachment }>(
    `/api/courtesy-cars/drafts/${agreementId}/attachments`,
    {
      method: "POST",
      body: formData,
    }
  );
}

export async function submitCourtesyCarAgreement(agreementId: number | string) {
  return requestJson<ApiSingleResponse<CourtesyCarAgreementDetail>>(`/api/courtesy-cars/drafts/${agreementId}/submit`, {
    method: "POST",
  });
}

export function buildCourtesyCarAgreementUrl(agreementId: number | string) {
  return withApiBase(`/api/courtesy-cars/drafts/${agreementId}`);
}
