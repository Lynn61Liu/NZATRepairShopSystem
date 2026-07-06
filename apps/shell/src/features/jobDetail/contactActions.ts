export type CustomerContactAction = "tel" | "sms";

export function getCustomerContactHref(action: CustomerContactAction, phone: string | null | undefined) {
  const normalizedPhone = phone?.replace(/\s+/g, "").trim() ?? "";
  if (!normalizedPhone) return null;
  return `${action}:${normalizedPhone}`;
}
