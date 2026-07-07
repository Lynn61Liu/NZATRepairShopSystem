export type PartFlowContactAction = "tel" | "mailto";

export function getPartFlowContactHref(action: PartFlowContactAction, value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return null;
  if (action === "tel") return `tel:${trimmed.replace(/\s+/g, "")}`;
  return `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(trimmed)}`;
}
