import { normalizePlateInput } from "@/features/newJob/newJob.utils";
import type { CourtesyCarAgreementListItem } from "./types";

function normalizePlate(value: string) {
  return (normalizePlateInput(value) ?? "").trim();
}

function isReturnableStatus(status: CourtesyCarAgreementListItem["status"]) {
  return status === "active" || status === "submitted";
}

function agreementSortKey(item: CourtesyCarAgreementListItem) {
  return item.updatedAt || item.createdAt;
}

export function findReturnableCourtesyCarAgreement(
  items: CourtesyCarAgreementListItem[],
  rawPlate: string
) {
  const plate = normalizePlate(rawPlate);
  if (!plate) return null;

  const candidates = items
    .filter((item) => normalizePlate(item.jobVehiclePlate ?? "") === plate)
    .filter((item) => isReturnableStatus(item.status))
    .sort((left, right) => {
      const dateCompare = agreementSortKey(right).localeCompare(agreementSortKey(left));
      if (dateCompare !== 0) return dateCompare;
      return right.id - left.id;
    });

  return candidates[0] ?? null;
}

export function normalizeCourtesyCarPlate(rawPlate: string) {
  return normalizePlate(rawPlate);
}
