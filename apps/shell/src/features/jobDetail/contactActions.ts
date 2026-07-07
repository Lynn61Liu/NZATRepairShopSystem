export type CustomerContactAction = "tel" | "sms" | "email";

export function getCustomerContactHref(action: CustomerContactAction, value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return null;
  if (action === "email") {
    return `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(trimmed)}`;
  }
  return `${action}:${trimmed.replace(/\s+/g, "")}`;
}
