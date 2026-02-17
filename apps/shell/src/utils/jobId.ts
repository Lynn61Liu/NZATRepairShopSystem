import { formatNzDate } from "./date";

const JOB_ID_PREFIX = "JOB";

function hashStringToBase36(input: string) {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash * 31 + input.charCodeAt(i)) | 0;
  }
  const normalized = Math.abs(hash);
  return normalized.toString(36).toUpperCase();
}

function getJobSuffix(id: string) {
  const raw = String(id ?? "").trim();
  const digits = raw.replace(/\D/g, "");
  if (digits) {
    const base36 = BigInt(digits).toString(36).toUpperCase();
    return base36.slice(-4).padStart(4, "0");
  }
  const base36 = hashStringToBase36(raw);
  return base36.slice(-4).padStart(4, "0");
}

function getDatePart(createdAt?: string | null) {
  if (createdAt) {
    const match = createdAt.match(/(\d{4})[/-](\d{2})[/-](\d{2})/);
    if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  }
  return formatNzDate(new Date());
}

export function formatJobDisplayId(id: string, createdAt?: string | null) {
  const datePart = getDatePart(createdAt);
  const suffix = getJobSuffix(id);
  return `${JOB_ID_PREFIX}-${datePart}-${suffix}`;
}
